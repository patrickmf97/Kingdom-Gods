import test from "node:test";
import assert from "node:assert/strict";
import { executeEconomicAction, type EconomicHooks } from "../src/economy";
import { initialState } from "../src/simulation";

function fixture(near = true) {
  const state = initialState();
  state.phase = "playing";
  state.inventory.wheat = 40;
  state.apostle.stamina = 100;
  const hooks: EconomicHooks = { message() {}, remember() {}, rememberNpc() {},
    practice(skill, amount) { state.apostle.skills[skill] = (state.apostle.skills[skill] || 0) + amount; },
    nearObject: id => near && id === "mill", nearNpc: () => false };
  return { state, hooks };
}

test("explicit batches debit all ingredients and energy and produce the selected integer count", () => {
  for (const count of [1, 3, 10]) {
    const { state, hooks } = fixture();
    const skill = state.apostle.skills.farming;
    executeEconomicAction(state, `craft:flour:${count}`, hooks);
    assert.equal(state.inventory.wheat, 40 - 2 * count);
    assert.equal(state.inventory.flour, count);
    assert.equal(state.apostle.stamina, 100 - 6 * count);
    assert.equal(state.apostle.skills.farming, skill + count);
    assert.equal(state.economy.ledger.filter(entry => entry.type === "craft").length, 1);
  }
});

test("old crafting actions remain exactly one batch", () => {
  const implicit = fixture();
  const explicit = fixture();
  executeEconomicAction(implicit.state, "craft:flour", implicit.hooks);
  executeEconomicAction(explicit.state, "craft:flour:1", explicit.hooks);
  assert.deepEqual(implicit.state, explicit.state);
});

test("malformed or out-of-range batch requests are rejected without partial production", () => {
  for (const suffix of ["0", "11", "-1", "1.5", "NaN", "Infinity", "1e1", "", "2:extra", "9007199254740992"]) {
    const { state, hooks } = fixture();
    const before = structuredClone(state);
    assert.equal(executeEconomicAction(state, `craft:flour:${suffix}`, hooks), true);
    assert.deepEqual(state, before, suffix);
  }
});

test("authority rejects remote, dead, insufficient and unsafe batches atomically", () => {
  for (const reason of ["remote", "dead", "hp", "phase", "ingredients", "energy", "unsafe-output", "fractional-input", "nan-energy"] as const) {
    const { state, hooks } = fixture(reason !== "remote");
    if (reason === "dead") state.apostle.alive = false;
    if (reason === "hp") state.apostle.hp = 0;
    if (reason === "phase") state.phase = "title";
    if (reason === "ingredients") state.inventory.wheat = 5;
    if (reason === "energy") state.apostle.stamina = 17;
    if (reason === "unsafe-output") state.inventory.flour = Number.MAX_SAFE_INTEGER - 1;
    if (reason === "fractional-input") state.inventory.wheat = 8.5;
    if (reason === "nan-energy") state.apostle.stamina = NaN;
    const before = structuredClone(state);
    executeEconomicAction(state, "craft:flour:3", hooks);
    assert.deepEqual(state, before, reason);
  }
});

test("multi-ingredient recipes reject the whole lot when one ingredient is short", () => {
  const { state, hooks } = fixture();
  hooks.nearObject = id => id === "bakery";
  state.inventory.flour = 4;
  state.inventory.wood = 2;
  const before = structuredClone(state);
  executeEconomicAction(state, "craft:bread:3", hooks);
  assert.deepEqual(state, before);
  state.inventory.wood = 3;
  executeEconomicAction(state, "craft:bread:3", hooks);
  assert.equal(state.inventory.flour, 1);
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.inventory.bread, 6);
  assert.equal(state.apostle.stamina, 76);
});
