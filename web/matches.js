import {matchBadge} from './crests.js';
export function calendarWindows(today) {
  const day = new Date(today + 'T12:00:00Z');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const at = offset => {const d = new Date(day); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10);};
  return [[at(0),at(6)],[at(7),at(13)]];
}
export function quickDates(today) {
  const day = new Date(today + 'T12:00:00Z');
  const at = offset => {const d = new Date(day); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10);};
  return [today,at(1),at((6-day.getUTCDay()+7)%7),at((7-day.getUTCDay())%7)];
}
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

const AGE_ORDER = ['Debutantes','Prebenjamines','Benjamines','Alevines','Infantiles','Cadetes','Juveniles','Aficionados'];
export function categoryDivisions(matches,catalog) {
  const rank = title => {const n=AGE_ORDER.findIndex(c=>c.toLowerCase()===title.toLowerCase());return n<0?999:n;};
  return matchGroups(matches,'category',catalog).sort((a,b)=>rank(a.title)-rank(b.title)||a.title.localeCompare(b.title,'es')).map(group=>({...group,divisions:matchGroups(group.items,'division',catalog)}));
}
export function playingCount(matches) {
  return matches.filter(m=>m.status==='live').length;
}
