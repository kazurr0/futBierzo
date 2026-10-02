import {normalize} from './selection.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function initials(name) {
  const clean = name.replace(/\b(?:C\.D\.F\.|C\.D\.|S\.D\.|S\.A\.D\.)/gi, '').trim();
  return clean.split(/\s+/).filter(Boolean).slice(0,2).map(word => word[0]).join('').toLocaleUpperCase('es') || 'FB';
}

export function crestURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.rfcylf.es' &&
      url.pathname.startsWith('/pnfg/pimg/Clubes/') ? url.href : null;
  } catch {return null;}
}

export function crestMarkup(team, name, size = '') {
  const url = crestURL(team?.crest_url);
  // The adjacent team name is the accessible label; the badge is decorative.
  return `<span class="crest ${size} ${url ? 'has-image' : ''}" aria-hidden="true"><span class="crest-fallback">${escape(initials(name))}</span>${url ? `<img data-crest src="${escape(url)}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
}

export function matchTeam(match, side, teams) {
  const explicit = match[`${side}_team_id`];
  if (explicit) return teams.find(team => team.id === explicit) || null;
  // Never assume team_ids[0] is local: the away team may be the only Bierzo team.
  const candidates = teams.filter(team => match.team_ids.includes(team.id) && normalize(team.name) === normalize(match[side]));
  return candidates.length && new Set(candidates.map(t => t.club_id)).size === 1 ? candidates[0] : null;
}

export function matchBadge(match, side, catalog) {
  const team = matchTeam(match, side, catalog.teams);
  if (team || match[`${side}_team_id`]) return team;
  // A club badge does not require inventing a missing team/category identifier.
  const name = normalize(match[side]);
  const base = name.replace(/\s+["“][a-z]["”]$/, '');
  const clubs = (catalog.clubs || []).filter(club =>
    normalize(club.name) === base ||
    [club.name, ...(club.team_names || [])].some(alias => normalize(alias) === name));
  return clubs.length === 1 ? clubs[0] : null;
}

export function handleCrestError(event) {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.hasAttribute('data-crest')) {
    image.parentElement.classList.remove('has-image');
    image.remove();
  }
}
