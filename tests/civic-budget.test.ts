import test from "node:test";
import assert from "node:assert/strict";
import { GameStore, initialState } from "../src/simulation";
import { objectsForZone } from "../src/regions";
import { executeFrontierAction, processFrontierDay } from "../src/frontier";
import { executeEconomicAction, processEconomicDay, type EconomicHooks } from "../src/economy";
import type { GameState } from "../src/types";
import { civicBudget, frontierJobFunded, villageOrderFunded } from "../src/civic-budget";

const hooks: EconomicHooks = {
  message() {}, remember() {}, rememberNpc() {}, practice() {},
  nearObject: id => id === "sign" || id === "market", nearNpc: () => false,
};
function campaign() {
  const state = initialState();
  state.phase = "playing";
  state.zone = "village";
  return state;
}
function currency(state: GameState): number {
  return state.gold + state.merchantGold + state.economy.civicFunds + state.frontier.escrow +
    Object.values(state.economy.npcSavings).reduce((total, coins) => total + coins, 0);
}

// Removing frontier reservations from routine spending makes this regression fail:
// the day-six herb offer used to advertise 38 gold but reject acceptance.
test("starting treasury keeps every advertised frontier reward funded through day six", () => {
  const state = campaign();
  const total = currency(state);
  for (let day = 2; day <= 6; day++) {
    state.day = day;
    processFrontierDay(state, hooks);
    processEconomicDay(state, hooks);
    assert.ok(state.frontier.jobs.every(job => frontierJobFunded(state, job.id)));
    assert.equal(currency(state), total);
  }
  executeFrontierAction(state, "frontier-accept:healing-herbs", hooks);
  assert.equal(state.frontier.jobs.find(job => job.id === "healing-herbs")!.status, "accepted");
  assert.equal(state.frontier.escrow, 38);
  assert.equal(currency(state), total);
});

// Without whole-reward allocation the same 38 coins can advertise multiple jobs.
test("low historic treasury marks only whole affordable offers as financed", () => {
  const state = campaign();
  state.economy.civicFunds = 38;
  assert.deepEqual(civicBudget(state).financedJobIds, ["survey-trails"]);
  assert.equal(frontierJobFunded(state, "healing-herbs"), false);
  executeFrontierAction(state, "frontier-accept:healing-herbs", hooks);
  assert.equal(state.frontier.escrow, 0);
  assert.equal(state.economy.civicFunds, 38);
  assert.equal(state.frontier.jobs.find(job => job.id === "healing-herbs")!.status, "available");
});

test("council orders and accepted escrow take priority over frontier advertising", () => {
  const state = campaign();
  state.economy.civicFunds = 70;
  state.economy.orders = [{ id: "old-contract", title: "Pão", item: "bread", quantity: 6,
    reward: 50, createdDay: 1, deadline: 5, status: "accepted" }];
  assert.equal(villageOrderFunded(state, "old-contract"), true);
  assert.equal(civicBudget(state).reservedOrders, 50);
  assert.deepEqual(civicBudget(state).financedJobIds, ["survey-trails"]);
  executeFrontierAction(state, "frontier-accept:survey-trails", hooks);
  assert.equal(state.frontier.escrow, 18);
  assert.equal(state.economy.civicFunds, 52);
  state.day = 2;
  processEconomicDay(state, hooks);
  assert.equal(state.economy.civicFunds, 52);
  state.inventory.bread = 6;
  const total = currency(state), gold = state.gold;
  executeEconomicAction(state, "order-deliver:old-contract", hooks);
  assert.equal(state.gold, gold + 50);
  assert.equal(state.economy.civicFunds, 2);
  assert.equal(state.frontier.escrow, 18);
  assert.equal(currency(state), total);
  executeEconomicAction(state, "order-deliver:old-contract", hooks);
  assert.equal(state.gold, gold + 50);
});

test("new council orders spend only treasury left after published frontier rewards", () => {
  const state = campaign();
  state.economy.civicFunds = 108;
  state.day = 2;
  processEconomicDay(state, hooks);
  assert.equal(state.economy.orders.length, 0);
  assert.equal(state.economy.civicFunds, 108);
  assert.deepEqual(civicBudget(state).financedJobIds.slice().sort(), state.frontier.jobs.map(job => job.id).sort());
});

test("accepted rewards survive treasury exhaustion and pay real goods exactly once", () => {
  const state = campaign();
  executeFrontierAction(state, "frontier-accept:healing-herbs", hooks);
  const total = currency(state);
  // Transfer the remaining treasury, as real civic spending can do after offers expire.
  state.merchantGold += state.economy.civicFunds;
  state.economy.civicFunds = 0;
  state.inventory.herb = 5;
  const gold = state.gold, herbs = state.market.herb;
  executeFrontierAction(state, "frontier-claim:healing-herbs", hooks);
  assert.equal(state.gold, gold + 38);
  assert.equal(state.inventory.herb, 0);
  assert.equal(state.market.herb, herbs + 5);
  assert.equal(state.frontier.escrow, 0);
  assert.equal(currency(state), total);
  executeFrontierAction(state, "frontier-claim:healing-herbs", hooks);
  assert.equal(state.gold, gold + 38);
});


test("five real daily rollovers keep the herb acceptance promise despite meals and civic spending", () => {
  const store = new GameStore();
  store.state = campaign();
  store.state.inventory.bread = 100;
  const total = currency(store.state);
  for (let day = 2; day <= 6; day++) {
    store.tick(240);
    assert.equal(store.state.day, day);
    assert.equal(frontierJobFunded(store.state, "healing-herbs"), true);
    assert.equal(currency(store.state), total);
  }
  const board = objectsForZone("village").find(object => object.id === "sign")!;
  store.state.apostle.x = board.x;
  store.state.apostle.y = board.y;
  store.act("frontier-accept:healing-herbs");
  assert.equal(store.state.frontier.jobs.find(job => job.id === "healing-herbs")!.status, "accepted");
  assert.equal(store.state.frontier.escrow, 38);
  assert.equal(currency(store.state), total);
});

// A small tax payment must not redirect an already advertised herb reward to iron.
test("new treasury income preserves rewards that were already advertised as financed", () => {
  const state = campaign();
  state.economy.civicFunds = 56;
  assert.equal(frontierJobFunded(state, "healing-herbs"), true);
  state.economy.civicFunds += 14;
  assert.equal(frontierJobFunded(state, "healing-herbs"), true);
  assert.equal(civicBudget(state).available, 14);
});
