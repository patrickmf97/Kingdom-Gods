import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { validateState } from "../src/persistence";

function game() {
  const g = new GameStore();
  g.create({ name:"Aelia", surname:"Valen", sex:"female", skin:"#d3a17b", hair:"#493327", eyes:"#7ca078", outfit:"#6d8866", blessing:"vigor" });
  g.choose("leave-orphanage");
  Object.assign(g.state.apostle,{x:450,y:790});g.interact("exit");
  return g;
}

test("new campaigns include persistent tools, resources, family education and needs",()=>{
  const g=game();
  assert.equal(g.state.version,4);
  assert.equal(g.state.frontier.tools.pickaxe.owned,false);
  assert.ok(g.state.life.needs.farmer);
  assert.equal(g.state.apostle.skills.woodcutting,0);
});

test("portals require a physical approach and connect village, wilderness and mine both ways",()=>{
  const g=game();
  g.act("travel:wild-gate");assert.equal(g.state.zone,"village");
  Object.assign(g.state.apostle,{x:2170,y:1660});
  g.act("travel:wild-gate");assert.equal(g.state.zone,"wilderness");
  Object.assign(g.state.apostle,{x:2250,y:490});
  g.act("travel:wild-mine");assert.equal(g.state.zone,"mine");
  Object.assign(g.state.apostle,{x:400,y:1000});
  g.act("travel:mine-exit");assert.equal(g.state.zone,"wilderness");
  Object.assign(g.state.apostle,{x:400,y:1820});
  g.act("travel:wild-village");assert.equal(g.state.zone,"village");
  assert.ok(g.state.frontier.discovered.includes("wild-mine"));
});

test("movement interrupts extraction without awarding an unfinished vein",()=>{
  const g=game();
  Object.assign(g.state.apostle,{x:1280,y:850});g.act("buy-tool:pickaxe");
  g.state.zone="mine";Object.assign(g.state.apostle,{x:270,y:280});
  const ore=g.state.inventory.ore;
  g.act("start-work:mine-iron-west");
  assert.ok(g.state.frontier.work);
  g.tick(0.5);g.move(0,1,0.1);
  assert.equal(g.state.frontier.work,null);
  g.tick(8);assert.equal(g.state.inventory.ore,ore);
});

test("physical work finishes once, wears the tool, and survives a region return",()=>{
  const g=game();
  Object.assign(g.state.apostle,{x:1280,y:850});g.act("buy-tool:pickaxe");
  g.state.zone="mine";Object.assign(g.state.apostle,{x:270,y:280});
  g.act("start-work:mine-iron-west");
  for(let i=0;i<60;i++)g.tick(0.1);
  assert.ok(g.state.inventory.ore>=2);
  assert.ok(g.state.frontier.tools.pickaxe.durability<100);
  const ore=g.state.inventory.ore;g.tick(5);
  assert.equal(g.state.inventory.ore,ore);
});

test("education, death and a child succession preserve a valid campaign and enforce regency",()=>{
  const g=game();
  const mira=g.state.npcs.find(npc=>npc.id==="mira")!;
  mira.relation=100;mira.trust=100;
  Object.assign(g.state.apostle,{x:mira.x,y:mira.y});
  g.act("marry:mira");
  g.state.day=17;g.state.property.owned=true;g.state.property.building=true;
  Object.assign(g.state.apostle,{x:2090,y:815});
  g.act("child");
  const child=g.state.family.find(person=>person.parents.includes(g.state.apostle.id))!;
  assert.ok(child);
  g.state.inventory.bread=4;
  g.act(`education:${child.id}:mining`);g.act(`teach:${child.id}`);g.act(`heir:${child.id}`);
  assert.equal(g.state.life.education[child.id].practice,1.5);
  assert.ok(validateState(g.state),"a taught child and preferred successor should save");
  g.damage(g.state.apostle.maxHp);
  assert.ok(validateState(g.state),"the death snapshot should save");
  g.act(`succeed:${child.id}`);
  assert.equal(g.state.apostle.id,child.id);
  assert.equal(g.state.apostle.skills.mining,1.5);
  assert.ok(g.state.life.guardianId);
  assert.ok(validateState(g.state),"the educated minor successor should save");
  const gold=g.state.gold;g.state.property.owned=false;g.state.gold=1000;
  Object.assign(g.state.apostle,{x:1900,y:900});g.act("acquire-property");
  assert.equal(g.state.property.owned,false,"minors cannot purchase land without adulthood");
  g.state.gold=gold;
});
