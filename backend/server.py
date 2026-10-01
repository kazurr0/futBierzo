"""Servidor local de la web y API de solo lectura, sin dependencias externas."""
import argparse
import json
import mimetypes
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo
from backend.store import Store, schedule_windows

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
CATALOG = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
CATALOG['clubs'] = json.loads((ROOT / 'data/clubs.json').read_text(encoding='utf-8'))


def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def send(self, code, content, mime='application/json; charset=utf-8'):
            payload = content if isinstance(content, bytes) else json.dumps(content, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store' if mime.startswith('application/json') else 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            url = urlsplit(self.path)
            query = parse_qs(url.query, keep_blank_values=True)
            today = datetime.now(ZoneInfo('Europe/Madrid')).date()
            windows = schedule_windows(today)
            if url.path == '/api/catalog':
                return self.send(200, CATALOG)
            if url.path == '/api/status':
                return self.send(200, {'last_import': store.last_import(), 'timezone': 'Europe/Madrid',
                    'windows': [[a.isoformat(), b.isoformat()] for a, b in windows],
                    'schedule_coverage':json.loads(store.metadata('schedule_coverage') or '[]'),
                    'automatic_collection': False, 'schedule_collector_available':True,
                    'last_schedule_collection':store.metadata('last_schedule_collection')})
            if url.path in ('/api/matches', '/api/demo/matches'):
                start = query.get('from', [windows[0][0].isoformat()])[0]
                end = query.get('to', [windows[1][1].isoformat()])[0]
                try:
                    a, b = datetime.strptime(start, '%Y-%m-%d'), datetime.strptime(end, '%Y-%m-%d')
                    if a > b or (b - a).days > 31:
                        raise ValueError()
                except ValueError:
                    return self.send(400, {'error': 'Rango de fechas inválido; máximo 32 días'})
                ids = set(query['teams'][0].split(',')) if 'teams' in query else None
                if url.path == '/api/demo/matches':
                    from backend.demo import demo_matches
                    items = [m for m in demo_matches(CATALOG, today) if
                             (not m.get('date') or start <= m['date'] <= end) and
                             (ids is None or set(m['team_ids']) & ids)]
                else:
                    items = store.matches(start, end, ids)
                return self.send(200, {'matches': items, 'demo': url.path.startswith('/api/demo/')})
            if url.path.startswith('/api/'):
                return self.send(404, {'error': 'Ruta desconocida'})
            relative = url.path.lstrip('/') or 'index.html'
            target = (WEB / relative).resolve()
            if not target.is_relative_to(WEB) or not target.is_file():
                return self.send(404, {'error': 'Archivo no encontrado'})
            mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
            if target.suffix in ('.js', '.css', '.html', '.svg'):
                mime += '; charset=utf-8'
            self.send(200, target.read_bytes(), mime)
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--db', default=str(ROOT / 'data/matches.sqlite'))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(Store(args.db)))
    print(f'futBierzo: http://{args.host}:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
