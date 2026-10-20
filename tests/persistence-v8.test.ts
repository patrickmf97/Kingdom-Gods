import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { migrateState, validateState, validateV7State, saveGame, loadGame, clearSavedGame } from '../src/persistence';
import { exportCampaign, parseCampaign } from '../src/campaign-files';
import { POPULATION_DEFINITIONS, VISITOR_DEFINITIONS } from '../src/population';
import type { GameState } from '../src/types';
import { historicalProjection } from './historical-state';
import { weatherFor } from '../src/weather';
import { initialState } from '../src/simulation';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/v7-earned-public-campaign.json', import.meta.url), 'utf8'));
function oldState(): Record<string, any> { return structuredClone(fixture); }
function current(): GameState {
  const result = migrateState(oldState());
  assert.ok(result);
  assert.equal(result.version, 8);
  assert.equal(validateState(result), true);
  return result;
}
function oldFields(result: GameState, old: Record<string, any>): Record<string, any> {
  const restored = structuredClone(result) as Record<string, any>;
  restored.version = 7;
  delete restored.worldLife;
  restored.npcs = restored.npcs.filter((npc: {id:string}) => old.npcs.some((entry: {id:string}) => entry.id === npc.id));
  for (const id of Object.keys(restored.life.needs)) if (!Object.hasOwn(old.life.needs,id)) delete restored.life.needs[id];
  return restored;
}

test('authentic earned public v7 preserves every old field and remains independent on upgrade', () => {
  const old = oldState(), before = structuredClone(old);
  assert.equal(createHash('sha256').update(readFileSync(new URL('./fixtures/v7-earned-public-campaign.json', import.meta.url))).digest('hex'),
    'df97ccf25b31fe30913b167fbf0ca213c48c7a967fe08e7adee1f8188a02a734');
  assert.equal(validateV7State(old),true);
  assert.equal(old.gold,48); assert.equal(old.npcs.length,6);
  assert.equal(Object.keys(old.frontier.resources).length,67);
  assert.equal(Object.keys(old.wildlife.animals).length,22);
  const result = current();
  assert.deepEqual(oldFields(result,old),before);
  assert.deepEqual(weatherFor(result.day,result.minutes,result.zone),weatherFor(old.day,old.minutes,old.zone));
  assert.deepEqual(old,before);
  assert.equal(result.npcs.length,16);
  assert.equal(Object.keys(result.worldLife.travelers).length,4);
  assert.deepEqual(result.worldLife.storm,{sequence:0,cooldown:12,warning:null,impact:null});
  result.npcs[0].name='Changed';
  result.frontier.resources[Object.keys(result.frontier.resources)[0]].remaining=0;
  assert.deepEqual(old,before);
});

test('v7 corrupt original fields reject before new defaults or replacement can hide them', () => {
  const mutations: ((s:Record<string,any>)=>void)[] = [
    s=>{ delete s.npcs[0].zone; }, s=>{s.npcs[0].zone='future-zone';},
    s=>{delete s.life.needs[s.npcs[0].id];}, s=>{s.economy.civicFunds=-1;},
    s=>{delete s.frontier.resources[Object.keys(s.frontier.resources)[0]];},
    s=>{delete s.wildlife.animals['fox-2'];}, s=>{s.apostle.skills.cooking=NaN;},
  ];
  for (const mutate of mutations) {
    const old=oldState();mutate(old); old.worldLife={must:'never hide corruption'};
    assert.equal(validateV7State(old),false,String(mutate));
    assert.equal(migrateState(old),null,String(mutate));
  }
});

test('v7 reserved extension is archived without interpretation and survives portable JSON', () => {
  const old=oldState(); old.worldLife={travelers:{future:['nested',null,13]},storm:false};
  old.extension={preserved:'outside reserved namespace'};
  const before=structuredClone(old);
  const result=migrateState(old)!; assert.ok(result);
  assert.deepEqual(result.worldLife.legacyExtension,old.worldLife);
  assert.deepEqual(parseCampaign(exportCampaign(result)),result);
  assert.deepEqual(old,before);
});

test('v7 collisions with NPC, dead family and apostle preserve identities and skip registration', () => {
  for (const id of [POPULATION_DEFINITIONS[0].id,VISITOR_DEFINITIONS[0].id]) for (const where of ['npc','family','apostle']) {
    const old=oldState();
    if (where==='npc') old.npcs[0].id=id;
    if (where==='family') old.family.push({...old.apostle,id,alive:false});
    if (where==='apostle') old.apostle.id=id;
    if (where==='npc') {old.life.needs[id]=old.life.needs[fixture.npcs[0].id];delete old.life.needs[fixture.npcs[0].id];}
    const before=structuredClone(old); const result=migrateState(old)!;assert.ok(result,where);
    assert.equal(result.worldLife.residents.includes(id),false,where);
    assert.equal(Object.hasOwn(result.worldLife.travelers,id),false,where);
    assert.deepEqual(oldFields(result,old),before,where);
  }
});

test('v7 original missing NPC identities are not resurrected', () => {
  const old=oldState(); const removed=old.npcs.pop().id;
  const result=migrateState(old)!;assert.ok(result);
  assert.equal(result.npcs.some(n=>n.id===removed),false);
});

test('new purses use only aggregate safe integer headroom without changing old currency', () => {
  for (const room of [0,17,319,320]) {
    const old=oldState(); const other=old.merchantGold+old.economy.civicFunds+old.frontier.escrow+
      Object.values(old.economy.npcSavings).reduce((sum:any,n:any)=>sum+n,0);
    old.gold=Number.MAX_SAFE_INTEGER-(other as number)-room;
    const result=migrateState(old)!;assert.ok(result,String(room));
    const tills=Object.values(result.worldLife.travelers).reduce((sum,t)=>sum+t.gold,0);
    assert.equal(tills,Math.min(room,320));assert.equal(result.gold,old.gold);
    assert.equal(validateState(result),true);
  }
});

test('v8 rejects malformed population fields rather than silently filling them', () => {
  const id=VISITOR_DEFINITIONS[0].id;
  const mutations: ((s:any)=>void)[] = [
    s=>{delete s.worldLife;}, s=>{delete s.worldLife.storm;},
    s=>{s.worldLife.residents.push('invented');},
    s=>{s.worldLife.residents.push(s.worldLife.residents[0]);},
    s=>{s.worldLife.residents.push(id);},
    s=>{s.worldLife.travelers.invented=structuredClone(s.worldLife.travelers[id]);},
    s=>{s.worldLife.travelers[id].routeIndex=3;}, s=>{s.worldLife.travelers[id].routeIndex=.5;},
    s=>{s.worldLife.travelers[id].wait=17;},s=>{s.worldLife.travelers[id].wait=NaN;},
    s=>{s.worldLife.travelers[id].gold=-1;},s=>{s.worldLife.travelers[id].gold=Number.MAX_SAFE_INTEGER;},
    s=>{s.worldLife.travelers[id].stock.bread=.5;}, s=>{delete s.worldLife.travelers[id].stock.ore;},
    s=>{s.worldLife.travelers[id].stock.unknown=1;},
    s=>{s.npcs=s.npcs.filter((n:any)=>n.id!==id);},
    s=>{s.worldLife.legacyExtension={bad:NaN};},
  ];
  const valid=current();
  for(const mutate of mutations){const invalid=structuredClone(valid);mutate(invalid);
    assert.equal(validateState(invalid),false,String(mutate)); assert.equal(migrateState(invalid),null,String(mutate));}
});

test('v8 permits resident references preserved in dead family or the current apostle', () => {
  for (const alive of [false,true]) {
    const s=current(),id=s.worldLife.residents[0];s.npcs=s.npcs.filter(n=>n.id!==id);
    if(alive)s.apostle.id=id;else s.family.push({...s.apostle,id,alive:false});
    assert.equal(validateState(s),true);
  }
});

test('v8 storm warnings and receipts round trip exactly, without weather or time advancement', async () => {
  await clearSavedGame();
  const s=current();s.worldLife.storm={sequence:4,cooldown:42,warning:{id:4,zone:'village',x:600,y:600,remaining:2.25},
    impact:{id:3,zone:'village',x:600,y:600,remaining:.4}};
  assert.equal(validateState(s),true);
  assert.deepEqual(migrateState(s),s);
  assert.deepEqual(parseCampaign(exportCampaign(s)),s);
  const before=structuredClone(s);await saveGame(s);const loaded=await loadGame();
  assert.ok(loaded);assert.deepEqual(loaded.worldLife,s.worldLife);
  assert.equal(loaded.day,s.day);assert.equal(loaded.minutes,s.minutes);assert.deepEqual(s,before);
  await clearSavedGame();
});

test('v8 rejects invalid storm bounds, unsafe event IDs, indoor targets and event aliasing', () => {
  const mutations: ((s:any)=>void)[] = [
    s=>{s.worldLife.storm.sequence=-1;},s=>{s.worldLife.storm.cooldown=51;},
    s=>{s.worldLife.storm.warning.remaining=3.5001;},s=>{s.worldLife.storm.warning.remaining=-.1;},
    s=>{s.worldLife.storm.warning.id=2;},s=>{s.worldLife.storm.warning.id=0;},
    s=>{s.worldLife.storm.warning.zone='inn-room';},s=>{s.worldLife.storm.warning.x=999999;},
    s=>{s.worldLife.storm.warning.x=NaN;},
    s=>{s.worldLife.storm.impact={...s.worldLife.storm.warning,remaining:1.2001};},
    s=>{s.worldLife.storm.impact={...s.worldLife.storm.warning,remaining:.2};},
    s=>{s.worldLife.storm.impact=s.worldLife.storm.warning;},
  ];
  const valid=current();valid.worldLife.storm={sequence:1,cooldown:40,warning:{id:1,zone:'village',x:600,y:600,remaining:3.5},impact:null};
  assert.equal(validateState(valid),true);
  for(const mutate of mutations){const invalid=structuredClone(valid);mutate(invalid);assert.equal(validateState(invalid),false,String(mutate));}
});


test('every historical v1–v6 flow passes its unchanged fields through frozen v7 before v8', () => {
  for (let version=1;version<=6;version++) {
    const old=historicalProjection(oldState() as GameState,version);
    old.futureExtension={historicalVersion:version};
    const before=structuredClone(old),result=migrateState(old);
    assert.ok(result,`v${version}`); assert.equal(result.version,8);
    assert.equal(validateState(result),true);
    assert.deepEqual(historicalProjection(result,version),before,`v${version}`);
    assert.deepEqual(old,before);
  }
});

test('frozen v7 preserves historical acceptance of missing and duplicate NPC identities', () => {
  const old=oldState();old.npcs.pop();old.npcs.push(structuredClone(old.npcs[0]));
  assert.equal(validateV7State(old),true);
  const result=migrateState(old);assert.ok(result);
  assert.deepEqual(oldFields(result,old),old);
});

test('historical projection restores a conflicting archived extension exactly', () => {
  const old=oldState();old.worldLife={future:[1,2,3]};
  const result=migrateState(old);assert.ok(result);
  assert.deepEqual(historicalProjection(result,7),old);
});

test('saved traveler progress, depleted stock and purse resume without refill or arrival settlement', () => {
  const s=current(),id=VISITOR_DEFINITIONS[0].id;
  Object.assign(s.worldLife.travelers[id],{routeIndex:2,wait:7.125,gold:0});
  s.worldLife.travelers[id].stock.bread=0;
  const before=structuredClone(s),loaded=parseCampaign(exportCampaign(s));
  assert.deepEqual(loaded,before);assert.deepEqual(s,before);
});

test('saved target remains valid if later construction occupies its terrain', () => {
  const s=current();s.property.owned=true;s.property.building=true;
  s.worldLife.storm={sequence:1,cooldown:40,warning:{id:1,zone:'village',x:2090,y:750,remaining:2},impact:null};
  assert.equal(validateState(s),true);
});


test('reserved primitive and array extensions retain their exact portable values', () => {
  for (const extension of [null,0,false,'',[],[null,{old:true}]]) {
    const old=oldState();old.worldLife=extension;
    const result=migrateState(old);assert.ok(result);
    assert.deepEqual(result.worldLife.legacyExtension,extension);
    assert.deepEqual(parseCampaign(exportCampaign(result)).worldLife.legacyExtension,extension);
    assert.deepEqual(historicalProjection(result,7),old);
  }
});


test('fresh complete v8 campaigns round trip exactly with all authored population state', () => {
  const s=initialState(),before=structuredClone(s);
  assert.equal(s.version,8);assert.equal(validateState(s),true);
  assert.equal(s.npcs.length,16);
  assert.equal(s.worldLife.residents.length,6);
  assert.equal(Object.keys(s.worldLife.travelers).length,4);
  assert.deepEqual(migrateState(s),before);
  assert.deepEqual(parseCampaign(exportCampaign(s)),before);
  assert.deepEqual(s,before);
});
