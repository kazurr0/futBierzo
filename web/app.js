import {matchGroups, selectedWindow, calendarWindows, quickDates} from './matches.js';
import {selectionState, toggleGroup, normalize, pending, competitionsForCategory} from './selection.js';
import {crestMarkup, matchBadge, handleCrestError} from './crests.js';

document.addEventListener('error', handleCrestError, true);

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const STORAGE = 'futbierzo-selection-v1';
const state = {catalog:null, selected:new Set(), view:'teams', mode:'club', filter:'all', matches:[], request:0, groups:new Map(), expanded:new Set()};
const labels = {scheduled:'Programado',live:'En juego',provisional:'Resultado provisional',halftime:'Descanso',final:'Finalizado',postponed:'Aplazado'};

function notice(text) {
  $('#notice').textContent = text;
  $('#notice').hidden = !text;
}

async function get(path) {
  const response = await fetch(path, {cache:'no-store'});
  if (!response.ok) throw new Error('No se pudieron cargar los datos. Prueba a actualizar.');
  return response.json();
}

function saveSelection() {
  try {localStorage.setItem(STORAGE, JSON.stringify([...state.selected]));}
  catch {notice('El navegador no permite guardar la selección. Se mantendrá mientras esta página esté abierta.');}
  summary();
}

function summary() {
  const clubs = new Set(state.catalog.teams.filter(t => state.selected.has(t.id)).map(t => t.club_id));
  const n = state.selected.size;
  $('#selection-count').textContent = n;
  $('#selection-summary').textContent = n ? `Sigues ${n} ${n === 1 ? 'equipo' : 'equipos'} de ${clubs.size} ${clubs.size === 1 ? 'club' : 'clubes'}` : 'Sin equipos seleccionados';
  $('#all-bierzo').textContent = n === state.catalog.teams.length ? '✓ Sigues todo el Bierzo' : 'Seguir todo el Bierzo';
}

function updateCompetitionFilter() {
  const selected = $('#competition').value;
  const values = competitionsForCategory(state.catalog.teams,$('#category').value);
  $('#competition').innerHTML = '<option value="">Todas las competiciones</option>' +
    values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
  $('#competition').value = values.includes(selected) ? selected : '';
}

function setTeamMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tabs [data-mode]').forEach(button =>
    button.classList.toggle('active', button.dataset.mode === mode));
}

function openLeaguePicker() {
  changeView('teams'); setTeamMode('category');
  $('#search').value = ''; $('#league-help').hidden = false;
  renderTeams(); $('#category').focus();
  $('#category').scrollIntoView({block:'center',behavior:'smooth'});
}
function browseFilteredTeams() {
  if ($('#category').value || $('#competition').value) setTeamMode('category');
  renderTeams();
}

function renderTeams() {
  const term = normalize($('#search').value.trim());
  const category = $('#category').value, competition = $('#competition').value;
  const teams = state.catalog.teams.filter(t => (!category || t.category === category) &&
    (!competition || t.competition === competition) &&
    (!term || normalize(`${t.name} ${t.club_name} ${t.category} ${t.competition}`).includes(term)) &&
    (state.mode !== 'selected' || state.selected.has(t.id)));
  const groups = new Map();
  for (const team of teams) {
    const key = state.mode === 'category' ? team.competition : team.club_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  }
  state.groups = new Map();
  let index = 0;
  const cards = [...groups.entries()].sort((a,b) => {
    const getName = entry => state.mode === 'category' ? entry[0] : entry[1][0].club_name;
    return getName(a).localeCompare(getName(b), 'es');
  }).map(([key, entries]) => {
    const groupId = String(index++);
    const scope = `${state.mode}:${key}`;
    state.groups.set(groupId, entries.map(t => t.id));
    const selection = selectionState(entries.map(t => t.id), state.selected);
    const title = state.mode === 'category' ? key : entries[0].club_name;
    const open = state.expanded.has(scope) || term || state.mode === 'selected' ||
      (state.mode === 'category' && (category || competition));
    return `<details class="club-card" data-scope="${escape(scope)}" ${open ? 'open' : ''}>
      <summary>${crestMarkup(state.mode === 'category' ? null : entries[0], title)}<span class="club-title"><strong>${escape(title)}</strong><small>${entries.length} equipos · ${selection.count} seleccionados</small></span><span class="chevron">⌄</span></summary>
      <label class="all-row"><input type="checkbox" data-group="${groupId}" ${selection.checked ? 'checked' : ''} aria-label="Seleccionar los equipos visibles de ${escape(title)}"><span>${state.mode === 'category' && !term ? 'Seleccionar toda la liga · equipos del Bierzo' : category || competition || term || state.mode === 'selected' ? 'Todos los equipos visibles' : 'Todos sus equipos'}</span></label>
      ${entries.map(t => `<label class="team-row ${state.selected.has(t.id) ? 'selected' : ''}"><input type="checkbox" data-team="${t.id}" ${state.selected.has(t.id) ? 'checked' : ''}>${crestMarkup(t,t.name,'small')}<span>${escape(t.name)}<small>${escape(t.competition)} · ${escape(t.field || 'Campo sin publicar')}</small></span></label>`).join('')}
    </details>`;
  });
  $('#team-list').innerHTML = cards.join('') || `<div class="empty"><h3>${state.mode === 'selected' ? 'Tu grada empieza aquí' : 'No hay coincidencias'}</h3><p>${state.mode === 'selected' ? 'Selecciona tus equipos en «Por club» para encontrarlos juntos en esta sección.' : 'Prueba con otro nombre o cambia los filtros.'}</p></div>`;
  for (const checkbox of document.querySelectorAll('[data-group]')) {
    checkbox.indeterminate = selectionState(state.groups.get(checkbox.dataset.group), state.selected).indeterminate;
  }
  for (const details of document.querySelectorAll('.club-card')) {
    details.addEventListener('toggle', () => details.open ? state.expanded.add(details.dataset.scope) : state.expanded.delete(details.dataset.scope));
  }
  $('#catalog-count').textContent = `${teams.length} equipos`;
  $('#list-title').textContent = {club:'Clubes del Bierzo',category:'Competiciones y categorías',selected:'Tus favoritos'}[state.mode];
  summary();
}

function dateLabel(date) {
  return date ? new Intl.DateTimeFormat('es', {weekday:'short',day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`)) : 'Fecha pendiente';
}

function updateLabel(stamp) {
  if (!stamp) return 'Sin actualización publicada';
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? 'Sin actualización publicada' : `Actualizado ${date.toLocaleString('es', {timeZone:'Europe/Madrid',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
}

function badge(match) {
  if (pending(match)) return `<span class="badge pending">${match.date ? 'Horario pendiente' : 'Fecha y hora pendientes'}</span>`;
  return `<span class="badge ${escape(match.status)}">${labels[match.status] || 'Sin estado'}</span>`;
}

function score(match) {
  return match.score ? match.score.join(' – ') : (match.time || '–');
}

function renderMatches() {
  const matches = state.matches.filter(m => (state.view !== 'live' || ['live','provisional','halftime'].includes(m.status)) &&
    (!$('#match-category').value || new RegExp('(?:^|[^a-z])' + normalize($('#match-category').value) + '(?:$|[^a-z])').test(normalize(m.competition))) &&
    (state.filter !== 'live' || ['live','provisional','halftime'].includes(m.status)) &&
    (state.filter !== 'pending' || pending(m)) && (state.filter !== 'final' || m.status === 'final'));
  const noSelection = $('#only-mine').checked && !state.selected.size;
  const card = m => `<button class="match-card" data-match="${escape(m.id)}" aria-label="Ver ${escape(m.home)} contra ${escape(m.away)}">
    <div class="match-top"><span>${escape(m.competition)}</span>${badge(m)}</div>
    <div class="score-row"><span class="team">${crestMarkup(matchBadge(m,'home',state.catalog),m.home,'match-crest')}${escape(m.home)}</span><span class="score">${escape(score(m))}</span><span class="team">${crestMarkup(matchBadge(m,'away',state.catalog),m.away,'match-crest')}${escape(m.away)}</span></div>
    <div class="match-bottom"><span>${escape(dateLabel(m.date))}${m.time ? ` · ${escape(m.time)}` : ''}</span><small>${escape(m.score ? updateLabel(m.updated_at) : m.field || 'Campo sin publicar')}</small></div>
  </button>`;
  const groups = matchGroups(matches,$('#group-by').value,state.catalog,$('#only-mine').checked ? state.selected : null);
  $('#match-list').innerHTML = groups.map(group => `<section class="match-group">${group.title ? `<h2>${escape(group.title)} <small>${group.items.length} partidos</small></h2>` : ''}<div class="match-grid">${group.items.map(card).join('')}</div></section>`).join('') || `<div class="empty"><h3>${noSelection ? 'Elige tus equipos' : state.view === 'live' ? 'La grada está en espera' : 'Aún no hay partidos para mostrar'}</h3><p>${noSelection ? 'Selecciona equipos en «Mis equipos» o desactiva «Solo mis equipos» para ver todo el Bierzo.' : $('#demo').checked ? 'No hay ejemplos que coincidan con esta selección y estos filtros.' : 'Los partidos aparecerán al importar los datos de la federación. Puedes activar «Ver demostración» para explorar el diseño.'}</p>${noSelection ? '<button class="primary" data-view="teams">Seleccionar equipos</button>' : ''}</div>`;
}

async function loadMatches() {
  const request = ++state.request;
  $('#refresh').disabled = true;
  $('#match-list').innerHTML = '<div class="empty"><p>Cargando partidos…</p></div>';
  try {
    const status = await get('/api/status');
    const demo = $('#demo').checked;
    const windows = calendarWindows(status.windows[0][0]);
    const dates = quickDates(status.windows[0][0]);
    $('#quick-days').innerHTML = `<button class="${!$('#match-day').value ? 'active' : ''}" data-day="">Semana<small>Lun — dom</small></button>` + dates.map((day,index) => `<button class="${$('#match-day').value === day ? 'active' : ''}" data-day="${day}">${['Hoy','Mañana','Sábado','Domingo'][index]}<small>${dateLabel(day)}</small></button>`).join('');
    windows.forEach((window,index) => {$('#period option[value="'+index+'"]').textContent = `${dateLabel(window[0])} — ${dateLabel(window[1])} · 7 días`;});
    const period = $('#match-day').value ? [$('#match-day').value,$('#match-day').value] : selectedWindow(windows,$('#period').value);
    const params = new URLSearchParams({from:period[0],to:period[1]});
    if ($('#only-mine').checked) params.set('teams', [...state.selected].join(','));
    const data = await get(`${demo ? '/api/demo/matches' : '/api/matches'}?${params}`);
    if (request !== state.request) return;
    state.matches = data.matches;
    $('#date-range').textContent = `${dateLabel(period[0])} — ${dateLabel(period[1])}`;
    $('#feed-note').textContent = demo ? 'DEMOSTRACIÓN · Encuentros y resultados ficticios para probar la interfaz.' :
      `${status.last_schedule_collection ? 'Horarios consultados en RFCYLF: ' + new Date(status.last_schedule_collection).toLocaleString('es', {timeZone:'Europe/Madrid'}) : status.last_import ? 'Última importación: ' + new Date(status.last_import).toLocaleString('es', {timeZone:'Europe/Madrid'}) : 'Todavía no se han importado partidos.'} · Conexión del directo pendiente. Los datos ausentes no se interpretan como 0–0.`;
    if (!demo) {
      const clubs = new Set(state.catalog.teams.filter(t => !$('#only-mine').checked || state.selected.has(t.id)).map(t => t.club_id));
      const coverageStart = period[1] >= status.windows[0][0] && period[0] < status.windows[0][0] ? status.windows[0][0] : period[0];
      const covered = [...clubs].filter(id => {
        const rows = (status.schedule_coverage || []).filter(r => r.club_id === id);
        // Only count a club when every requested date has a confirmed query.
        for (let day = new Date(coverageStart+'T12:00:00Z'); day.toISOString().slice(0,10) <= period[1]; day.setUTCDate(day.getUTCDate()+1)) {
          const stamp = day.toISOString().slice(0,10);
          if (!rows.some(r => r.from <= stamp && r.to >= stamp)) return false;
        }
        return true;
      }).length;
      if (covered < clubs.size) $('#feed-note').textContent = `AGENDA INCOMPLETA · ${covered} de ${clubs.size} clubes seleccionados con consulta confirmada del ${dateLabel(coverageStart)} al ${dateLabel(period[1])}. Seleccionar equipos no descarga sus horarios. ` + $('#feed-note').textContent;
    }
    renderMatches();
  } catch (error) {
    if (request !== state.request) return;
    state.matches = [];
    $('#match-list').innerHTML = '<div class="empty"><h3>No se pudo cargar la agenda</h3><p>Comprueba la conexión y pulsa «Actualizar».</p></div>';
    notice(error.message);
  } finally {
    if (request === state.request) $('#refresh').disabled = false;
  }
}

function changeView(view) {
  state.view = view;
  state.filter = 'all';
  for (const button of document.querySelectorAll('.main-nav button')) button.classList.toggle('active', button.dataset.view === view);
  for (const button of document.querySelectorAll('[data-filter]')) button.classList.toggle('active', button.dataset.filter === 'all');
  $('#teams-view').hidden = view !== 'teams';
  $('#matches-view').hidden = view === 'teams';
  $('#match-tabs').hidden = view === 'live';
  $('#heading').textContent = {teams:'Elige a quién seguir.',agenda:'El próximo partido empieza aquí.',live:'Todos juntos en la grada.'}[view];
  $('#subtitle').textContent = {teams:'Un club entero, una categoría o tus equipos favoritos.',agenda:'Dos semanas de fútbol. También los horarios pendientes.',live:'Marcadores publicados y la hora de su última actualización.'}[view];
  if (view !== 'teams') loadMatches();
}

function showDetail(id) {
  const m = state.matches.find(match => match.id === id);
  if (!m) return;
  const lineup = m.lineups ? `<div class="lineups">${['home','away'].map(side => `<div><div class="lineup-team">${crestMarkup(matchBadge(m,side,state.catalog),m[side],'small')}<strong>${escape(m[side])}</strong></div><ul>${(m.lineups[side] || []).map(p => `<li>${escape(p.number)} · ${escape(p.name)}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p>Alineación aún no publicada.</p>';
  const events = m.events?.length ? `<ul>${m.events.map(e => `<li>${escape(e.minute ?? '')} ${escape(e.type)} · ${escape(e.player || '')}</li>`).join('')}</ul>` : '<p>Goleadores, cambios y tarjetas sin publicar.</p>';
  $('#detail-body').innerHTML = `<div class="detail-score"><p>${escape(m.competition)}</p><div class="score-row"><span class="team">${crestMarkup(matchBadge(m,'home',state.catalog),m.home,'match-crest')}${escape(m.home)}</span><span class="score">${escape(score(m))}</span><span class="team">${crestMarkup(matchBadge(m,'away',state.catalog),m.away,'match-crest')}${escape(m.away)}</span></div><p>${escape(labels[m.status])} · ${escape(dateLabel(m.date))}${m.time ? ` · ${escape(m.time)}` : ''}</p></div>
    <section class="detail-section"><h3>Resumen</h3><p>${escape(m.field || 'Campo sin publicar')}<br>${escape(updateLabel(m.updated_at))}<br>Descanso: ${m.halftime_score ? escape(m.halftime_score.join(' – ')) : 'Sin publicar'}</p>${!id.startsWith('demo-') ? `<a href="https://www.rfcylf.es/pnfg/NPcd/NFG_CmpPrevio?cod_primaria=1000120&CodActa=${encodeURIComponent(id)}&cod_acta=${encodeURIComponent(id)}" target="_blank" rel="noopener">Ver ficha en la RFCYLF ↗</a>` : '<p>Partido ficticio de demostración.</p>'}</section><section class="detail-section"><h3>Alineaciones</h3>${lineup}</section><section class="detail-section"><h3>Eventos del partido</h3>${events}</section>`;
  $('#detail').showModal();
}

async function init() {
  try {
    state.catalog = await get('/api/catalog');
    let saved = [];
    try {const raw = JSON.parse(localStorage.getItem(STORAGE) || '[]'); if (Array.isArray(raw)) saved = raw;}
    catch {notice('La selección guardada no se pudo recuperar. Puedes volver a elegir tus equipos.');}
    const validIds = new Set(state.catalog.teams.map(t => t.id));
    state.selected = new Set(saved.filter(id => validIds.has(id)));
    for (const [key, selector] of [['category','#category'],['competition','#competition']]) {
      const values = [...new Set(state.catalog.teams.map(t => t[key]))].sort((a,b) => a.localeCompare(b,'es'));
      $(selector).insertAdjacentHTML('beforeend', values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join(''));
    }
    renderTeams();
    document.addEventListener('click', event => {
      const league = event.target.closest('[data-add-league]');
      if (league) openLeaguePicker();
      const day = event.target.closest('[data-day]');
      if (day) {$('#match-day').value = day.dataset.day;loadMatches();}
      const view = event.target.closest('[data-view]');
      if (view) changeView(view.dataset.view);
      const mode = event.target.closest('[data-mode]');
      if (mode) {setTeamMode(mode.dataset.mode); renderTeams();}
      const filter = event.target.closest('[data-filter]');
      if (filter) {state.filter = filter.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === filter)); renderMatches();}
      const match = event.target.closest('[data-match]');
      if (match) showDetail(match.dataset.match);
    });
    $('#team-list').addEventListener('change', event => {
      const target = event.target;
      if (target.dataset.team) toggleGroup([target.dataset.team], state.selected, target.checked);
      if (target.dataset.group) toggleGroup(state.groups.get(target.dataset.group), state.selected, target.checked);
      saveSelection(); renderTeams();
    });
    $('#search').addEventListener('input', renderTeams);
    $('#category').addEventListener('change', () => {updateCompetitionFilter();browseFilteredTeams();});
    $('#competition').addEventListener('change', browseFilteredTeams);
    $('#all-bierzo').addEventListener('click', () => {toggleGroup(state.catalog.teams.map(t => t.id), state.selected, true); saveSelection(); renderTeams();});
    $('#clear').addEventListener('click', () => {state.selected.clear();saveSelection();renderTeams();});
    $('#go-agenda').addEventListener('click', () => changeView('agenda'));
    for (const selector of ['#demo','#only-mine']) $(selector).addEventListener('change', loadMatches);
    $('#refresh').addEventListener('click', () => {notice('');loadMatches();});
    $('#period').addEventListener('change', () => {$('#match-day').value = '';loadMatches();});
    $('#match-day').addEventListener('change', loadMatches);
    $('#match-category').innerHTML += [...new Set(state.catalog.teams.map(t => t.category))].sort().map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
    $('#match-category').addEventListener('change', renderMatches);
    $('#group-by').addEventListener('change', renderMatches);
    $('#close-detail').addEventListener('click', () => $('#detail').close());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  } catch (error) {notice(error.message);$('#team-list').innerHTML = '<div class="empty"><h3>El catálogo no está disponible</h3><p>Recarga la página cuando vuelva la conexión.</p></div>';}
}
init();
setInterval(() => {
  if (!document.hidden && state.view === 'live' && !$('#refresh').disabled) loadMatches();
}, 30000);
