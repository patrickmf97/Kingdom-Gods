import test from "node:test";
import assert from "node:assert/strict";
import { weatherFor } from "../src/weather";
import { executeFrontierAction, updateFrontierWork } from "../src/frontier";
import { processEconomicDay, type EconomicHooks } from "../src/economy";
import { initialState } from "../src/simulation";
import { resourceNode } from "../src/regions";
import { MARKET_TARGETS } from "../src/market";
import { validateState } from "../src/persistence";
import type { GameState, ItemId } from "../src/types";

const rainDay = Array.from({ length: 88 }, (_, index) => index + 2)
  .find(day => weatherFor(day, 720, "village").kind === "rain")!;
const hooks: EconomicHooks = { message() {}, remember() {}, rememberNpc() {}, practice() {}, nearObject: () => true, nearNpc: () => false };
const money = (state: GameState) => state.gold + state.merchantGold + state.economy.civicFunds + state.frontier.escrow +
  Object.values(state.economy.npcSavings).reduce((sum, value) => sum + value, 0);

function working(nodeId: string, day: number) {
  const state = initialState();
  const node = resourceNode(nodeId)!;
  state.phase = "playing";
  state.day = day;
  state.zone = node.zone;
  state.apostle.x = node.x;
  state.apostle.y = node.y;
  state.frontier.tools.axe = { owned: true, durability: 100 };
  state.frontier.tools.pickaxe = { owned: true, durability: 100 };
  executeFrontierAction(state, `start-work:${nodeId}`, hooks);
  assert.ok(state.frontier.work);
  return { state, node };
}

test("rain advances exterior work at 80% without changing saved nominal duration or charging twice", () => {
  const { state, node } = working("wild-oak", rainDay);
  const energy = state.apostle.stamina;
  updateFrontierWork(state, node.duration, hooks);
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.frontier.work?.elapsed, node.duration * 0.8);
  assert.equal(state.frontier.work?.duration, node.duration);
  const loaded = structuredClone(state);
  assert.equal(validateState(loaded), true);
  updateFrontierWork(loaded, node.duration * 0.25, hooks);
  assert.equal(loaded.inventory.wood, node.yield);
  assert.equal(loaded.frontier.tools.axe.durability, 97);
  assert.equal(loaded.apostle.stamina, energy);
  updateFrontierWork(loaded, 100, hooks);
  assert.equal(loaded.inventory.wood, node.yield);
});

test("mine and clear exterior work finish at their nominal rate", () => {
  for (const [nodeId, day] of [["mine-iron-west", rainDay], ["wild-oak", 1]] as const) {
    const { state, node } = working(nodeId, day);
    updateFrontierWork(state, node.duration, hooks);
    assert.equal(state.frontier.work, null);
    assert.equal(state.inventory[node.resource], node.yield);
  }
});

function supplied(day: number) {
  const state = initialState();
  state.day = day;
  state.economy.civicFunds = 0;
  for (const item of Object.keys(state.market) as ItemId[]) state.market[item] = MARKET_TARGETS[item];
  for (const item of ["wheat", "wood", "stone", "seed", "herb"] as const) state.market[item] = 0;
  return state;
}

test("rain removes at most one exterior capacity per product and records limits while conserving money", () => {
  const clear = supplied(1);
  const rainy = supplied(rainDay);
  const total = money(rainy);
  processEconomicDay(clear, hooks);
  processEconomicDay(rainy, hooks);
  for (const item of ["wheat", "wood", "stone", "seed", "herb"] as const)
    assert.equal(rainy.market[item], Math.max(0, clear.market[item] - 1), item);
  assert.equal(money(rainy), total);
  assert.ok(rainy.economy.ledger.some(entry => /chuva/i.test(entry.text)));
});

test("rain leaves indoor workshop capacity intact and keeps funded job reserves untouched", () => {
  const states = [1, rainDay].map(day => {
    const state = supplied(day);
    state.market.wheat = 30;
    state.market.wood = 30;
    state.market.flour = 0;
    state.market.bread = 0;
    state.economy.civicFunds = 40;
    state.economy.orders = [{ id: "reserved", title: "Reserva", item: "bread", quantity: 6, reward: 40,
      createdDay: 1, deadline: 100, status: "accepted" }];
    state.frontier.jobs[1].status = "accepted";
    state.frontier.escrow = state.frontier.jobs[1].reward;
    const total = money(state);
    processEconomicDay(state, hooks);
    assert.equal(money(state), total);
    assert.equal(state.economy.civicFunds, 40);
    assert.equal(state.frontier.escrow, state.frontier.jobs[1].reward);
    return state;
  });
  assert.equal(states[1].market.bread, states[0].market.bread);
  assert.equal(states[1].market.flour, states[0].market.flour);
});
