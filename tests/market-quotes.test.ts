import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS } from "../src/data";
import { GameStore, initialState } from "../src/simulation";
import { exportCampaign, parseCampaign } from "../src/campaign-files";
import { migrateState } from "../src/persistence";
import type { Creation, GameState, ItemId } from "../src/types";

const itemIds = Object.keys(ITEMS) as ItemId[];
const creation: Creation = { name: "Rowan", surname: "Valen", sex: "male", skin: "#d3a17b",
  hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "fortune" };
function game(): GameStore {
  const store = new GameStore();
  store.create(creation);
  store.choose("leave-orphanage");
  store.state.zone = "village";
  store.state.apostle.x = 1280;
  store.state.apostle.y = 820;
  return store;
}
function order(state: GameState, item: ItemId): void {
  state.economy.orders = [{ id: "market-demand", title: "Abastecimento", item,
    quantity: 6, reward: 40, createdDay: state.day, deadline: state.day + 3, status: "available" }];
}

test("quotes expose deterministic smooth stock, seasonal and civic demand drivers without changing saves", async () => {
  const market = await import("../src/market").catch(() => null);
  assert.ok(market, "the shared pure market quote API must exist");
  const state = initialState();
  const before = structuredClone(state);
  const base = market.marketQuote(state, "wheat", true);
  assert.equal(base.stock, state.market.wheat);
  assert.ok(base.target > 0);
  assert.ok(base.scarcityFactor > 0);
  assert.ok(base.discountFactor <= 1 && base.discountFactor >= 0.8);
  assert.ok(["scarce", "balanced", "abundant"].includes(base.status));
  assert.deepEqual(market.marketQuote(state, "wheat", true), base);
  assert.deepEqual(state, before);
  state.day = 271;
  const winter = market.marketQuote(state, "wheat", true);
  assert.ok(winter.seasonFactor > base.seasonFactor);
  assert.ok(winter.price > base.price);
  order(state, "wheat");
  const demand = market.marketQuote(state, "wheat", true);
  assert.ok(demand.demandFactor > winter.demandFactor);
  assert.ok(demand.price > winter.price);
  state.economy.orders[0].status = "fulfilled";
  assert.equal(market.marketQuote(state, "wheat", true).demandFactor, 1);
  state.economy.orders[0].status = "accepted";
  state.day = state.economy.orders[0].deadline;
  assert.equal(market.marketQuote(state, "wheat", true).demandFactor, 1);
  for (const item of itemIds) {
    let previous = Infinity;
    let previousFactor = Infinity;
    for (let stock = 0; stock <= 100; stock++) {
      state.market[item] = stock;
      const quote = market.marketQuote(state, item, true);
      assert.ok(quote.price <= previous, `${item}: increasing supply cannot raise the buy quote`);
      assert.ok(quote.scarcityFactor < previousFactor, `${item}: every stock unit changes scarcity`);
      // Even the rare sword's last unit moves the smooth curve by less than 10%.
      if (stock > 0) assert.ok(previousFactor / quote.scarcityFactor < 1.1, `${item}: no scarcity cliff`);
      previous = quote.price;
      previousFactor = quote.scarcityFactor;
    }
  }
});

test("every item and stock level resists immediate round trips even after trading practice", () => {
  const store = game();
  for (const blessing of ["vigor", "fortune"] as const) {
    for (const skill of [0, 30, 99.8, 100]) {
      for (const day of [1, 91, 181, 271]) {
        for (const prosperity of [0, 55, 100]) {
          for (const item of itemIds) {
            for (const stock of [...Array.from({ length: 101 }, (_, index) => index), Number.MAX_SAFE_INTEGER - 1]) {
              Object.assign(store.state, { day });
              store.state.economy.prosperity = prosperity;
              store.state.apostle.blessing = blessing;
              store.state.apostle.skills.trading = skill;
              order(store.state, item);
              store.state.market[item] = stock;
              const buy = store.price(item, true);
              const sell = store.price(item, false);
              store.state.apostle.skills.trading = Math.min(100, skill + 0.4);
              if (stock > 0) {
                store.state.market[item] = stock - 1;
                assert.ok(store.price(item, false) <= buy, `${item}: buy/sell at ${stock}, skill ${skill}`);
              }
              store.state.market[item] = stock + 1;
              assert.ok(store.price(item, true) >= sell, `${item}: sell/buy at ${stock}, skill ${skill}`);
            }
          }
        }
      }
    }
  }
});

test("successful player trades use displayed quotes and record actual coins; rejected trades do not change economic state", async () => {
  const market = await import("../src/market").catch(() => null);
  assert.ok(market, "the shared pure market quote API must exist");
  const store = game();
  store.state.gold = 100;
  const quote = market.marketQuote(store.state, "sword", true);
  assert.equal(store.price("sword", true), quote.price);
  const merchant = store.state.merchantGold;
  store.act("buy:sword");
  assert.equal(store.state.gold, 100 - quote.price);
  assert.equal(store.state.merchantGold, merchant + quote.price);
  assert.equal(store.state.economy.ledger.at(-1)?.goldDelta, -quote.price);
  assert.equal(store.state.economy.ledger.at(-1)?.type, "trade");
  const sale = market.marketQuote(store.state, "sword", false).price;
  store.act("sell:sword");
  assert.equal(store.state.gold, 100 - quote.price + sale);
  assert.equal(store.state.economy.ledger.at(-1)?.goldDelta, sale);
  const economicSnapshot = () => structuredClone({ gold: store.state.gold, inventory: store.state.inventory,
    market: store.state.market, merchantGold: store.state.merchantGold, economy: store.state.economy,
    skills: store.state.apostle.skills });
  for (const rejection of ["empty-stock", "poor-player", "poor-merchant", "empty-inventory", "remote"] as const) {
    store.state.market.sword = rejection === "empty-stock" ? 0 : 3;
    store.state.gold = rejection === "poor-player" ? 0 : 100;
    store.state.merchantGold = rejection === "poor-merchant" ? 0 : 450;
    store.state.inventory.sword = rejection === "empty-inventory" ? 0 : 1;
    store.state.apostle.x = rejection === "remote" ? 300 : 1280;
    const before = economicSnapshot();
    store.act(`${rejection === "poor-merchant" || rejection === "empty-inventory" ? "sell" : "buy"}:sword`);
    assert.deepEqual(economicSnapshot(), before, rejection);
  }
});

test("quotes and trading retain v6 fields and preserve an existing campaign exactly on export and load", async () => {
  const market = await import("../src/market").catch(() => null);
  assert.ok(market, "the shared pure market quote API must exist");
  const legacy = initialState();
  legacy.day = 280;
  legacy.minutes = 1370;
  legacy.economy.npcSavings = { farmer: 17, mira: 8 };
  legacy.economy.ledger = [{ day: 270, type: "production", text: "Registro antigo", goldDelta: 0 }];
  const before = structuredClone(legacy);
  market.marketQuote(legacy, "sword", false);
  assert.deepEqual(migrateState(legacy), before);
  assert.deepEqual(parseCampaign(exportCampaign(legacy)), before);
  assert.deepEqual(legacy, before);
  assert.equal(legacy.version, 6);
});
