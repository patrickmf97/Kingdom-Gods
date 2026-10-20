import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { weatherFor } from "../src/weather";
import { createStormState, updateStorms, clearStormExposure } from "../src/storms";
import type { GameState } from "../src/types";

function stormGame() {
  const state = initialState(); state.started = true; state.phase = "playing"; state.intro = false;
  state.zone = "village"; Object.assign(state.apostle, { x: 1420, y: 950 });
  state.day = Array.from({ length: 360 }, (_, i) => i + 2).find(day => weatherFor(day, 720, "village").kind === "storm")!;
  assert.ok(state.day, "the calendar has storm days"); state.minutes = 720;
  state.worldLife ??= { residents: [], travelers: {}, storm: createStormState() };
  const hits: number[] = [], messages: string[] = [];
  const hooks = { damage(amount: number) { hits.push(amount); state.apostle.hp = Math.max(0, state.apostle.hp - amount); },
    message(text: string) { messages.push(text); }, remember() {} };
  return { state, hits, messages, hooks };
}
function run(state: GameState, seconds: number, hooks: Parameters<typeof updateStorms>[2]) {
  for (let elapsed = 0; elapsed < seconds - 1e-7; elapsed += .1) updateStorms(state, .1, hooks);
}

test("a storm announces a fixed valid point after the initial wait and never follows the player", () => {
  const { state, hits, hooks } = stormGame();
  run(state, 11, hooks); assert.equal(!!state.worldLife.storm.warning, false);
  run(state, 1.2, hooks); const warning = structuredClone(state.worldLife.storm.warning)!;
  assert.ok(warning); assert.equal(warning.id, 1); assert.equal(hits.length, 0);
  state.apostle.x += 100; run(state, .3, hooks);
  assert.equal(state.worldLife.storm.warning!.x, warning.x); assert.equal(state.worldLife.storm.warning!.y, warning.y);
  assert.ok(state.worldLife.storm.warning!.remaining <= 3.5);
});

test("impact damages an exposed nearby apostle exactly once and respects its long cooldown", () => {
  const { state, hits, hooks } = stormGame(); state.worldLife.storm.cooldown = 0;
  updateStorms(state, .1, hooks); const warning = state.worldLife.storm.warning!;
  Object.assign(state.apostle, { x: warning.x, y: warning.y });
  const hp = state.apostle.hp; run(state, 3.6, hooks);
  assert.deepEqual(hits, [28]); assert.equal(state.apostle.hp, hp - 28);
  assert.equal(state.worldLife.storm.warning, null); assert.equal(state.worldLife.storm.impact?.id, warning.id);
  assert.ok(state.worldLife.storm.cooldown >= 35 && state.worldLife.storm.cooldown <= 50);
  run(state, 10, hooks); assert.deepEqual(hits, [28]);
});

test("walking away, entering shelter, pausing and an offline snapshot avoid unintended damage", () => {
  for (const mode of ["away", "shelter", "paused", "offline"] as const) {
    const { state, hits, hooks } = stormGame(); state.worldLife.storm.cooldown = 0;
    updateStorms(state, .1, hooks); const warning = state.worldLife.storm.warning!;
    Object.assign(state.apostle, { x: warning.x, y: warning.y });
    if (mode === "away") state.apostle.x += 100;
    if (mode === "shelter") state.zone = "inn-room";
    if (mode === "paused") state.phase = "title";
    const before = structuredClone(state);
    if (mode !== "offline") run(state, 4, hooks);
    if (mode === "paused" || mode === "offline") assert.deepEqual(state, before);
    assert.equal(hits.length, 0, mode);
  }
});

test("a saved warning retains its target and pending impact while a saved receipt cannot deal damage twice", () => {
  const { state, hooks } = stormGame(); state.worldLife.storm.cooldown = 0;
  updateStorms(state, .1, hooks); run(state, 2, hooks);
  const restored = structuredClone(state), target = restored.worldLife.storm.warning!;
  Object.assign(restored.apostle, { x: target.x, y: target.y });
  const hp = restored.apostle.hp, hits: number[] = [];
  const restoredHooks = { ...hooks, damage(amount: number) { hits.push(amount); restored.apostle.hp -= amount; } };
  run(restored, 1.6, restoredHooks); assert.deepEqual(hits, [28]); assert.equal(restored.apostle.hp, hp - 28);
  const receipt = structuredClone(restored); run(receipt, 10, restoredHooks); assert.deepEqual(hits, [28]);
  assert.equal(receipt.apostle.hp, hp - 28); assert.equal(state.apostle.hp, hp);
  clearStormExposure(receipt); assert.equal(receipt.worldLife.storm.warning, null);
  assert.ok(receipt.worldLife.storm.cooldown >= 12);
});
