import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EffectSimulation, MAX_PARTICLE_CAPACITY, PARTICLE_CAPACITY, PARTICLE_KINDS, ParticlePool, WorldEffects, type ParticleKind } from "../src/three/effects";
import { GameStore, initialState } from "../src/simulation";
import { executeFrontierAction, updateFrontierWork } from "../src/frontier";
import { resourceNode } from "../src/regions";
import type { ExpansionHooks, Zone } from "../src/types";

function stateAt(zone: Zone = "wilderness") {
  const state = initialState();
  state.phase = "playing"; state.zone = zone; state.apostle.age = 22;
  state.apostle.alive = true; state.apostle.stamina = state.apostle.maxStamina;
  state.apostle.x = 760; state.apostle.y = 1300;
  return state;
}
const hooks: ExpansionHooks = { message() {}, remember() {}, practice() {}, nearObject: () => true, nearNpc: () => false };
function working(id: string) {
  const node = resourceNode(id)!;
  const state = stateAt(node.zone);
  state.apostle.x = node.x; state.apostle.y = node.y + 30;
  if (node.tool) state.frontier.tools[node.tool] = { owned: true, durability: 100 };
  executeFrontierAction(state, `start-work:${id}`, hooks);
  assert.ok(state.frontier.work, `real simulation must accept work at ${id}`);
  const effects = new EffectSimulation(); effects.reset(state);
  return { state, effects, node };
}
function countKind(pool: ParticlePool, kind: ParticleKind): number {
  let count = 0;
  for (let i = 0; i < pool.count; i++) if (pool.kinds[i] === PARTICLE_KINDS[kind]) count++;
  return count;
}

test("particle pools reject overflow and invalid values, compact expired slots, and reuse fixed arrays", () => {
  const pool = new ParticlePool(2);
  const positions = pool.positions, life = pool.life;
  assert.equal(new ParticlePool(9999).capacity, MAX_PARTICLE_CAPACITY);
  assert.equal(pool.emit("dust", NaN, 0, 0, 0, 0, 0, 1, 1, 0), false);
  assert.equal(pool.emit("dust", 1, 2, 3, 1, 1, 1, .2, .1, 0), true);
  assert.equal(pool.emit("wood", 4, 5, 6, 0, 1, 0, .1, 1, 2), true);
  assert.equal(pool.emit("spark", 0, 0, 0, 0, 0, 0, 1, 1, 0), false);
  pool.update(.2);
  assert.equal(pool.count, 1);
  assert.equal(pool.kinds[0], PARTICLE_KINDS.wood, "the surviving particle takes the expired dense slot");
  assert.ok(Math.abs(pool.positions[1] - 5.2) < 1e-5);
  assert.equal(pool.emit("spark", 0, 0, 0, 0, 0, 0, 1, 1, 0), true);
  assert.equal(pool.positions, positions); assert.equal(pool.life, life);
  pool.clear(); assert.equal(pool.count, 0);
});

test("zero, negative and invalid delta freeze lifetime and position without buffer churn", () => {
  const pool = new ParticlePool();
  pool.emit("leaf", 1, 2, 3, 1, 1, 1, .2, 1, 1);
  const positions = [...pool.positions], life = [...pool.life], version = pool.version;
  for (const dt of [0, -1, NaN, Infinity]) pool.update(dt);
  assert.deepEqual([...pool.positions], positions); assert.deepEqual([...pool.life], life);
  assert.equal(pool.version, version);
});

for (const [id, kind] of [["wild-oak", "wood"], ["mine-iron-west", "spark"], ["mine-stone", "spark"], ["wild-herbs", "leaf"]] as const) {
  test(`${id} emits ${kind} only as authoritative work elapsed advances`, () => {
    const { state, effects } = working(id);
    effects.update(state, .1);
    assert.equal(effects.pool.count, 0, "starting or displaying work does not imply a tool strike");
    updateFrontierWork(state, .46, hooks);
    const snapshot = JSON.stringify(state);
    effects.update(state, .1);
    const count = countKind(effects.pool, kind);
    assert.ok(count >= 3);
    effects.update(state, .01);
    assert.equal(countKind(effects.pool, kind), count, "reading the same elapsed value cannot duplicate the strike");
    assert.equal(JSON.stringify(state), snapshot, "effects cannot tick work or change any campaign data");
  });
}

test("cancelled work emits no completion burst and cannot award or debit a resource", () => {
  const { state, effects, node } = working("wild-oak");
  updateFrontierWork(state, .46, hooks); effects.update(state, .1);
  const count = countKind(effects.pool, "wood"), inventory = state.inventory.wood, remaining = state.frontier.resources[node.id].remaining;
  executeFrontierAction(state, "cancel-work", hooks);
  effects.update(state, .01);
  assert.equal(countKind(effects.pool, "wood"), count);
  assert.equal(state.inventory.wood, inventory); assert.equal(state.frontier.resources[node.id].remaining, remaining);
  for (let i = 0; i < 20; i++) effects.update(state, .1);
  assert.equal(countKind(effects.pool, "wood"), 0);
});

test("a real completion emits once after its real resource debit, without duplicating the reward", () => {
  const { state, effects, node } = working("mine-iron-west");
  const inventory = state.inventory.ore, remaining = state.frontier.resources[node.id].remaining;
  updateFrontierWork(state, node.duration, hooks);
  assert.equal(state.frontier.work, null);
  effects.update(state, .1);
  assert.equal(countKind(effects.pool, "spark"), 6);
  effects.update(state, .01);
  assert.equal(countKind(effects.pool, "spark"), 6);
  assert.equal(state.inventory.ore, inventory + node.yield);
  assert.equal(state.frontier.resources[node.id].remaining, remaining - 1);
});

test("footsteps use real outdoor travel and ignore a teleport or interior movement", () => {
  const state = stateAt(), effects = new EffectSimulation(); effects.reset(state);
  state.apostle.x += 25; effects.update(state, .1);
  assert.equal(countKind(effects.pool, "dust"), 2);
  state.apostle.x += 200; effects.update(state, .01);
  assert.equal(countKind(effects.pool, "dust"), 2);
  state.zone = "mine"; effects.update(state, .1);
  state.apostle.x += 25; effects.update(state, .1);
  assert.equal(countKind(effects.pool, "dust"), 0);
});

test("accepted combat creates an arc and actual HP loss creates hits; cooldown inputs create neither", () => {
  const game = new GameStore(); game.state = stateAt("dungeon");
  const target = game.state.enemies[0];
  game.state.apostle.x = target.x; game.state.apostle.y = target.y + 70;
  const effects = new EffectSimulation(); effects.reset(game.state);
  const stamina = game.state.apostle.stamina, hp = target.hp;
  game.attack(); effects.observePlayerAttack(game.state, stamina, 0); effects.update(game.state, .01);
  assert.ok(target.hp < hp);
  assert.equal(countKind(effects.pool, "arc"), 10); assert.ok(countKind(effects.pool, "hit") >= 7);
  const count = effects.pool.count, after = game.state.apostle.stamina;
  game.attack(); effects.observePlayerAttack(game.state, after, 0); effects.update(game.state, .01);
  assert.equal(game.state.apostle.stamina, after); assert.equal(effects.pool.count, count);
});

test("real enemy kills and player damage are observed once and never inferred from proximity", () => {
  const state = stateAt("dungeon"), effects = new EffectSimulation(); effects.reset(state);
  const enemy = state.enemies[0]; state.apostle.x = enemy.x; state.apostle.y = enemy.y;
  effects.update(state, .1); assert.equal(effects.pool.count, 0);
  enemy.hp = 0; enemy.alive = false; state.kills++; state.apostle.hp -= 4;
  const snapshot = JSON.stringify(state);
  effects.update(state, .01); assert.equal(countKind(effects.pool, "hit"), 18);
  effects.update(state, .01); assert.equal(countKind(effects.pool, "hit"), 18);
  assert.equal(JSON.stringify(state), snapshot);
});

test("pause freezes existing particles, discards new actions, and does not replay stale deltas", () => {
  const { state, effects } = working("mine-iron-west");
  updateFrontierWork(state, .5, hooks); effects.update(state, .1);
  const positions = [...effects.pool.positions], life = [...effects.pool.life], count = effects.pool.count;
  updateFrontierWork(state, 1, hooks); state.apostle.x += 15;
  for (let i = 0; i < 10; i++) effects.update(state, 0);
  assert.deepEqual([...effects.pool.positions], positions); assert.deepEqual([...effects.pool.life], life);
  effects.update(state, .01);
  assert.equal(effects.pool.count, count, "elapsed progress under a pause cannot be replayed as a strike");
  const battle = stateAt("dungeon"); effects.reset(battle);
  const stamina = battle.apostle.stamina; battle.apostle.stamina -= 10;
  effects.observePlayerAttack(battle, stamina, 0); effects.update(battle, 0); effects.update(battle, .1);
  assert.equal(effects.pool.count, 0);
});

test("ambient particles follow day/night, remain bounded, and freeze while paused", () => {
  for (const [minutes, kind] of [[720, "pollen"], [1300, "firefly"]] as const) {
    const state = stateAt(), effects = new EffectSimulation(); state.minutes = minutes; effects.reset(state);
    for (let i = 0; i < 10000; i++) effects.update(state, .1);
    assert.ok(countKind(effects.pool, kind) > 0 && effects.pool.count <= 7);
    const life = [...effects.pool.life]; effects.update(state, 0); assert.deepEqual([...effects.pool.life], life);
  }
});

test("same-zone campaign replacement, zone transition and explicit rebuild reset all observation baselines", () => {
  const { state, effects } = working("mine-iron-west");
  updateFrontierWork(state, .5, hooks); effects.update(state, .1); assert.ok(effects.pool.count > 0);
  const imported = structuredClone(state); imported.frontier.work!.elapsed = 3.9;
  effects.update(imported, .1); assert.equal(effects.pool.count, 0);
  effects.update(imported, .1); assert.equal(effects.pool.count, 0, "imported progress is a baseline");
  imported.apostle.x += 30; imported.zone = "wilderness"; effects.update(imported, .1);
  assert.equal(effects.pool.count, 0);
  imported.apostle.x += 25; effects.update(imported, .1); assert.equal(countKind(effects.pool, "dust"), 2);
  effects.reset(imported); assert.equal(effects.pool.count, 0);
});

test("bursty state changes cannot exceed frame emission or fixed particle capacity", () => {
  const state = stateAt("dungeon"), effects = new EffectSimulation(20); effects.reset(state);
  for (let i = 0; i < 1000; i++) {
    for (const enemy of state.enemies) enemy.hp -= 1;
    const stamina = state.apostle.stamina; state.apostle.stamina -= 10;
    effects.observePlayerAttack(state, stamina, 0); effects.update(state, .001);
    assert.ok(effects.pool.count <= 20);
  }
  const unlimited = new EffectSimulation(); unlimited.reset(state);
  for (const enemy of state.enemies) { enemy.hp = 0; enemy.alive = false; }
  state.apostle.hp -= 1; unlimited.update(state, .1);
  assert.ok(unlimited.pool.count <= 32);
});

test("one owned Points batch uploads dense live ranges and disposes once without invalidating another world", () => {
  const first = new WorldEffects(), second = new WorldEffects();
  const state = stateAt(); first.reset(state); second.reset(state);
  const point = first.group.children[0] as THREE.Points;
  const other = second.group.children[0] as THREE.Points;
  assert.ok(point instanceof THREE.Points);
  assert.equal(first.capacity, PARTICLE_CAPACITY); assert.equal(first.drawCalls, 0);
  assert.equal(point.geometry.getAttribute("position").count, PARTICLE_CAPACITY);
  let geometryDisposals = 0, materialDisposals = 0, otherDisposals = 0;
  point.geometry.addEventListener("dispose", () => geometryDisposals++);
  (point.material as THREE.Material).addEventListener("dispose", () => materialDisposals++);
  other.geometry.addEventListener("dispose", () => otherDisposals++);
  state.apostle.x += 25; first.update(state, .1); second.update(state, .1);
  assert.equal(first.drawCalls, 1); assert.equal(point.geometry.drawRange.count, first.count);
  assert.equal(point.geometry.getAttribute("position").array, first.simulation.pool.positions);
  const positionAttribute = point.geometry.getAttribute("position") as THREE.BufferAttribute;
  const version = positionAttribute.version;
  first.update(state, 0); assert.equal(positionAttribute.version, version);
  first.reset(state); assert.equal(first.count, 0); assert.equal(first.drawCalls, 0);
  first.dispose(); first.dispose(); first.update(state, .1);
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(otherDisposals, 0);
  assert.equal(first.group.children.length, 0); assert.equal(first.count, 0); assert.ok(second.count > 0);
  state.apostle.x += 25; second.update(state, .1); assert.equal(second.drawCalls, 1);
  second.dispose(); assert.equal(otherDisposals, 1);
});
