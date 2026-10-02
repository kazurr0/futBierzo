import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionState, toggleGroup, normalize, pending, competitionsForCategory} from '../web/selection.js';

test('partial club selection is indeterminate; deselect affects only visible teams', () => {
  const selected = new Set(['a','other']);
  assert.deepEqual(selectionState(['a','b'],selected), {count:1,checked:false,indeterminate:true});
  toggleGroup(['a','b'], selected, true);
  assert.equal(selectionState(['a','b'],selected).checked,true);
  toggleGroup(['a','b'], selected, false);
  assert.deepEqual([...selected],['other']);
});
test('empty groups are not selected and search ignores accents', () => {
  assert.equal(selectionState([],new Set()).checked,false);
  assert.equal(normalize('UNIÓN Cacabelense'), 'union cacabelense');
});
test('pending times do not classify live or postponed matches as scheduled', () => {
  assert.equal(pending({status:'scheduled',date:'2026-10-03',time:null}),true);
  assert.equal(pending({status:'scheduled',date:null,time:null}),true);
  assert.equal(pending({status:'live',date:null,time:null}),false);
  assert.equal(pending({status:'postponed',date:null,time:null}),false);
});
test('category selection exposes only its competitions, without duplicates, in numeric order', () => {
  const teams = [
    {category:'Infantiles',competition:'3ª Provincial de Infantiles'},
    {category:'Infantiles',competition:'1ª Regional de Infantiles'},
    {category:'Infantiles',competition:'2ª Provincial de Infantiles'},
    {category:'Infantiles',competition:'1ª Regional de Infantiles'},
    {category:'Juveniles',competition:'2ª Regional de Juveniles'}
  ];
  assert.deepEqual(competitionsForCategory(teams,'Infantiles'),['1ª Regional de Infantiles','2ª Provincial de Infantiles','3ª Provincial de Infantiles']);
  assert.equal(competitionsForCategory(teams,'Juveniles').length,1);
  assert.equal(competitionsForCategory(teams,'').length,4);
});
