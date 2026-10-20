import test from "node:test";
import assert from "node:assert/strict";
import { POPULATION_DEFINITIONS } from "../src/population";
import { GameStore, initialState } from "../src/simulation";
import { updateLifeNeeds, processLifeDay } from "../src/life";
import type { ExpansionHooks } from "../src/types";

const hooks: ExpansionHooks = { message: () => {}, remember: () => {}, practice: () => {}, nearObject: () => false, nearNpc: () => false };
function game() {
  const store = new GameStore();
  Object.assign(store.state, { started: true, phase: "playing", intro: false, zone: "village", minutes: 22 * 60, timeScale: 0 });
  Object.assign(store.state.apostle, { x: 710, y: 760 });
  return store;
}

test("each initial resident has an explicit physical region", () => {
  for (const npc of initialState().npcs) assert.equal(npc.zone,
    POPULATION_DEFINITIONS.find(profile => profile.id === npc.id)?.npc.zone ?? (npc.id === "matron" ? "orphanage" : "village"));
});

test("indoor coordinate coincidence cannot buy food or recover fatigue in another region", () => {
  const store = game(), state = store.state, farmer = state.npcs.find(n => n.id === "farmer")!;
  Object.assign(farmer, { zone: "forge-room", x: 1280, y: 940 });
  Object.assign(state.life.needs.farmer, { hunger: 80, fatigue: 80 });
  state.economy.npcSavings.farmer = 50;
  const bread = state.market.bread;
  updateLifeNeeds(state, hooks);
  assert.equal(state.market.bread, bread);
  assert.equal(state.life.needs.farmer.hunger, 80);
  Object.assign(farmer, { x: 1100, y: 1140 });
  state.life.needs.farmer.hunger = 20;
  updateLifeNeeds(state, hooks);
  assert.equal(state.life.needs.farmer.fatigue, 80);
});

test("a guardian in a different room cannot teach through matching village coordinates", () => {
  const store = game(), state = store.state;
  state.property.owned = state.property.building = true;
  state.family.push({ ...state.apostle, id: "child", age: 8, parents: [state.apostle.id, "mira"] });
  state.life.education.child = { focus: "farming", guardianId: "farmer", practice: 0, bond: 0, lessons: 0, lastLessonDay: 0 };
  Object.assign(state.npcs.find(n => n.id === "farmer")!, { zone: "inn-room", x: 1900, y: 1030 });
  processLifeDay(state, hooks);
  assert.equal(state.life.education.child.practice, 0);
});

test("night routines physically reach a door, settle in separate places, and leave through that door", async () => {
  const module = await import("../src/npc-routines").catch(() => null);
  assert.ok(module, "region-aware routine module exists");
  const { interiorForZone } = await import("../src/interiors");
  const store = game(), state = store.state;
  const resident = state.npcs.find(n => n.id === "merchant")!;
  const start = { x: resident.x, y: resident.y };
  store.tick(.25);
  assert.equal(resident.zone, "village", "a remote schedule boundary does not teleport the citizen indoors");
  assert.ok(Math.hypot(resident.x - start.x, resident.y - start.y) <= 74 * .25 + .01);
  for (let tick = 0; tick < 600; tick++) store.tick(.25);
  const sleeping = state.npcs.filter(n => n.id !== "matron");
  assert.ok(sleeping.every(n => n.zone !== "village"), "all residents reach shelter");
  assert.equal(new Set(sleeping.map(n => `${n.zone}:${Math.round(n.x)}:${Math.round(n.y)}`)).size, sleeping.length);
  const room = interiorForZone(resident.zone)!;
  assert.ok(room);
  state.minutes = 6 * 60;
  store.tick(.25);
  assert.equal(resident.zone, room.zone, "waking walks to the exit before changing region");
  let previous = { ...resident };
  for (let tick = 0; tick < 600 && resident.zone === room.zone; tick++) {
    previous = { ...resident }; store.tick(.25);
  }
  assert.equal(resident.zone, room.entrance.zone);
  assert.ok(Math.hypot(previous.x - room.exit.x, previous.y - room.exit.y) <= 31);
  assert.ok(Math.hypot(resident.x - room.entrance.x, resident.y - room.entrance.y) < 35);
});


test("six o'clock wakes residents, seven starts work, and evening returns them outside before night", async () => {
  const { npcRoutineDestination } = await import("../src/npc-routines");
  const state = game().state, merchant = state.npcs.find(n => n.id === "merchant")!;
  for (const [hour, expected] of [[6, "village"], [7, "inn-room"], [18, "village"], [20, "village"], [22, "inn-room"]] as const) {
    state.minutes = hour * 60;
    assert.equal(npcRoutineDestination(state, merchant)?.zone, expected, `routine at ${hour}:00`);
  }
});

test("a hungry resident leaves its current room through its own door before approaching food", async () => {
  const { interiorForZone } = await import("../src/interiors");
  const store = game(), state = store.state, resident = state.npcs.find(n => n.id === "aldric")!;
  const forge = interiorForZone("forge-room")!;
  Object.assign(resident, { zone: forge.zone, x: 350, y: 550 });
  state.life.needs.aldric.hunger = 80;
  state.economy.npcSavings.aldric = 50;
  const before = state.market.bread;
  store.tick(.25);
  assert.equal(resident.zone, forge.zone);
  assert.equal(state.market.bread, before);
  for (let tick = 0; tick < 600 && resident.zone === forge.zone; tick++) store.tick(.25);
  assert.equal(resident.zone, forge.entrance.zone);
  assert.ok(Math.hypot(resident.x - forge.entrance.x, resident.y - forge.entrance.y) < 25);
  assert.equal(state.market.bread, before);
  for (let tick = 0; tick < 600 && state.market.bread === before; tick++) store.tick(.25);
  assert.equal(resident.zone, "inn-room");
  assert.equal(state.market.bread, before - 1);
});
