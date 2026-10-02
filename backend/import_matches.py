"""Importa un lote normalizado sin exponer escrituras en la API pública."""
import argparse
import json
from pathlib import Path
from backend.store import Store

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    parser.add_argument('--db', type=Path, default=ROOT / 'data/matches.sqlite')
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
    records = json.loads(args.file.read_text(encoding='utf-8-sig'))
    if not isinstance(records, list):
        parser.error('El archivo debe contener una lista de partidos')
    try:
        count = Store(args.db).upsert(records, {t['id'] for t in catalog['teams']})
    except (ValueError, TypeError) as exc:
        parser.error(str(exc))
    print(f'Importados {count} registros. Los partidos anteriores se conservan.')


if __name__ == '__main__':
    main()
