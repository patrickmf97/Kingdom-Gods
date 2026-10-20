import test from "node:test";
import assert from "node:assert/strict";
import { processEconomicDay, type EconomicHooks } from "../src/economy";
import { initialState } from "../src/simulation";
import { parseCampaign, exportCampaign } from "../src/campaign-files";
import { validateState } from "../src/persistence";
import type { GameState, ItemId, Person } from "../src/types";

const hooks: EconomicHooks = { message() {}, remember() {}, rememberNpc() {}, practice() {},
  nearObject: () => false, nearNpc: () => false };
function money(state: GameState): number {
  return state.gold + state.merchantGold + state.economy.civicFunds + state.frontier.escrow +
    Object.values(state.economy.npcSavings).reduce((sum, value) => sum + value, 0) +
    Object.values(state.worldLife.travelers).reduce((sum, traveler) => sum + traveler.gold, 0);
}
function emptyMarket(): GameState {
  const state = initialState();
  for (const item of Object.keys(state.market) as ItemId[]) state.market[item] = 0;
  state.economy.civicFunds = 0;
  return state;
}
function dead(id: string): Person {
  return { id, name: id, surname: "Valen", sex: "female", skin: "#c69b76", hair: "#50362a",
    eyes: "#779787", outfit: "#a9806d", age: 90, birthDay: 1 - 90 * 360,
    alive: false, generation: 1, parents: [], title: "Moradora" };
}

test("regional goods and recipe labor transfer finite merchant coins to actual workers", () => {
  const state = emptyMarket();
  const total = money(state);
  const cash = state.merchantGold;
  processEconomicDay(state, hooks);
  assert.equal(state.market.wheat, 1);
  assert.equal(state.market.flour, 0);
  assert.equal(state.market.bread, 2);
  assert.equal(state.market.wood, 2);
  assert.equal(state.market.stone, 2);
  assert.equal(state.market.seed, 2);
  assert.equal(state.market.herb, 1);
  assert.ok(state.merchantGold < cash, "regional goods require merchant procurement and wages");
  assert.equal(state.economy.npcSavings.farmer, 8, "six wheat coins and two seed coins");
  assert.equal(state.economy.npcSavings["alpha12-miller"], 1, "one wage goes to the actual miller");
  assert.equal(state.economy.npcSavings["alpha12-baker"], 1, "one wage goes to the actual baker");
  assert.equal(state.economy.npcSavings.matron || 0, 0, "the matron does not duplicate the specialist’s paid work");
  assert.equal(money(state), total);
  assert.ok(state.economy.ledger.some((entry) => entry.type === "procurement" && /coroas/.test(entry.text)));
  assert.ok(state.economy.ledger.some((entry) => entry.type === "production" && /farinha|pães/.test(entry.text)));
  assert.equal(validateState(state), true);
});

test("zero and limited merchant cash stall unpaid procurement and recipe production", () => {
  for (const cash of [0, 1, 5]) {
    const state = emptyMarket();
    state.merchantGold = cash;
    const total = money(state);
    processEconomicDay(state, hooks);
    assert.equal(money(state), total);
    assert.ok(state.merchantGold >= 0);
    assert.ok(Object.values(state.economy.npcSavings).reduce((sum, value) => sum + value, 0) <= cash);
    if (cash === 0) {
      assert.ok(Object.values(state.market).every((quantity) => quantity === 0));
      assert.deepEqual(state.economy.npcSavings, {});
    }
    assert.match(state.economy.ledger.map((entry) => entry.text).join(" "), /caixa|moedas|pagamento/i);
  }
  const state = emptyMarket();
  state.merchantGold = 0;
  state.market.wheat = 20;
  state.market.wood = 20;
  const before = structuredClone(state.market);
  processEconomicDay(state, hooks);
  assert.deepEqual(state.market, before, "inputs cannot be processed without wages");
});

test("paid processing requires both physical recipe inputs and an available real laborer", () => {
  const state = emptyMarket();
  // Remove procurement actors so these recipe inputs are the complete supply.
  state.npcs = state.npcs.filter((npc) => npc.id === "farmer" || npc.id === "matron");
  state.worldLife.residents = []; state.worldLife.travelers = {}; // legacy population without specialist registrations
  state.property.owned = true;
  state.property.building = true;
  state.economy.worker = { npcId: "farmer", wage: 5, hiredDay: 1, loyalty: 50, unpaidDays: 0 };
  state.gold = 7;
  state.market.flour = 1;
  state.market.wood = 1;
  const total = money(state);
  const merchant = state.merchantGold;
  processEconomicDay(state, hooks);
  assert.equal(state.market.bread, 2);
  assert.equal(state.market.flour, 0);
  assert.equal(state.market.wood, 0);
  assert.equal(state.economy.npcSavings.matron, 1);
  assert.equal(state.economy.npcSavings.farmer, 5, "a contracted farmer cannot also supply or mill for the merchant");
  assert.equal(state.merchantGold, merchant - 1);
  assert.equal(money(state), total);
  assert.equal(validateState(state), true, "the worker fixture and resulting estate remain valid current campaigns");
  for (const missing of ["flour", "wood"] as const) {
    const inputless = emptyMarket();
    inputless.npcs = inputless.npcs.filter((npc) => npc.id === "matron");
    inputless.market.flour = missing === "flour" ? 0 : 1;
    inputless.market.wood = missing === "wood" ? 0 : 1;
    processEconomicDay(inputless, hooks);
    assert.equal(inputless.market.bread, 0);
    assert.equal(inputless.economy.npcSavings.matron || 0, 0);
    assert.match(inputless.economy.ledger.map((entry) => entry.text).join(" "), /insumos|ingredientes/i);
  }
});

test("winter capacity shrinks supplies and unavailable NPCs cannot receive procurement coins", () => {
  const spring = emptyMarket();
  const winter = emptyMarket();
  winter.day = 271;
  processEconomicDay(spring, hooks);
  processEconomicDay(winter, hooks);
  assert.ok(winter.market.bread < spring.market.bread);
  assert.ok(winter.market.herb < spring.market.herb);
  for (const unavailable of ["missing", "dead", "apostle"] as const) {
    const state = emptyMarket();
    state.economy.npcSavings.farmer = 17;
    if (unavailable === "missing") state.npcs = state.npcs.filter((npc) => npc.id !== "farmer");
    if (unavailable === "dead") state.family.push(dead("farmer"));
    if (unavailable === "apostle") state.apostle.id = "farmer";
    processEconomicDay(state, hooks);
    assert.equal(state.economy.npcSavings.farmer, 17);
    assert.equal(state.market.wheat, 0);
    assert.equal(state.market.seed, 0);
    assert.equal(state.market.flour, 0);
    const bakery = emptyMarket();
    bakery.npcs = bakery.npcs.filter((npc) => npc.id === "matron");
    bakery.market.flour = 1;
    bakery.market.wood = 1;
    bakery.economy.npcSavings.matron = 11;
    if (unavailable === "missing") bakery.npcs = [];
    if (unavailable === "dead") bakery.family.push(dead("matron"));
    if (unavailable === "apostle") bakery.apostle.id = "matron";
    processEconomicDay(bakery, hooks);
    assert.equal(bakery.market.flour, 1);
    assert.equal(bakery.market.wood, 1);
    assert.equal(bakery.market.bread, 0);
    assert.equal(bakery.economy.npcSavings.matron, 11);
  }
});

test("surplus stock stays intact and production protects order reserves and frontier escrow", () => {
  const state = emptyMarket();
  for (const item of Object.keys(state.market) as ItemId[]) state.market[item] = 100;
  processEconomicDay(state, hooks);
  assert.ok(Object.values(state.market).every((quantity) => quantity === 100), "a target is not a vanishing stock cap");
  const reserved = emptyMarket();
  reserved.day = 2;
  reserved.economy.civicFunds = 40;
  reserved.economy.orders = [{ id: "reserved-bread", title: "Pão", item: "bread", quantity: 6,
    reward: 40, createdDay: 1, deadline: 5, status: "accepted" }];
  const job = reserved.frontier.jobs.find((candidate) => candidate.id === "mine-supply")!;
  job.status = "accepted";
  reserved.frontier.escrow = job.reward;
  const total = money(reserved);
  for (let i = 0; i < 3; i++) processEconomicDay(reserved, hooks);
  assert.equal(reserved.economy.civicFunds, 40);
  assert.equal(reserved.frontier.escrow, job.reward);
  assert.equal(money(reserved), total);
  assert.equal(validateState(reserved), true);
  assert.deepEqual(parseCampaign(exportCampaign(reserved)), reserved);
});
