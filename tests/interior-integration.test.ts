import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../src/simulation';
import { INTERIORS } from '../src/interiors';
import { isWalkable } from '../src/navigation';

function game() {
 const game = new GameStore(); game.state.started=true; game.state.phase='playing'; game.state.intro=false;
 game.state.property.owned=true; game.state.property.building=true;
 for(const holding of Object.values(game.state.territory.parcels)){holding.owned=true;holding.building='warehouse';holding.condition=100;holding.registeredDay=game.state.day;}
 return game;
}
for(const room of INTERIORS) test(`physical door enters and leaves ${room.zone} without losing the campaign`,()=>{
 const g=game();g.state.zone=room.entrance.zone;Object.assign(g.state.apostle,room.entrance);
 const before=JSON.stringify({gold:g.state.gold,inventory:g.state.inventory,family:g.state.family,wildlife:g.state.wildlife});
 g.act(`enter:${room.zone}`);assert.equal(g.state.zone,room.zone);
 assert.ok(isWalkable(g.state.apostle,{zone:room.zone,building:true,estates:['oak-hollow','stone-rise']}));
 Object.assign(g.state.apostle,room.exit);g.interact('exit');assert.equal(g.state.zone,room.entrance.zone);
 assert.ok(Math.hypot(g.state.apostle.x-room.entrance.x,g.state.apostle.y-room.entrance.y)<2);
 assert.equal(JSON.stringify({gold:g.state.gold,inventory:g.state.inventory,family:g.state.family,wildlife:g.state.wildlife}),before);
});
test('remote entry and unbuilt private doors cannot bypass physical access',()=>{
 const g=game();g.state.zone='village';Object.assign(g.state.apostle,{x:710,y:760});g.act('enter:forge-room');assert.equal(g.state.zone,'village');
 g.state.property.building=false;Object.assign(g.state.apostle,{x:2090,y:815});g.act('enter:farmhouse-room');assert.equal(g.state.zone,'village');
});
test('NPC interactions cannot cross room boundaries at the same coordinates',()=>{
 const g=game();g.state.zone='inn-room';const n=g.state.npcs.find(n=>n.id==='merchant')!;n.zone='village';Object.assign(n,{x:450,y:500});Object.assign(g.state.apostle,{x:450,y:500});assert.equal(g.interact(n.id),null);
 n.zone='inn-room';assert.equal(g.interact(n.id)?.name,n.name);
});

test('estate station moves real stored goods from inside its own warehouse only',()=>{
 const g=game();g.state.inventory.wood=5;g.state.zone='oak-room';
 const room=INTERIORS.find(r=>r.zone==='oak-room')!,station=room.stations.find(s=>s.id==='oak-hollow')!;
 Object.assign(g.state.apostle,station);g.act('estate-deposit:oak-hollow:wood:1');
 assert.equal(g.state.inventory.wood,4);assert.equal(g.state.territory.parcels['oak-hollow'].storage.wood,1);
 g.act('estate-withdraw:oak-hollow:wood:1');assert.equal(g.state.inventory.wood,5);
 g.state.zone='stone-room';Object.assign(g.state.apostle,station);g.act('estate-deposit:oak-hollow:wood:1');
 assert.equal(g.state.inventory.wood,5,'coordinates in another room do not grant access');
});

test('entry availability and nearby prompt use the real door rather than a building centre',()=>{
 const g=game();g.state.zone='highlands';Object.assign(g.state.apostle,{x:848.63,y:796.65});
 const room=INTERIORS.find(r=>r.zone==='ranger-room')!;
 const option=g.interact('highland-ranger-lodge')?.options.find(o=>o.action==='enter:ranger-room');
 assert.equal(option?.disabled,true,'a visible entry action cannot promise out-of-range entry');
 assert.ok(Math.abs(g.getNearest()!.distance-Math.hypot(g.state.apostle.x-room.entrance.x,g.state.apostle.y-room.entrance.y))<1e-6);
 Object.assign(g.state.apostle,room.entrance);
 assert.equal(g.interact('highland-ranger-lodge')?.options.find(o=>o.action==='enter:ranger-room')?.disabled,false);
 g.act('enter:ranger-room');assert.equal(g.state.zone,'ranger-room');
});
