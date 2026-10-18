import test from "node:test";
import assert from "node:assert/strict";
import { GameStore, initialState } from "../src/simulation";

function game() {
  const store = new GameStore();
  store.state.started = true; store.state.phase = "playing"; store.state.intro = false;
  store.state.zone = "village"; store.state.minutes = 12 * 60;
  return store;
}

test("GameStore nearest, interaction and choices resolve the authoritative moving animal", () => {
  const store = game(), dog = store.state.wildlife.animals["dog-1"];
  Object.assign(store.state.apostle, { x: dog.x, y: dog.y });
  assert.equal(store.getNearest()?.id, "animal:dog-1");
  assert.equal(store.interact("animal:dog-1")?.name, "Bento");
  store.state.inventory.bread = 2;
  assert.match(store.choose("animal-feed:dog-1")!.text, /Já recebeu alimento hoje/);
  assert.equal(store.state.inventory.bread, 1);
  assert.equal(store.choose("animal-observe:dog-1")!.options[0].disabled, true);
  dog.x += 200;
  assert.equal(store.choose("animal-feed:dog-1"), null);
  assert.equal(store.state.inventory.bread, 1);
});

test("GameStore tick advances animals once and reset restores the initial population", () => {
  const store = game(), dog = store.state.wildlife.animals["dog-1"];
  Object.assign(store.state.apostle, { x: dog.x + 100, y: dog.y });
  const before = dog.x;
  store.tick(0.25);
  assert.ok(Math.abs(dog.x - (before + 46 * 0.25)) < 1e-9, "dog movement must occur once per tick");
  store.state.wildlife.observed.push("dog-1"); dog.trust = 90;
  store.reset();
  assert.deepEqual(store.state.wildlife, initialState().wildlife);
});

test("family succession preserves wildlife positions, observation, trust and feeding history", () => {
  const store = game();
  const mira = store.state.npcs.find(npc => npc.id === "mira")!;
  mira.relation = 100; mira.trust = 100;
  Object.assign(store.state.apostle, { x: mira.x, y: mira.y });
  store.act("marry:mira");
  store.state.day = 17;
  store.state.property.owned = store.state.property.building = true;
  Object.assign(store.state.apostle, { x: 2090, y: 815 });
  store.act("child");
  const child = store.state.family.find(person => person.parents.includes(store.state.apostle.id))!;
  assert.ok(child);
  const dog = store.state.wildlife.animals["dog-1"];
  Object.assign(store.state.apostle, { x: dog.x, y: dog.y });
  store.state.inventory.bread = 1;
  store.act("animal-feed:dog-1"); store.act("animal-observe:dog-1");
  const before = structuredClone(store.state.wildlife);
  store.damage(store.state.apostle.maxHp);
  store.act(`succeed:${child.id}`);
  assert.equal(store.state.apostle.id, child.id);
  assert.deepEqual(store.state.wildlife, before);
});
