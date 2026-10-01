import {matchBadge} from './crests.js';
export function selectedWindow(windows, period) {
  return period === 'all' ? [windows[0][0],windows[1][1]] : windows[period === '1' ? 1 : 0];
}
export function matchGroups(matches, mode, catalog, selected = null) {
  const sort = items => [...items].sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99:99').localeCompare(b.time || '99:99') || a.id.localeCompare(b.id));
  if (mode === 'date') return matches.length ? [{title:'',items:sort(matches)}] : [];
  const groups = new Map();
  const allowed = new Set(catalog.teams.filter(t => selected === null || selected.has(t.id)).map(t => t.club_name));
  for (const match of matches) {
    const competition = match.competition_name || match.competition.split(' · ')[0];
    let titles;
    if (mode === 'club') {
      titles = [...new Set(['home','away'].map(side => {
        const badge = matchBadge(match,side,catalog);
        return badge?.club_name || badge?.name;
      }).filter(name => allowed.has(name)))];
      if (!titles.length) titles = ['Club pendiente de identificar'];
    } else if (mode === 'division') {
      const division = competition.match(/^(\d+)[ªº].*?\b(Regional|Provincial)\b/i);
      titles = [division ? `${division[1]}.ª ${division[2]}` : competition];
    } else {
      const category = competition.match(/Prebenjamines|Benjamines|Infantiles|Cadetes|Juveniles|Alevines|Aficionados|Debutantes/i);
      titles = [category ? category[0] : competition];
    }
    for (const title of titles) {
      if (!groups.has(title)) groups.set(title,[]);
      groups.get(title).push(match);
    }
  }
  return [...groups].sort(([a],[b]) => a.localeCompare(b,'es',{numeric:true})).map(([title,items]) => ({title,items:sort(items)}));
}
