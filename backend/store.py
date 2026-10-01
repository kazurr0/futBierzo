"""Persistencia de partidos; el código de acta identifica el mismo encuentro."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


def schedule_windows(today):
    return [(today, today + timedelta(days=6)),
            (today + timedelta(days=7), today + timedelta(days=13))]


def validate_match(raw):
    if not isinstance(raw, dict):
        raise ValueError('Cada partido debe ser un objeto')
    required = ('id', 'home', 'away', 'competition', 'team_ids', 'status')
    if any(key not in raw for key in required):
        raise ValueError('Faltan campos obligatorios del partido')
    item = dict(raw)
    if not isinstance(item['id'], str) or not item['id'].isdigit():
        raise ValueError('id debe ser el código de acta, como texto numérico')
    if not all(isinstance(item[k], str) and item[k].strip() for k in ('home', 'away', 'competition')):
        raise ValueError('Los nombres y la competición no pueden estar vacíos')
    if item['status'] not in ('scheduled', 'live', 'provisional', 'halftime', 'final', 'postponed'):
        raise ValueError('Estado desconocido')
    if not isinstance(item['team_ids'], list) or not item['team_ids'] or not all(isinstance(x, str) and x.isdigit() for x in item['team_ids']):
        raise ValueError('team_ids debe contener códigos de equipo')
    for side in ('home', 'away'):
        code = item.get(f'{side}_team_id')
        if code is not None and code not in item['team_ids']:
            raise ValueError(f'{side}_team_id debe estar incluido en team_ids')
    item.setdefault('date', None)
    item.setdefault('time', None)
    if item['date'] is not None:
        date.fromisoformat(item['date'])
    if item['time'] is not None:
        datetime.strptime(item['time'], '%H:%M')
    for key in ('score', 'halftime_score'):
        value = item.get(key)
        if value is not None and (not isinstance(value, list) or len(value) != 2 or
                                  any(type(n) is not int or n < 0 for n in value)):
            raise ValueError(f'{key} debe ser [local, visitante] o null')
    if item.get('updated_at') is not None:
        stamp = datetime.fromisoformat(item['updated_at'])
        if stamp.tzinfo is None:
            raise ValueError('updated_at debe incluir zona horaria')
    item.setdefault('source', 'RFCYLF')
    item.setdefault('lineups', None)
    item.setdefault('events', None)
    for key in ('field', 'source'):
        if item.get(key) is not None and not isinstance(item[key], str):
            raise ValueError(f'{key} debe ser texto')
    lineups = item['lineups']
    if lineups is not None:
        if not isinstance(lineups, dict) or set(lineups) - {'home', 'away'}:
            raise ValueError('lineups debe contener home y/o away')
        for players in lineups.values():
            if not isinstance(players, list) or any(not isinstance(p, dict) or
                not isinstance(p.get('name'), str) or type(p.get('number')) is not int for p in players):
                raise ValueError('Los jugadores necesitan nombre y dorsal numérico')
    events = item['events']
    if events is not None and (not isinstance(events, list) or any(not isinstance(e, dict) or
        not isinstance(e.get('type'), str) or not isinstance(e.get('player', ''), str) or
        (e.get('minute') is not None and type(e['minute']) is not int) for e in events)):
        raise ValueError('Formato de eventos inválido')
    return item


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def upsert(self, records, known_ids):
        # Validate the entire batch before changing anything.
        items = [validate_match(r) for r in records]
        if any(set(i['team_ids']) - known_ids for i in items):
            raise ValueError('Hay equipos que no pertenecen al catálogo')
        seen = set()
        with self.connect() as db:
            for item in items:
                if item['id'] in seen:
                    raise ValueError('El lote contiene actas duplicadas')
                seen.add(item['id'])
                old = db.execute('SELECT payload FROM matches WHERE id=?', (item['id'],)).fetchone()
                if old:
                    previous = json.loads(old[0])
                    old_stamp, new_stamp = previous.get('updated_at'), item.get('updated_at')
                    if old_stamp and new_stamp and datetime.fromisoformat(new_stamp) < datetime.fromisoformat(old_stamp):
                        continue
                    # A schedule refresh must not erase details obtained from the live feed.
                    for key in ('score', 'halftime_score', 'lineups', 'events', 'updated_at'):
                        if item.get(key) is None and previous.get(key) is not None:
                            item[key] = previous[key]
                    if item['status'] == 'scheduled' and previous['status'] != 'scheduled':
                        item['status'] = previous['status']
                db.execute('INSERT INTO matches VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                           (item['id'], json.dumps(item, ensure_ascii=False)))
            db.execute('INSERT INTO meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                       ('last_import', datetime.now(timezone.utc).isoformat()))
        return len(items)

    def matches(self, start, end, team_ids=None):
        with self.connect() as db:
            items = [json.loads(row[0]) for row in db.execute('SELECT payload FROM matches')]
        return sorted([m for m in items if (not m.get('date') or start <= m['date'] <= end)
                       and (team_ids is None or set(m['team_ids']) & team_ids)],
                      key=lambda m: (m.get('date') or '9999', m.get('time') or '99:99', m['id']))

    def last_import(self):
        return self.metadata('last_import')

    def metadata(self, key):
        with self.connect() as db:
            row = db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return row[0] if row else None
