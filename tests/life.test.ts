import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import type { ExpansionHooks, GameState, LegacyEvent, Person } from "../src/types";

async function api() {
  const module = await import("../src/life").catch(() => null);
  assert.ok(module, "persistent needs and education module must exist");
  return module;
}
const person = (id: string, age: number, state: GameState): Person => ({
  id, name: id, surname: "Valen", sex: "female", skin: "#d3a17b",
  hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", age,
  birthDay: state.day - age * 360, alive: true, generation: 2,
  parents: id === "child" ? [state.apostle.id, "mira"] : [], title: "Família",
});
async function game() {
  const module = await api();
  const state = initialState();
  state.started = true;
  state.phase = "playing";
  state.intro = false;
  state.zone = "village";
  state.apostle.x = 1900;
  state.apostle.y = 1030;
  state.property.owned = state.property.building = true;
  state.apostle.partnerId = "mira";
  state.family = [person("child", 8, state), person("mira", 24, state)];
  state.family[1].partnerId = state.apostle.id;
  state.life = module.createLifeState(state.npcs, state.family, state.apostle);
  const hooks: ExpansionHooks = {
    message: (text, type = "info") => state.messages.push({ id: state.messages.length, text, type }),
    remember: (title, text, emotion, intensity = 60) => state.apostle.memories.push({
      id: String(state.apostle.memories.length), day: state.day, title, text, emotion, intensity,
    }),
    practice: (skill, amount) => state.apostle.skills[skill] = (state.apostle.skills[skill] || 0) + amount,
    nearObject: (id) => id === "property" && state.zone === "village" &&
      Math.hypot(state.apostle.x - 1900, state.apostle.y - 880) <= 190,
    nearNpc: (id) => state.zone === (id === "matron" ? "orphanage" : "village") &&
      !!state.npcs.find(npc => npc.id === id && Math.hypot(npc.x - state.apostle.x, npc.y - state.apostle.y) <= 180),
  };
  return { module, state, hooks };
}
function currency(state: GameState) {
  return state.gold + state.merchantGold + state.economy.civicFunds +
    Object.values(state.economy.npcSavings).reduce((sum, n) => sum + n, 0);
}

test("new campaigns give every NPC persistent needs and only living children education", async () => {
  const { state } = await game();
  assert.deepEqual(state.life.needs.farmer, { hunger: 20, fatigue: 10, goal: "work" });
  assert.deepEqual(Object.keys(state.life.education), ["child"]);
  assert.equal(state.life.education.child.focus, "farming");
  assert.equal(state.life.education.child.guardianId, "mira");
  assert.equal(state.life.heirId, null);
});

test("hunger and fatigue rise while the apostle explores another map", async () => {
  const { module, state, hooks } = await game();
  state.zone = "mine";
  module.processLifeDay(state, hooks);
  assert.equal(state.life.needs.farmer.hunger, 26);
  assert.equal(state.life.needs.farmer.fatigue, 18);
});

test("a hungry NPC purchases actual bread at the market from personal savings", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(npc => npc.id === "farmer")!;
  farmer.x = 1280; farmer.y = 940;
  state.life.needs.farmer.hunger = 80;
  state.economy.npcSavings.farmer = 50;
  const total = currency(state), bread = state.market.bread, merchant = state.merchantGold;
  module.processLifeDay(state, hooks);
  assert.equal(state.market.bread, bread - 1);
  assert.equal(state.life.needs.farmer.hunger, 46);
  assert.ok(state.economy.npcSavings.farmer < 50);
  assert.ok(state.merchantGold > merchant);
  assert.equal(currency(state), total, "meals transfer coins rather than minting them");
});

test("the civic pantry can pay for a hungry citizen using only unreserved coins", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(npc => npc.id === "farmer")!;
  farmer.x = 1280; farmer.y = 940;
  state.life.needs.farmer.hunger = 80;
  state.economy.civicFunds = 10;
  const total = currency(state);
  module.processLifeDay(state, hooks);
  assert.ok(state.economy.civicFunds < 10);
  assert.equal(currency(state), total);
});

test("NPC meals protect the reward of accepted village orders", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(npc => npc.id === "farmer")!;
  farmer.x = 1280; farmer.y = 940;
  state.life.needs.farmer.hunger = 80;
  state.economy.civicFunds = 10;
  state.economy.orders = [{ id: "reserved", title: "Lenha", item: "wood", quantity: 2,
    reward: 10, createdDay: 1, deadline: 4, status: "accepted" }];
  const bread = state.market.bread;
  module.processLifeDay(state, hooks);
  assert.equal(state.economy.civicFunds, 10);
  assert.equal(state.market.bread, bread);
  assert.equal(state.life.needs.farmer.hunger, 86);
});

test("a distant hungry NPC routes to food instead of purchasing remotely", async () => {
  const { module, state, hooks } = await game();
  state.life.needs.farmer.hunger = 80;
  const bread = state.market.bread;
  module.processLifeDay(state, hooks);
  assert.equal(state.market.bread, bread);
  assert.deepEqual(module.npcGoalDestination(state, state.npcs.find(n => n.id === "farmer")!), { x: 1280, y: 940 });
});

test("a routed NPC eats immediately on arrival without waiting another day", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(n => n.id === "farmer")!;
  state.life.needs.farmer.hunger = 72;
  state.economy.npcSavings.farmer = 50;
  const bread = state.market.bread;
  module.updateLifeNeeds(state, hooks);
  assert.equal(state.market.bread, bread);
  farmer.x = 1280; farmer.y = 940;
  module.updateLifeNeeds(state, hooks);
  assert.equal(state.market.bread, bread - 1);
  assert.equal(state.life.needs.farmer.hunger, 32);
  module.updateLifeNeeds(state, hooks);
  assert.equal(state.market.bread, bread - 1);
});

test("hungry needs outrank fatigue; satisfied tired NPCs rest at the inn", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(n => n.id === "farmer")!;
  state.life.needs.farmer.hunger = 75;
  state.life.needs.farmer.fatigue = 80;
  assert.deepEqual(module.npcGoalDestination(state, farmer), { x: 1280, y: 940 });
  state.life.needs.farmer.hunger = 30;
  farmer.x = 1100; farmer.y = 1140;
  assert.deepEqual(module.npcGoalDestination(state, farmer), { x: 1100, y: 1140 });
  module.processLifeDay(state, hooks);
  assert.equal(state.life.needs.farmer.fatigue, 58);
});

test("food scarcity caps hunger and changes mood without killing an NPC", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(n => n.id === "farmer")!;
  farmer.x = 1280; farmer.y = 940;
  state.life.needs.farmer.hunger = 98;
  state.market.bread = 0;
  module.processLifeDay(state, hooks);
  assert.equal(state.life.needs.farmer.hunger, 100);
  assert.match(farmer.mood, /fome/i);
  assert.ok(state.npcs.includes(farmer));
});

test("sharing bread requires the physical NPC and improves trust with a gratitude memory", async () => {
  const { module, state, hooks } = await game();
  const farmer = state.npcs.find(n => n.id === "farmer")!;
  state.inventory.bread = 2;
  state.life.needs.farmer.hunger = 70;
  state.zone = "mine";
  module.executeLifeAction(state, "feed-npc:farmer", hooks);
  assert.equal(state.inventory.bread, 2);
  state.zone = "village";
  state.apostle.x = farmer.x; state.apostle.y = farmer.y;
  const trust = farmer.trust;
  module.executeLifeAction(state, "feed-npc:farmer", hooks);
  assert.equal(state.inventory.bread, 1);
  assert.equal(state.life.needs.farmer.hunger, 35);
  assert.equal(farmer.trust, trust + 5);
  assert.ok(state.apostle.memories.some(memory => memory.emotion === "Gratidão"));
});

test("teaching consumes bread and energy once per day and grows practical education", async () => {
  const { module, state, hooks } = await game();
  state.inventory.bread = 2;
  const stamina = state.apostle.stamina;
  module.executeLifeAction(state, "teach:child", hooks);
  assert.equal(state.inventory.bread, 1);
  assert.equal(state.apostle.stamina, stamina - 8);
  assert.equal(state.life.education.child.practice, 1.5);
  assert.equal(state.life.education.child.bond, 5);
  assert.equal(state.life.education.child.lessons, 1);
  module.executeLifeAction(state, "teach:child", hooks);
  assert.equal(state.inventory.bread, 1);
  assert.equal(state.life.education.child.lessons, 1);
  state.day++;
  module.executeLifeAction(state, "teach:child", hooks);
  assert.equal(state.inventory.bread, 0);
  assert.equal(state.life.education.child.lessons, 2);
});

test("the wisdom blessing speeds an actual lesson", async () => {
  const { module, state, hooks } = await game();
  state.apostle.blessing = "wisdom";
  state.inventory.bread = 1;
  module.executeLifeAction(state, "teach:child", hooks);
  assert.ok(Math.abs(state.life.education.child.practice - 2.1) < 0.0001);
});

test("remote, dead, minor, exhausted and unfed teachers cannot create education", async () => {
  const { module, state, hooks } = await game();
  state.inventory.bread = 1;
  state.zone = "wilderness";
  module.executeLifeAction(state, "teach:child", hooks);
  assert.equal(state.life.education.child.lessons, 0);
  state.zone = "village";
  state.phase = "dead";
  module.executeLifeAction(state, "teach:child", hooks);
  state.phase = "playing"; state.apostle.age = 8;
  module.executeLifeAction(state, "teach:child", hooks);
  state.apostle.age = 16; state.apostle.stamina = 7;
  module.executeLifeAction(state, "teach:child", hooks);
  state.apostle.stamina = 100; state.inventory.bread = 0;
  module.executeLifeAction(state, "teach:child", hooks);
  assert.equal(state.life.education.child.lessons, 0);
});

test("education and guardian assignments require the family home or a nearby spouse", async () => {
  const { module, state, hooks } = await game();
  state.zone = "mine";
  module.executeLifeAction(state, "education:child:mining", hooks);
  assert.equal(state.life.education.child.focus, "farming");
  state.zone = "village";
  module.executeLifeAction(state, "education:child:mining", hooks);
  module.executeLifeAction(state, "guardian:child:aldric", hooks);
  assert.equal(state.life.education.child.focus, "mining");
  assert.equal(state.life.education.child.guardianId, "aldric");
  module.executeLifeAction(state, "guardian:child:child", hooks);
  assert.equal(state.life.education.child.guardianId, "aldric");
});

test("unknown education focuses cannot corrupt a child's learning profile", async () => {
  const { module, state, hooks } = await game();
  module.executeLifeAction(state, "education:child:toString", hooks);
  assert.equal(state.life.education.child.focus, "farming");
  assert.equal(module.executeLifeAction(state, "buy:bread", hooks), false);
});

test("a newborn gets a single profile with a living parent as tutor", async () => {
  const { module, state } = await game();
  const newborn = person("newborn", 0, state);
  newborn.parents = [state.apostle.id, "mira"];
  state.family.push(newborn);
  module.registerChildEducation(state, newborn);
  assert.equal(state.life.education.newborn.guardianId, "mira");
  state.life.education.newborn.practice = 2;
  module.registerChildEducation(state, newborn);
  assert.equal(state.life.education.newborn.practice, 2);
});

test("guardians must be living adults and a dead family NPC is ineligible", async () => {
  const { module, state, hooks } = await game();
  state.family.find(person => person.id === "mira")!.alive = false;
  assert.ok(!module.availableGuardians(state).some(guardian => guardian.id === "mira"));
  assert.ok(!module.availableGuardians(state).some(guardian => guardian.id === "child"));
  assert.ok(!module.availableGuardians(state).some(guardian => guardian.id === state.apostle.id));
  module.executeLifeAction(state, "guardian:child:mira", hooks);
  assert.equal(state.life.education.child.guardianId, "mira", "rejection preserves the existing selection until daily reconciliation");
  module.processLifeDay(state, hooks);
  assert.equal(state.life.education.child.guardianId, null);
});

test("daily guardian practice needs an occupied built home and a nearby living guardian", async () => {
  const { module, state, hooks } = await game();
  state.life.education.child.guardianId = "farmer";
  const farmer = state.npcs.find(npc => npc.id === "farmer")!;
  farmer.x = 1900; farmer.y = 1030;
  module.processLifeDay(state, hooks);
  assert.equal(state.life.education.child.practice, 0.15);
  state.property.building = false;
  module.processLifeDay(state, hooks);
  assert.equal(state.life.education.child.practice, 0.15);
});

test("preferred heirs are restricted to the current living spouse or direct children", async () => {
  const { module, state, hooks } = await game();
  state.family.push(person("stranger", 22, state));
  module.executeLifeAction(state, "heir:stranger", hooks);
  assert.equal(state.life.heirId, null);
  module.executeLifeAction(state, "heir:child", hooks);
  assert.equal(state.life.heirId, "child");
  state.family.find(p => p.id === "child")!.alive = false;
  module.processLifeDay(state, hooks);
  assert.equal(state.life.heirId, null);
});

test("educated successors gain bounded practical skills and a valid regent", async () => {
  const { module, state } = await game();
  const successor = structuredClone(state.apostle);
  Object.assign(successor, state.family.find(p => p.id === "child"));
  state.life.education.child.focus = "mining";
  state.life.education.child.practice = 60;
  const baseIntelligence = successor.attributes.intelligence;
  module.applyEducationToSuccessor(state, successor);
  assert.equal(successor.skills.mining, 60);
  assert.ok(successor.attributes.intelligence > baseIntelligence);
  assert.ok(successor.attributes.intelligence <= baseIntelligence + 4);
  assert.equal(state.life.guardianId, "mira");
});

test("a minor successor without a formal tutor gets an eligible trusted adult", async () => {
  const { module, state } = await game();
  const successor = structuredClone(state.apostle);
  Object.assign(successor, state.family.find(p => p.id === "child"));
  state.life.education.child.guardianId = null;
  state.family.find(p => p.id === "mira")!.alive = false;
  module.applyEducationToSuccessor(state, successor);
  assert.ok(state.life.guardianId);
  assert.notEqual(state.life.guardianId, "mira");
  assert.notEqual(state.life.guardianId, successor.id);
});

test("legacy history stores dated estate snapshots and stays bounded", async () => {
  const { module, state } = await game();
  for (let i = 0; i < 90; i++) {
    const event: LegacyEvent = { day: i + 1, kind: "education", personId: "child",
      relatedId: state.apostle.id, text: `Lesson ${i}`, gold: 40, property: true };
    module.recordLifeEvent(state, event);
    event.text = "mutated caller";
  }
  assert.equal(state.life.history.length, 80);
  assert.equal(state.life.history[0].day, 11);
  assert.equal(state.life.history[79].text, "Lesson 89");
});

test("title and dead campaigns do not advance needs or teach while not simulating", async () => {
  const { module, state, hooks } = await game();
  state.phase = "title";
  const before = JSON.stringify(state.life);
  module.processLifeDay(state, hooks);
  assert.equal(JSON.stringify(state.life), before);
  state.phase = "dead";
  module.executeLifeAction(state, "education:child:mining", hooks);
  assert.equal(JSON.stringify(state.life), before);
});
