import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/simulation';
import { initializePopulation } from '../src/population';
import { availableGuardians, updateLifeNeeds } from '../src/life';
import { updateNpcRoutines } from '../src/npc-routines';
import type { ExpansionHooks } from '../src/types';
async function game() {
  const module = await import('../src/travelers').catch(()=>null); assert.ok(module,'finite physical traveler authority exists');
  const state=initialState(); state.worldLife??={residents:[],travelers:{},storm:{sequence:0,cooldown:12,warning:null,impact:null}};
  initializePopulation(state); Object.assign(state,{started:true,phase:'playing',minutes:720,timeScale:0,zone:'village'});
  const npc=state.npcs.find(n=>n.id==='alpha12-merchant-grain')!; Object.assign(state.apostle,{x:npc.x,y:npc.y});
  let practices=0;
  const hooks:ExpansionHooks={message:()=>{},remember:()=>{},practice:()=>{practices++},nearNpc:()=>true,nearObject:()=>true};
  return {module,state,npc,hooks,practices:()=>practices};
}
test('quote and dialogue are pure and use merchant reserves; buy transfers once with a ledger and practice',async()=>{
  const {module:t,state,npc,hooks,practices}=await game(), trader=state.worldLife.travelers[npc.id];
  state.gold=1000; const before=structuredClone(state), quote=t.travelerQuote(state,npc.id,'bread',true)!;
  assert.equal(quote.stock,trader.stock.bread); assert.ok(t.travelerDialog(state,npc.id)); assert.deepEqual(state,before);
  assert.equal(t.executeTravelerAction(state,`traveler-buy:${npc.id}:bread`,hooks),true);
  assert.equal(state.gold,before.gold-quote.price); assert.equal(trader.gold,before.worldLife.travelers[npc.id].gold+quote.price);
  assert.equal(trader.stock.bread,before.worldLife.travelers[npc.id].stock.bread-1);
  assert.equal(state.inventory.bread,before.inventory.bread+1); assert.equal(practices(),1);
  assert.equal(state.economy.ledger.length,before.economy.ledger.length+1);
});
test('stale remote, exhausted, overflow and forged actions cannot partially mutate trade',async()=>{
  for(const condition of ['remote','zone','stock','till','inventory','money','invalid-item','dead','extra'] as const){
    const {module:t,state,npc,hooks,practices}=await game(), trader=state.worldLife.travelers[npc.id]; state.gold=1000;
    if(condition==='remote')state.apostle.x+=151;
    if(condition==='zone')state.zone='mine';
    if(condition==='stock')trader.stock.bread=0;
    if(condition==='till')trader.gold=Number.MAX_SAFE_INTEGER;
    if(condition==='inventory')state.inventory.bread=Number.MAX_SAFE_INTEGER;
    if(condition==='money')state.gold=0;
    if(condition==='dead')state.family.push({...state.apostle,id:npc.id,alive:false});
    const before=structuredClone({gold:state.gold,inventory:state.inventory,trader,ledger:state.economy.ledger});
    t.executeTravelerAction(state,`traveler-buy:${npc.id}:${condition==='invalid-item'?'banana':'bread'}${condition==='extra'?':forged':''}`,hooks);
    assert.deepEqual({gold:state.gold,inventory:state.inventory,trader,ledger:state.economy.ledger},before,condition);assert.equal(practices(),0);
  }
});
test('sell requires finite merchant cash, preserves total coins, and immediate roundtrip loses money',async()=>{
  const {module:t,state,npc,hooks}=await game(), trader=state.worldLife.travelers[npc.id];state.gold=1000;
  const total=state.gold+trader.gold, gold=state.gold;
  t.executeTravelerAction(state,`traveler-buy:${npc.id}:bread`,hooks);t.executeTravelerAction(state,`traveler-sell:${npc.id}:bread`,hooks);
  assert.equal(state.gold+trader.gold,total);assert.ok(state.gold<gold);
  trader.gold=0;const before=structuredClone(trader), inventory=structuredClone(state.inventory);
  t.executeTravelerAction(state,`traveler-sell:${npc.id}:bread`,hooks);assert.deepEqual(trader,before);assert.deepEqual(state.inventory,inventory);
});
test('visitors cannot guard children and satisfy needs from carried bread in local shelter without public subsidy',async()=>{
  const {state,npc,hooks}=await game(); assert.ok(!availableGuardians(state).some(n=>n.id===npc.id));
  Object.assign(npc,{zone:'camp-room',x:400,y:550});Object.assign(state.life.needs[npc.id],{hunger:80,fatigue:80});
  const money=[state.gold,state.merchantGold,state.economy.civicFunds], bread=state.worldLife.travelers[npc.id].stock.bread;
  updateLifeNeeds(state,hooks);assert.equal(state.worldLife.travelers[npc.id].stock.bread,bread-1);
  assert.ok(state.life.needs[npc.id].hunger<70);assert.ok(state.life.needs[npc.id].fatigue<75);
  assert.deepEqual([state.gold,state.merchantGold,state.economy.civicFunds],money);
});
test('route waits only at its physical destination and crosses doors and regional portals on foot',async()=>{
  const {state,npc}=await game(), traveler=state.worldLife.travelers[npc.id], cache=new Map();
  const start={...npc};updateNpcRoutines(state,.25,cache);assert.equal(npc.zone,start.zone);
  assert.ok(Math.hypot(npc.x-start.x,npc.y-start.y)<=18.51);assert.equal(traveler.routeIndex,0);
  Object.assign(npc,{zone:'inn-room',x:400,y:550});traveler.wait=1;
  updateNpcRoutines(state,.25,cache);assert.equal(traveler.routeIndex,0);assert.equal(traveler.wait,.75);
  for(let i=0;i<3;i++)updateNpcRoutines(state,.25,cache);assert.equal(traveler.routeIndex,1);
  const zones=new Set([npc.zone]);
  for(let i=0;i<1800 && npc.zone!=='camp-room';i++){updateNpcRoutines(state,.25,cache);zones.add(npc.zone);}
  assert.ok(zones.has('village'));assert.ok(zones.has('wilderness'));assert.equal(npc.zone,'camp-room');
});

test('visitors finish a physical three-region circuit without rest advancing their route or restocking',async()=>{
  const {state,npc}=await game(), traveler=state.worldLife.travelers[npc.id], cache=new Map();
  state.npcs=[npc]; traveler.routeIndex=1;traveler.wait=16;
  Object.assign(npc,{zone:'camp-room',x:400,y:550});
  const routeBefore=structuredClone(traveler), positionBefore={zone:npc.zone,x:npc.x,y:npc.y};
  const {processLifeDay}=await import('../src/life'); const hooks:ExpansionHooks={message:()=>{},remember:()=>{},practice:()=>{},nearNpc:()=>false,nearObject:()=>false};
  processLifeDay(state,hooks); assert.deepEqual(traveler,routeBefore);assert.deepEqual({zone:npc.zone,x:npc.x,y:npc.y},positionBefore);
  const zones=new Set<string>();
  for(let i=0;i<2200&&traveler.routeIndex!==0;i++){updateNpcRoutines(state,.25,cache);zones.add(npc.zone);}
  assert.ok(zones.has('wilderness'));assert.ok(zones.has('highlands'));assert.ok(zones.has('ranger-room'));
  assert.equal(traveler.routeIndex,0);assert.deepEqual(traveler.stock,routeBefore.stock);assert.equal(traveler.gold,routeBefore.gold);
});

test('sleep and urgent needs interrupt travel without silently completing a planned stop',async()=>{
  const {state,npc}=await game(), traveler=state.worldLife.travelers[npc.id];
  Object.assign(npc,{zone:'camp-room',x:400,y:550});traveler.routeIndex=1;traveler.wait=10;
  state.minutes=23*60;const {travelerDestination,updateTravelerRoutes}=await import('../src/travelers');
  assert.equal(travelerDestination(state,npc)?.zone,'camp-room');updateTravelerRoutes(state,100000);assert.equal(traveler.wait,10);
  state.minutes=12*60;state.life.needs[npc.id].hunger=80;updateTravelerRoutes(state,1);assert.equal(traveler.wait,10);
  state.life.needs[npc.id].hunger=20;updateTravelerRoutes(state,1);assert.equal(traveler.wait,9);
  state.phase='title';updateTravelerRoutes(state,1);assert.equal(traveler.wait,9);
});

test('both merchant quotes preserve their spread for every item at maximum negotiation',async()=>{
  const {module:t,state,npc,hooks}=await game();state.apostle.skills.trading=100;state.apostle.blessing='fortune';state.gold=10000;
  for(const id of ['alpha12-merchant-grain','alpha12-merchant-trail'])for(const item of Object.keys(state.inventory)){
    const merchant=state.npcs.find(n=>n.id===id)!;Object.assign(merchant,{zone:state.zone,x:npc.x,y:npc.y});
    const key=item as keyof typeof state.inventory,trader=state.worldLife.travelers[id];trader.stock[key]=1;trader.gold=1000;
    const before=state.gold;t.executeTravelerAction(state,`traveler-buy:${id}:${key}`,hooks);t.executeTravelerAction(state,`traveler-sell:${id}:${key}`,hooks);
    assert.ok(state.gold<before,`${id} ${item}`);
  }
});

test('authored residents and visitors have separate resting spots and visitors retain an existing dry room',async()=>{
  const {state}=await game();const {npcRoutineDestination}=await import('../src/npc-routines');
  const {travelerShelter}=await import('../src/travelers');const spots=new Set<string>();state.minutes=23*60;
  for(const npc of state.npcs.filter(n=>n.id.startsWith('alpha12-'))){
    Object.assign(npc,{zone:'village'});const target=npcRoutineDestination(state,npc)!;
    const key=`${target.zone}:${target.x}:${target.y}`;assert.ok(!spots.has(key),`distinct rest for ${npc.id}`);spots.add(key);
  }
  const pilgrim=state.npcs.find(n=>n.id==='alpha12-pilgrim')!;pilgrim.zone='chapel-room';
  assert.equal(travelerShelter(pilgrim).zone,'chapel-room');
});

test('a calendar storm sends residents and travelers to shelter and pauses route countdowns',async()=>{
  const {state,npc}=await game(),{weatherFor}=await import('../src/weather');
  const {npcRoutineDestination}=await import('../src/npc-routines');const {updateTravelerRoutes}=await import('../src/travelers');
  state.day=Array.from({length:360},(_,i)=>i+1).find(day=>weatherFor(day,720,'village').kind==='storm')!;
  assert.ok(state.day);state.minutes=720;
  for(const person of state.npcs.filter(n=>n.id!=='matron'))assert.ok(npcRoutineDestination(state,person)?.zone.endsWith('-room'),person.id);
  Object.assign(npc,{zone:'inn-room',x:400,y:550});const traveler=state.worldLife.travelers[npc.id], wait=traveler.wait;
  updateTravelerRoutes(state,1);assert.equal(traveler.wait,wait);
});
