export function selectionState(ids, selected) {
  const count = ids.filter(id => selected.has(id)).length;
  return {count, checked: ids.length > 0 && count === ids.length, indeterminate: count > 0 && count < ids.length};
}

export function toggleGroup(ids, selected, checked) {
  for (const id of ids) checked ? selected.add(id) : selected.delete(id);
  return selected;
}

export function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

export function pending(match) {
  return match.status === 'scheduled' && (!match.date || !match.time);
}

export function competitionsForCategory(teams, category) {
  return [...new Set(teams.filter(team => !category || team.category === category).map(team => team.competition))]
    .sort((a,b) => a.localeCompare(b,'es',{numeric:true}));
}
