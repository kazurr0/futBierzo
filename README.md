# futBierzo

Web móvil para elegir equipos del Bierzo y consultar sus partidos. Diseño granate y blanco, con catálogo real del monitor existente de RFCYLF, API de lectura y almacenamiento SQLite.

## Primera versión

- Selección por club, competición/categoría y favoritos. Selección parcial de un club, búsqueda sin acentos y acceso a todos los equipos del Bierzo.
- Escudos de los 26 clubes, asociados a los 194 equipos y mostrados en selección, partidos y detalle. Se cargan desde las imágenes publicadas por RFCYLF y se sustituyen por iniciales si faltan o fallan. No se atribuye el escudo del equipo visitante a un rival que no esté identificado en el catálogo.
- El filtro de competición depende de la categoría: Infantiles muestra Regional 1 y 2 y Provincial 1, 2 y 3 del catálogo. Cambiar de categoría conserva únicamente una competición que siga siendo compatible.
- Elegir una categoría o división abre automáticamente «Por categoría», incluso desde Favoritos, y despliega los equipos. Cada liga permite seleccionar todos los equipos del Bierzo que contiene o marcar equipos individuales.
- `data/clubs.json` añade un registro de escudos por club, independiente de las categorías seguidas. Permite mostrar los escudos de equipos planificados sin código de categoría identificado y de seis clubes rivales externos. Las asociaciones se basan en nombres exactos y fichas verificadas; no se usan coincidencias parciales. En los 27 partidos locales se han comprobado 51 escudos; tres rivales conservan las iniciales pendientes de verificación.
- Preferencias guardadas en el navegador de cada dispositivo; todavía no hay cuentas ni sincronización entre dispositivos.
- Agenda de 14 días y vista de marcadores. Los partidos sin fecha u hora se conservan como pendientes.
- Selector de los primeros siete días, los siguientes siete o los catorce juntos. Agrupación por categoría, división o club, con fecha y hora dentro de cada grupo; también admite una lista cronológica. Al agrupar por club, un partido entre dos clubes seguidos aparece una vez en el grupo de cada club. Los partidos sin fecha siguen visibles en cualquier bloque.
- Detalle con marcador, actualización, descanso, alineaciones y eventos cuando el lote importado los incluya.
- Modo de demostración explícito y separado de los datos reales. Los partidos ficticios no se guardan en la base de datos.
- Manifest y service worker como base de una PWA. El catálogo y los resultados requieren conexión. La instalación depende del navegador y de servir la web por HTTPS (localhost sirve para desarrollo).

**La consulta de horarios RFCYLF ya está disponible por comando; el carrusel del directo y los avisos de Telegram todavía no están conectados.** La API real empieza sin partidos hasta ejecutar una consulta o importación. El catálogo es una instantánea de equipos y categorías; no debe interpretarse como una verificación actual de todos los grupos de competición.

## Ejecutar en Windows o Linux

Python 3.11 o superior. Desde la carpeta del repositorio:

```sh
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m backend.server
```

Abrir http://127.0.0.1:8000. Elegir equipos y entrar en Horarios. Activar «Ver demostración» y quitar «Solo mis equipos» para explorar todos los ejemplos. El servidor escucha solo en el equipo local por defecto.

## Importar partidos normalizados

Para consultar los horarios reales de los próximos 14 días:

```sh
python -m pip install -r requirements-collector.txt
python -m playwright install chromium
python -m backend.rfcylf
# Alternativa en Windows, con Chrome ya instalado:
python -m backend.rfcylf --channel chrome
# Solo un club (ejemplo: Atlético Bembibre):
python -m backend.rfcylf --club 4006 --channel chrome
```

El colector realiza dos consultas de siete días por club, verifica el total de registros y guarda por código de acta. Ante una respuesta incompleta reintenta hasta tres veces; si no consigue un lote válido, interrumpe la importación y conserva los datos anteriores. No interpreta el marcador de la página de horarios: esa información se recogerá del carrusel. Si el catálogo no identifica algún rival, lo registra en `unresolved_teams` y no inventa su código o escudo. La consulta no está programada en segundo plano todavía.

```sh
python -m backend.import_matches ruta/partidos.json
```

Formato: lista JSON de objetos. Ejemplo de estructura **ficticio** (no importar como partido real):

```json
[
  {
    "id": "99999999",
    "home": "Equipo local de ejemplo",
    "away": "Equipo visitante de ejemplo",
    "competition": "Infantiles · Grupo de ejemplo",
    "team_ids": ["16524"],
    "date": "2026-10-03",
    "time": null,
    "status": "scheduled",
    "score": null,
    "halftime_score": null,
    "updated_at": null,
    "lineups": null,
    "events": null
  }
]
```

`id` es el código de acta; `team_ids` contiene los códigos de los equipos del catálogo involucrados. El rival puede pertenecer a otra delegación y no estar en el catálogo. Estados: `scheduled`, `live`, `provisional`, `halftime`, `final`, `postponed`. Las marcas de actualización incluyen zona horaria. La importación valida todo el lote y lo guarda en una transacción. El mismo acta actualiza un partido existente; nunca elimina los no incluidos en el lote. Una actualización de horarios no borra el marcador ni los detalles ya publicados.

`lineups` puede ser `{ "home": [{"number": 1, "name": "Nombre"}], "away": [] }`; `events`, una lista de `{ "minute": 12, "type": "Gol", "player": "Nombre" }`. `null` significa sin publicar. Una alineación no especifica posiciones en el campo; la web la muestra como lista.

Se recomienda incluir `home_team_id` y `away_team_id` para identificar los escudos de cada lado; deben estar incluidos en `team_ids`. Si el rival es ajeno al catálogo, omitir su código y mostrar iniciales. Para lotes anteriores sin esos campos, la web solo asocia un escudo cuando coinciden un código participante y el nombre del equipo sin ambigüedad de club.

## API

- `GET /api/catalog`: equipos y procedencia de la instantánea.
- `GET /api/status`: última importación, los dos bloques de siete días en Europe/Madrid y consultas confirmadas por club y rango (`schedule_coverage`).
- `GET /api/matches?from=2026-10-01&to=2026-10-14&teams=16524,15611`: datos reales importados. Omitir `teams` para todos; `teams=` devuelve ninguno.
- `GET /api/demo/matches`: ejemplos efímeros; admite los mismos filtros.

No hay endpoints públicos de escritura. La importación se ejecuta en el servidor. SQLite, credenciales, perfiles de navegador y tokens quedan fuera de Git.

## Conexión RFCYLF prevista

1. Refrescar catálogo desde el listado de la delegación 9636101 y verificar las ligas/grupos de la temporada.
2. Para horarios, consultar cada club en dos bloques inclusivos: hoy a hoy+6 y hoy+7 a hoy+13. Son 14 fechas, sin solapamiento, respetando el límite de siete días.
3. Para directo, consultar una vez el carrusel general y filtrar los equipos seguidos. No hacer una consulta de carrusel por usuario ni por club.
4. Consultar el detalle por código de acta para alineaciones y eventos disponibles. No deducir descanso del color ni de la hora de actualización.
5. Guardar por acta y fecha de actualización; añadir registro de cambios para enviar avisos de Telegram sin duplicarlos. Los avisos dependerán de la publicación de la federación.

El extractor de horarios se ha comprobado contra consultas reales de dos bloques para Atlético Bembibre y Berciano-Villadepalos, incluyendo hora pendiente y un bloque de cero partidos. Hay pruebas con una captura real de 13 registros. Los listados de más de 200 registros se rechazan hasta implementar la paginación. Quedan pendientes refresco completo del catálogo, consulta del carrusel y validación de los detalles del partido. Esta versión no publica resultados inventados cuando falla una consulta.

## Validación

```sh
python -m pip install -r requirements-collector.txt
python -m unittest discover -s tests -p "test_*.py"
node --test tests/*.test.js
```

## Alojamiento

GitHub guarda el código. Para ejecutar la API y el futuro monitor hace falta un servidor o servicio con Python y almacenamiento persistente. GitHub Pages por sí solo no ejecuta este backend. Antes de publicación: servidor de producción, HTTPS, copias de seguridad y supervisión de las consultas. No copiar `configuracion_bot.json` ni perfiles del monitor antiguo.

Proyecto independiente, sin afiliación oficial a RFCYLF.

Cada respuesta válida se guarda inmediatamente. Si falla un club posterior, los partidos ya importados se conservan. La agenda indica cobertura incompleta para los clubes seleccionados y las fechas futuras del periodo. Seleccionar equipos no ejecuta el recolector automáticamente.
