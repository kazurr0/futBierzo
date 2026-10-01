"""Consultas de horarios por club: dos bloques de siete días, sin borrar datos previos."""
import argparse
import json
import re
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from backend.store import Store, schedule_windows

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE_URL = 'https://www.rfcylf.es/pnfg/NPcd/NFG_LstPartidos?cod_primaria=1000121'


def clean(text):
    return ' '.join(text.replace('\xa0', ' ').split())


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFD', clean(text).casefold()) if not unicodedata.combining(c)).replace('“','"').replace('”','"')


def parse_schedule(html, catalog, start, end):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    text = clean(soup.get_text(' ',strip=True))
    total = re.search(r'Total\s+(\d+)\s+Registros', text, re.I)
    if not total:
        raise ValueError('La respuesta no confirma el total de registros; no se importa')
    if int(total[1]) > 200:
        raise ValueError('Hay más de 200 partidos: es necesario consultar la paginación')
    matches = []
    current_date, competition, group = None, None, None
    for row in soup.select('table tr'):
        cells = row.find_all(['td','th'],recursive=False)
        if not cells:
            continue
        date_header = row.select_one('.tr_partidos')
        if date_header:
            stamp = re.search(r'\d{2}-\d{2}-\d{4}',date_header.get_text())
            current_date = datetime.strptime(stamp[0],'%d-%m-%Y').date().isoformat() if stamp else None
            competition, group = None, None
            continue
        if clean(cells[0].get_text()) == 'Código' and len(cells) >= 2:
            strong = cells[1].find('strong')
            competition = clean(strong.get_text()) if strong else None
            group = clean(cells[1].get_text(' ',strip=True))[len(competition or ''):].strip(' ,')
            continue
        acta = clean(cells[0].get_text())
        if not acta.isdigit():
            continue
        if len(cells) != 8 or not competition:
            raise ValueError(f'Formato de fila desconocido en el acta {acta}')
        names = [clean(part) for part in cells[1].get_text('\n',strip=True).splitlines() if clean(part)]
        if len(names) != 2:
            raise ValueError(f'No se reconocen ambos equipos del acta {acta}')
        if current_date and not start.isoformat() <= current_date <= end.isoformat():
            raise ValueError('La respuesta contiene fechas fuera del rango solicitado')
        match = {'id':acta,'home':names[0],'away':names[1], 'team_ids':[], 'unresolved_teams':[],
                 'competition':f'{competition} · {group}' if group else competition,
                 'competition_name':competition, 'group':group, 'date':current_date,
                 'time':clean(cells[5].get_text()) or None,'field':clean(cells[4].get_text()) or None,
                 'status':'scheduled','score':None,'source':'RFCYLF · Horarios',
                 'observed_at':datetime.now(timezone.utc).isoformat()}
        if match['time'] and not re.fullmatch(r'\d{2}:\d{2}',match['time']):
            raise ValueError(f'Hora desconocida en el acta {acta}')
        for side, name in zip(('home','away'),names):
            candidates = [team for team in catalog['teams'] if normalized(team['name']) == normalized(name)
                          and normalized(team['competition']) == normalized(competition)]
            if len(candidates) == 1:
                match[f'{side}_team_id'] = candidates[0]['id']
                match['team_ids'].append(candidates[0]['id'])
            elif len(candidates) > 1:
                raise ValueError(f'Identidad ambigua: {name} en {competition}')
            else:
                match['unresolved_teams'].append({'side':side,'name':name})
        if not match['team_ids']:
            raise ValueError(f'No se identifica ningún equipo del catálogo en el acta {acta}')
        # Schedule scores are intentionally ignored: direct follow-up uses the carousel.
        matches.append(match)
    if len(matches) != int(total[1]) or len({m['id'] for m in matches}) != len(matches):
        raise ValueError(f'Listado incompleto: {len(matches)} de {total[1]} registros')
    return matches


def fetch_schedule(page, code, start, end, catalog):
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    last_error = None
    for attempt in range(3):
        try:
            page.goto(SCHEDULE_URL,wait_until='domcontentloaded',timeout=60000)
            page.locator('#Club').wait_for()
            # Consent is confined to the collector's temporary, anonymous context.
            try:
                page.get_by_role('button',name='Aceptar todo',exact=True).click(timeout=1500)
            except PlaywrightTimeout:
                pass
            page.locator('input[name="Sch_Fecha_Desde_input"]').fill(start.isoformat())
            page.locator('input[name="Sch_Fecha_Hasta_input"]').fill(end.isoformat())
            page.locator('#Club').select_option(value=code)
            page.locator('#NPcd_PageLines').fill('200')
            with page.expect_navigation(wait_until='domcontentloaded',timeout=60000):
                page.get_by_role('button',name='Consultar',exact=True).click()
            return parse_schedule(page.content(),catalog,start,end)
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'Club {code}, {start} — {end}: {last_error}')


def collect_schedules(catalog, today, club_ids=None, channel=None, headed=False, progress=print, on_result=None):
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
    clubs = {t['club_id']:t['club_name'] for t in catalog['teams']}
    if club_ids is not None:
        if set(club_ids) - clubs.keys():
            raise ValueError('Código de club desconocido')
        clubs = {code:name for code,name in clubs.items() if code in club_ids}
    records = {}
    with sync_playwright() as pw:
        options = {'headless':not headed}
        if channel:
            options['channel'] = channel
        browser = pw.chromium.launch(**options)
        context = browser.new_context(locale='es-ES',timezone_id='Europe/Madrid')
        page = context.new_page()
        page.set_default_timeout(30000)
        try:
            for code, club in clubs.items():
                for start, end in schedule_windows(today):
                    result = fetch_schedule(page,code,start,end,catalog)
                    for item in result:
                        if item['id'] in records:
                            item['team_ids'] = sorted(set(item['team_ids']) | set(records[item['id']]['team_ids']))
                        records[item['id']] = item
                    if on_result:
                        on_result(code,start,end,result)
                    progress(f'{club} · {start} — {end}: {len(result)} partidos',flush=True)
                    time.sleep(2)
        finally:
            browser.close()
    return list(records.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--club',action='append',help='Código de club; repetir para varios. Por defecto todos.')
    parser.add_argument('--today',type=date.fromisoformat,default=datetime.now(ZoneInfo('Europe/Madrid')).date())
    parser.add_argument('--channel',choices=('chrome','msedge'),help='Usar un navegador instalado')
    parser.add_argument('--headed',action='store_true')
    parser.add_argument('--db',type=Path,default=ROOT/'data/matches.sqlite')
    args = parser.parse_args()
    catalog = json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
    try:
        store = Store(args.db)
        def save_result(code,start,end,result):
            store.upsert(result,{t['id'] for t in catalog['teams']})
            coverage = json.loads(store.metadata('schedule_coverage') or '[]')
            coverage = [row for row in coverage if not (row['club_id']==code and row['from']==start.isoformat() and row['to']==end.isoformat())]
            coverage.append({'club_id':code,'from':start.isoformat(),'to':end.isoformat(),'count':len(result)})
            with store.connect() as db:
                db.execute('INSERT INTO meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',('schedule_coverage',json.dumps(coverage)))
        records = collect_schedules(catalog,args.today,args.club,args.channel,args.headed,on_result=save_result)
        count = Store(args.db).upsert(records,{t['id'] for t in catalog['teams']})
        with Store(args.db).connect() as db:
            db.execute('INSERT INTO meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                       ('last_schedule_collection',datetime.now(timezone.utc).isoformat()))
    except Exception as exc:
        parser.exit(1,f'Consulta interrumpida; se conservan los datos anteriores: {exc}\n')
    print(f'Guardados {count} partidos únicos; los pendientes se conservan.')


if __name__ == '__main__':
    main()
