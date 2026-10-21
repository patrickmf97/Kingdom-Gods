import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { EffectSimulation, PARTICLE_KINDS, type ParticleKind, type ParticlePool } from "../src/three/effects";
import { weatherFor } from "../src/weather";
import type { Zone } from "../src/types";

function scene(zone: Zone = "wilderness") {
  const state = initialState();
  state.phase = "playing"; state.zone = zone; state.day = 1; state.minutes = 720;
  Object.assign(state.apostle, { x: 760, y: 1300, alive: true });
  const npc = { ...state.npcs.find(npc => npc.id === "merchant")!, zone, x: 820, y: 1300 };
  state.npcs = [npc];
  const effects = new EffectSimulation(); effects.reset(state);
  return { state, npc, effects };
}
function count(pool: ParticlePool, kind: ParticleKind) {
  return Array.from(pool.kinds.slice(0, pool.count)).filter(value => value === PARTICLE_KINDS[kind]).length;
}

test("nearby NPC footsteps follow actual travel without touching the campaign", () => {
  const { state, npc, effects } = scene();
  npc.x += 29;
  const before = structuredClone(state);
  effects.update(state, .1);
  assert.equal(count(effects.pool, "dust"), 1, "one subtle footfall belongs to the moving NPC");
  effects.update(state, .1);
  assert.equal(count(effects.pool, "dust"), 1, "standing still never repeats the last step");
  assert.deepEqual(state, before);
});

test("rain and storms suppress dry dust for both the apostle and NPCs", () => {
  for (const kind of ["rain", "storm"] as const) {
    const { state, npc, effects } = scene();
    state.day = Array.from({ length: 360 }, (_, i) => i + 2)
      .find(day => weatherFor(day, 720, state.zone).kind === kind)!;
    assert.ok(state.day);
    state.apostle.x += 25; npc.x += 29;
    effects.update(state, .1);
    assert.equal(count(effects.pool, "dust"), 0, kind);
  }
});

test("dead, remote, indoor and teleported NPCs never leave phantom footsteps", () => {
  for (const mode of ["dead", "far", "other-zone", "indoors", "teleport", "new", "apostle", "dead-apostle"] as const) {
    const { state, npc, effects } = scene(mode === "indoors" ? "inn-room" : "wilderness");
    if (mode === "dead") state.family.push({ ...state.apostle, id: npc.id, alive: false });
    if (mode === "far") npc.y += 700;
    if (mode === "other-zone") npc.zone = "highlands";
    if (mode === "apostle") npc.id = state.apostle.id;
    if (mode === "dead-apostle") state.apostle.alive = false;
    npc.x += mode === "teleport" ? 200 : 29;
    if (mode === "new") npc.id = "fresh-arrival";
    effects.update(state, .1);
    assert.equal(count(effects.pool, "dust"), 0, mode);
  }
});

test("NPC movement during pause or import becomes a baseline rather than a delayed step", () => {
  const { state, npc, effects } = scene();
  npc.x += 29; effects.update(state, 0); effects.update(state, .1);
  assert.equal(count(effects.pool, "dust"), 0);
  npc.x += 29; effects.update(state, .1);
  assert.equal(count(effects.pool, "dust"), 1, "new active movement still emits");
  const imported = structuredClone(state); imported.npcs[0].x += 29;
  effects.update(imported, .1); effects.update(imported, .1);
  assert.equal(count(effects.pool, "dust"), 0, "an imported position is not a walk");
});

test("actual wounds outside combat create one restrained hit without replaying imported or paused HP", () => {
  for (const zone of ["village", "wilderness", "inn-room"] as const) {
    const { state, effects } = scene(zone);
    state.apostle.hp -= 28;
    const before = structuredClone(state);
    effects.update(state, .1);
    assert.equal(count(effects.pool, "hit"), 6, zone);
    effects.update(state, .1); assert.equal(count(effects.pool, "hit"), 6);
    assert.deepEqual(state, before);
    const imported = structuredClone(state); imported.apostle.hp -= 10;
    effects.update(imported, .1); effects.update(imported, .1);
    assert.equal(count(effects.pool, "hit"), 0, "imported HP is a baseline");
    imported.apostle.hp -= 10; effects.update(imported, 0); effects.update(imported, .1);
    assert.equal(count(effects.pool, "hit"), 0, "paused changes are not delayed wounds");
  }
});

test("crowds share the existing emission and particle limits", () => {
  const { state, npc, effects } = scene();
  state.npcs = Array.from({ length: 128 }, (_, i) => ({ ...npc, id: `crowd-${i}`, x: 800 + i % 8, y: 1280 + Math.floor(i / 8) }));
  effects.reset(state);
  state.npcs.forEach(npc => npc.x += 29);
  effects.update(state, .1);
  const dust = count(effects.pool, "dust");
  assert.ok(dust > 0 && dust <= 4, `crowd footfalls per frame: ${dust}`);
  const positions = effects.pool.positions, life = effects.pool.life;
  for (let i = 0; i < 120; i++) {
    state.npcs.forEach(npc => npc.x += 3);
    effects.update(state, .1);
    assert.ok(effects.pool.count <= effects.pool.capacity);
  }
  assert.equal(effects.pool.positions, positions); assert.equal(effects.pool.life, life);
});

test("foot dust eases in and fades softly while impact sparks remain immediate", async () => {
  const { ParticlePool } = await import("../src/three/effects");
  const pool = new ParticlePool(2);
  pool.emit("dust", 0, .07, 0, .2, .12, .2, .2, .55, .1);
  pool.emit("spark", 0, .8, 0, .2, .6, .2, .12, .55, 3);
  assert.equal(pool.opacities[0], 0, "a footfall should not pop into a full opaque disc");
  assert.equal(pool.opacities[1], 1, "tool sparks keep their immediate feedback");
  pool.update(.04);
  assert.ok(pool.opacities[0] > 0 && pool.opacities[0] < 1);
  pool.update(.08); const peak = pool.opacities[0];
  assert.ok(peak > .9);
  const frozen = [...pool.opacities]; pool.update(0); assert.deepEqual([...pool.opacities], frozen);
  pool.update(.3); assert.ok(pool.opacities[0] < peak * .6);
});
