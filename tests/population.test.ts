import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/simulation';

function legacy() {
  const state = initialState();
  state.npcs = state.npcs.filter(n=>!n.id.startsWith('alpha12-'));
  for (const id of Object.keys(state.life.needs)) if (id.startsWith('alpha12-')) delete state.life.needs[id];
  state.worldLife = {residents:[],travelers:{},storm:{sequence:0,cooldown:12,warning:null,impact:null}};
  return state;
}

async function api() {
  const population = await import('../src/population').catch(() => null);
  assert.ok(population, 'authored population module must exist');
  return population;
}

test('population appends exactly six residents and four visitors once, preserving historical identities and needs', async () => {
  const p = await api(), state = legacy();
  const old = structuredClone(state.npcs), needs = structuredClone(state.life.needs);
  p.initializePopulation(state);
  assert.equal(state.worldLife.residents.length, 6);
  assert.equal(Object.keys(state.worldLife.travelers).length, 4);
  assert.deepEqual(state.npcs.filter(n => old.some(o => o.id === n.id)), old);
  for (const [id, need] of Object.entries(needs)) assert.deepEqual(state.life.needs[id], need);
  const snapshot = structuredClone(state); p.initializePopulation(state); assert.deepEqual(state, snapshot);
  for (const d of p.POPULATION_DEFINITIONS) assert.ok(state.life.needs[d.id]);
});

test('occupied NPC, family, apostle IDs are skipped without repurposing or resurrection', async () => {
  const p = await api(), state = legacy();
  const [a,b,c] = p.RESIDENT_DEFINITIONS;
  state.npcs.push({...state.npcs[0], id:a.id, name:'Historical identity'});
  state.family.push({...state.apostle, id:b.id, alive:false});
  state.apostle.id = c.id;
  p.initializePopulation(state);
  assert.equal(state.worldLife.residents.length,3);
  assert.equal(state.npcs.find(n=>n.id===a.id)?.name,'Historical identity');
  assert.ok(!state.npcs.some(n=>n.id===b.id||n.id===c.id));
  assert.equal(p.populationRole(state,a.id),undefined);
});

test('new tills use only remaining aggregate safe integer headroom', async () => {
  const p = await api(), state = legacy();
  state.gold = state.merchantGold = state.economy.civicFunds = state.frontier.escrow = 0;
  state.economy.npcSavings = {legacy:Number.MAX_SAFE_INTEGER-7};
  p.initializePopulation(state);
  assert.equal(Object.values(state.worldLife.travelers).reduce((n,t)=>n+t.gold,0),7);
  assert.equal(state.economy.npcSavings.legacy,Number.MAX_SAFE_INTEGER-7);
});
