import test from 'node:test';
import assert from 'node:assert/strict';
import {crestURL, crestMarkup, matchTeam, matchBadge, initials} from '../web/crests.js';

const teams = [{id:'1',name:'Local',club_id:'10'},{id:'2',name:'Visitante',club_id:'20'}];
test('away-only catalog membership never assigns the away shield to the home team', () => {
  const match = {home:'Otro club',away:'Visitante',team_ids:['2']};
  assert.equal(matchTeam(match,'home',teams),null);
  assert.equal(matchTeam(match,'away',teams).id,'2');
});
test('explicit IDs disambiguate names and incorrect IDs do not use arbitrary matches', () => {
  const match = {home:'Nombre abreviado',home_team_id:'1',team_ids:['1']};
  assert.equal(matchTeam(match,'home',teams).id,'1');
  assert.equal(matchTeam({...match,home_team_id:'999'},'home',teams),null);
});
test('crest URLs accept only the federation image path and fallback escapes names', () => {
  assert.equal(crestURL('https://www.rfcylf.es/pnfg/pimg/Clubes/logo.png'),'https://www.rfcylf.es/pnfg/pimg/Clubes/logo.png');
  for (const value of ['javascript:alert(1)','https://example.com/logo.png','https://www.rfcylf.es.evil.test/pnfg/pimg/Clubes/logo.png','https://www.rfcylf.es/login','not a url']) assert.equal(crestURL(value),null);
  assert.equal(initials('S.D. Ponferradina S.A.D.'),'P');
  assert.ok(!crestMarkup(null,'<script> X').includes('<script>'));
});
test('planned opponents and missing categories resolve via verified club names', () => {
  const clubs = [{id:'30',name:'Otro club',team_names:['Otro club "B"'],crest_url:'verified'}];
  const catalog = {teams,clubs};
  const match = {home:'Otro club "B"',away:'Visitante',team_ids:['2'],status:'scheduled'};
  assert.equal(matchBadge(match,'home',catalog).id,'30');
  assert.equal(matchBadge(match,'away',catalog).id,'2');
  assert.equal(matchBadge({...match,home:'Otro club parecido'},'home',catalog),null);
  assert.equal(matchBadge({...match,home_team_id:'999'},'home',catalog),null);
});
test('ambiguous club names do not assign an arbitrary badge', () => {
  const clubs = [{id:'30',name:'Duplicado'},{id:'31',name:'Duplicado'}];
  assert.equal(matchBadge({home:'Duplicado',team_ids:[]},'home',{teams,clubs}),null);
});
