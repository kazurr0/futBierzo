import test from 'node:test';
import assert from 'node:assert/strict';
import {matchGroups,selectedWindow,calendarWindows,quickDates} from '../web/matches.js';
const catalog={teams:[{id:'1',name:'Local',club_name:'Club A',club_id:'a'},{id:'2',name:'Visitante',club_name:'Club B',club_id:'b'}]};
const base={home:'Local',away:'Visitante',team_ids:['1','2'],home_team_id:'1',away_team_id:'2',competition:'3ª División Provincial de Infantiles',date:'2026-10-03',time:'12:00'};
test('inclusive week boundaries and fourteen-day option',()=>{
  const w=[['2026-10-01','2026-10-07'],['2026-10-08','2026-10-14']];
  assert.deepEqual(selectedWindow(w,'0'),w[0]);assert.deepEqual(selectedWindow(w,'1'),w[1]);assert.deepEqual(selectedWindow(w,'all'),['2026-10-01','2026-10-14']);
});
test('groups sort chronologically and retain pending dates and times',()=>{
  const items=[{...base,id:'1',time:null},{...base,id:'2'},{...base,id:'3',date:null}];
  assert.equal(matchGroups(items,'category',catalog)[0].title,'Infantiles');
  const g=matchGroups(items,'division',catalog)[0];assert.equal(g.title,'3.ª Provincial');assert.deepEqual(g.items.map(m=>m.id),['2','1','3']);
  assert.deepEqual(matchGroups([],'date',catalog),[]);
});
test('each followed club sees its shared fixture once',()=>{
  const groups=matchGroups([{...base,id:'1'}],'club',catalog);assert.deepEqual(groups.map(g=>g.title),['Club A','Club B']);assert(groups.every(g=>g.items.length===1));
  assert.deepEqual(matchGroups([{...base,id:'1'}],'club',catalog,new Set(['2'])).map(g=>g.title),['Club B']);
});

test('calendar weeks run Monday to Sunday across year boundaries',()=>{
 assert.deepEqual(calendarWindows('2026-10-01'),[['2026-09-28','2026-10-04'],['2026-10-05','2026-10-11']]);
 assert.deepEqual(calendarWindows('2027-01-03'),[['2026-12-28','2027-01-03'],['2027-01-04','2027-01-10']]);
 assert.deepEqual(quickDates('2026-10-01'),['2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
});
