import test from "node:test";
import assert from "node:assert/strict";
import { GameStore, initialState } from "../src/simulation";
import type { Creation, EconomyState, Person } from "../src/types";

const creation: Creation = {
  name: "Rowan",
  surname: "Valen",
  sex: "male",
  skin: "#d3a17b",
  hair: "#493327",
  eyes: "#7ca078",
  outfit: "#6d8866",
  blessing: "vigor",
};
function game(): GameStore {
  const store = new GameStore();
  store.create(creation);
  store.choose("leave-orphanage");
  store.state.zone = "village";
  store.state.inventory.bread = 100;
  return store;
}
function at(store: GameStore, x: number, y: number): void {
  store.state.apostle.x = x;
  store.state.apostle.y = y;
}
function estate(store: GameStore): EconomyState {
  assert.ok(store.state.economy, "new campaigns must have a living economy");
  store.state.property.owned = true;
  store.state.property.building = true;
  at(store, 1900, 1030);
  return store.state.economy;
}
function money(store: GameStore): number {
  assert.ok(store.state.economy, "economy treasury must exist");
  return (
    store.state.gold +
    store.state.merchantGold +
    store.state.economy.civicFunds +
    store.state.frontier.escrow +
    Object.values(store.state.economy.npcSavings).reduce(
      (sum, value) => sum + value,
      0,
    )
  );
}
function spouse(store: GameStore, id = "mira"): Person {
  return {
    id,
    name: id === "farmer" ? "Lina" : "Mira",
    surname: "Valen",
    sex: "female",
    skin: "#c69b76",
    hair: "#50362a",
    eyes: "#779787",
    outfit: "#a9806d",
    age: 24,
    birthDay: 1 - 24 * 360,
    alive: true,
    generation: 1,
    parents: [],
    title: "Companheira",
    partnerId: store.state.apostle.id,
  };
}

test("new campaigns define current economy, flour and the new practiced skills", () => {
  const state = initialState();
  assert.equal(state.version, 5);
  assert.equal(state.inventory.flour, 0);
  assert.equal(state.market.flour, 8);
  assert.equal(state.apostle.skills.cooking, 0);
  assert.equal(state.apostle.skills.smithing, 0);
  assert.deepEqual(state.economy, {
    condition: 100,
    crop: null,
    worker: null,
    npcSavings: {},
    ledger: [],
    orders: [],
    civicFunds: 180,
    prosperity: 55,
    lastOrderDay: 0,
  });
});

test("crop profiles cross every season and a legacy crop preserves its original deadline", async () => {
  const economy = await import("../src/economy").catch(() => null);
  assert.ok(economy, "seasonal economy module must exist");
  assert.deepEqual(economy.cropProfile(1), {
    season: "Primavera",
    duration: 2,
    yield: 8,
  });
  assert.deepEqual(economy.cropProfile(91), {
    season: "Verão",
    duration: 2,
    yield: 10,
  });
  assert.deepEqual(economy.cropProfile(181), {
    season: "Outono",
    duration: 3,
    yield: 7,
  });
  assert.deepEqual(economy.cropProfile(271), {
    season: "Inverno",
    duration: 4,
    yield: 4,
  });
  assert.deepEqual(economy.cropProfile(361), economy.cropProfile(1));
  assert.deepEqual(economy.createEconomyState(280, 279).crop, {
    season: "Inverno",
    readyDay: 281,
    yield: 8,
  });
});

test("a house consumes maintenance and tax without creating gold or daily bread", () => {
  const store = game();
  const economy = estate(store);
  store.state.property.harvests = 1;
  store.state.inventory.bread = 3;
  store.state.gold = 30;
  const total = money(store);
  store.tick(240);
  assert.equal(store.state.gold, 28);
  assert.equal(store.state.inventory.bread, 2);
  assert.equal(economy.condition, 97);
  assert.equal(
    money(store),
    total,
    "tax and village spending transfer finite coins",
  );
  assert.ok(
    economy.ledger.some(
      (entry) => entry.type === "tax" && entry.goldDelta === -2,
    ),
  );
});

test("crafting consumes ingredients and energy at the actual station and practices its skill", () => {
  const store = game();
  store.state.inventory.wheat = 2;
  store.state.inventory.wood = 3;
  store.state.inventory.ore = 3;
  at(store, 1260, 430);
  const energy = store.state.apostle.stamina;
  store.act("craft:flour");
  assert.equal(store.state.inventory.wheat, 0);
  assert.equal(store.state.inventory.flour, 1);
  assert.equal(store.state.apostle.stamina, energy - 6);
  assert.ok(store.state.apostle.skills.farming > 0);
  at(store, 1230, 1410);
  const bread = store.state.inventory.bread;
  store.act("craft:bread");
  assert.equal(store.state.inventory.flour, 0);
  assert.equal(store.state.inventory.wood, 2);
  assert.equal(store.state.inventory.bread, bread + 2);
  assert.equal(store.state.apostle.stamina, energy - 14);
  assert.ok(store.state.apostle.skills.cooking > 0);
  at(store, 1560, 660);
  store.act("craft:sword");
  assert.equal(store.state.inventory.ore, 0);
  assert.equal(store.state.inventory.wood, 0);
  assert.equal(store.state.inventory.sword, 1);
  assert.equal(store.state.apostle.stamina, energy - 28);
  assert.ok(store.state.apostle.skills.smithing > 0);
});

test("invalid crafting cannot spend ingredients, energy or practice remotely, underfunded or dead", () => {
  const store = game();
  store.state.inventory.wheat = 2;
  const before = JSON.stringify({
    inventory: store.state.inventory,
    apostle: store.state.apostle,
  });
  store.act("craft:flour");
  assert.equal(
    JSON.stringify({
      inventory: store.state.inventory,
      apostle: store.state.apostle,
    }),
    before,
  );
  at(store, 1260, 430);
  store.state.apostle.stamina = 5;
  store.act("craft:flour");
  assert.equal(store.state.inventory.wheat, 2);
  assert.equal(store.state.inventory.flour, 0);
  assert.equal(store.state.apostle.skills.farming, 0);
  store.state.apostle.stamina = 100;
  store.state.inventory.wheat = 1;
  store.act("craft:flour");
  assert.equal(store.state.inventory.wheat, 1);
  store.state.phase = "dead";
  store.state.inventory.wheat = 2;
  store.act("craft:flour");
  assert.equal(store.state.inventory.wheat, 2);
});

test("planting fixes seasonal yield and date even when the calendar crosses a season", () => {
  const store = game();
  estate(store);
  store.state.day = 270;
  store.act("plant");
  assert.deepEqual(store.state.economy.crop, {
    season: "Outono",
    readyDay: 273,
    yield: 7,
  });
  store.state.day = 272;
  store.act("harvest");
  assert.equal(store.state.inventory.wheat, 0);
  store.state.day = 273;
  store.act("harvest");
  assert.equal(store.state.inventory.wheat, 7);
  assert.equal(store.state.property.plantedAt, null);
  assert.equal(store.state.economy.crop, null);
});

test("repair requires the built estate, real materials and proximity and caps condition", () => {
  const store = game();
  const economy = estate(store);
  economy.condition = 88;
  store.state.inventory.wood = 2;
  store.state.inventory.stone = 1;
  at(store, 400, 400);
  store.act("repair");
  assert.equal(economy.condition, 88);
  at(store, 1900, 1030);
  store.act("repair");
  assert.equal(economy.condition, 100);
  assert.equal(store.state.inventory.wood, 0);
  assert.equal(store.state.inventory.stone, 0);
  store.act("repair");
  assert.equal(economy.condition, 100);
});

test("paid Lina transfers wages into savings and farms using a seed and a real growing period", () => {
  const store = game();
  const economy = estate(store);
  store.state.gold = 100;
  const seed = store.state.inventory.seed;
  store.act("hire:farmer");
  assert.ok(economy.worker, "Lina should accept a built, maintained estate");
  const startingLoyalty = economy.worker.loyalty;
  const total = money(store);
  store.tick(240);
  assert.equal(store.state.gold, 93, "five wage coins plus two tax coins");
  assert.equal(economy.npcSavings.farmer, 5);
  assert.equal(economy.worker?.loyalty, startingLoyalty + 2);
  assert.equal(store.state.inventory.seed, seed - 1);
  assert.equal(store.state.property.plantedAt, 2);
  assert.equal(store.state.inventory.wheat, 0);
  store.tick(480);
  assert.equal(economy.npcSavings.farmer, 15);
  assert.equal(store.state.inventory.wheat, 8);
  assert.equal(store.state.property.harvests, 1);
  assert.equal(money(store), total);
  assert.equal(store.state.npcs.filter((npc) => npc.id === "farmer").length, 1);
});

test("Lina refuses a ruined or remote house and cannot be hired twice", () => {
  const store = game();
  const economy = estate(store);
  economy.condition = 24;
  store.act("hire:farmer");
  assert.equal(economy.worker, null);
  economy.condition = 100;
  at(store, 400, 400);
  store.act("hire:farmer");
  assert.equal(economy.worker, null);
  at(store, 1900, 1030);
  store.act("hire:farmer");
  assert.ok(economy.worker);
  const before = JSON.stringify(economy.worker);
  store.act("hire:farmer");
  assert.equal(JSON.stringify(economy.worker), before);
});

test("unpaid Lina does no farm work and leaves after three days with remembered consequences", () => {
  const store = game();
  const economy = estate(store);
  store.act("hire:farmer");
  assert.ok(economy.worker);
  const loyalty = economy.worker.loyalty;
  store.state.gold = 0;
  const seeds = store.state.inventory.seed;
  store.tick(240);
  assert.equal(economy.worker?.unpaidDays, 1);
  assert.equal(economy.worker?.loyalty, Math.max(0, loyalty - 15));
  assert.equal(store.state.inventory.seed, seeds);
  assert.equal(economy.npcSavings.farmer || 0, 0, "an active unpaid contract still occupies Lina");
  const total = money(store);
  store.tick(480);
  assert.equal(economy.worker, null);
  assert.ok((economy.npcSavings.farmer || 0) > 0, "after resigning, Lina can earn merchant-paid regional work");
  assert.ok(economy.ledger.some((entry) => entry.type === "procurement" && /Lina/.test(entry.text)));
  assert.equal(money(store), total);
  assert.equal(store.state.property.plantedAt, null);
  assert.ok(
    store.state.apostle.memories.some((memory) =>
      /salário|pagamento/i.test(memory.text),
    ),
  );
  assert.ok(store.state.simulation.npcMemories.farmer?.length);
  assert.match(
    store.state.npcs.find((npc) => npc.id === "farmer")!.mood,
    /insatisfeita|salário/i,
  );
});

test("poor maintenance suspends farm work and dismissal ends estate wages while allowing regional work", () => {
  const store = game();
  const economy = estate(store);
  store.act("hire:farmer");
  assert.ok(economy.worker);
  economy.condition = 27;
  const seeds = store.state.inventory.seed;
  store.tick(240);
  assert.equal(economy.condition, 24);
  assert.equal(economy.npcSavings.farmer, 5);
  assert.equal(store.state.inventory.seed, seeds);
  store.act("dismiss-worker");
  assert.equal(economy.worker, null);
  const gold = store.state.gold;
  store.tick(240);
  assert.equal(store.state.gold, gold - 2, "only the estate tax remains; the merchant pays regional wages");
  assert.ok(economy.npcSavings.farmer > 5);
  assert.ok(economy.ledger.some((entry) => entry.type === "procurement" && /Lina/.test(entry.text)));
});

test("an estate contract survives succession and ends when Lina herself becomes the apostle", () => {
  const store = game();
  const economy = estate(store);
  store.act("hire:farmer");
  assert.ok(economy.worker);
  const mira = spouse(store);
  store.state.family.push(mira);
  store.state.apostle.partnerId = mira.id;
  store.damage(1000);
  store.act("succeed:mira");
  assert.equal(economy.worker?.npcId, "farmer");
  const lina = spouse(store, "farmer");
  store.state.family.push(lina);
  store.state.apostle.partnerId = lina.id;
  store.damage(1000);
  store.act("succeed:farmer");
  assert.equal(economy.worker, null);
  assert.equal(
    store.state.npcs.some((npc) => npc.id === "farmer"),
    false,
  );
});

test("a worker contract ends if its NPC dies or disappears without recreating her", () => {
  for (const cause of ["dead", "missing"]) {
    const store = game();
    const economy = estate(store);
    store.act("hire:farmer");
    assert.ok(economy.worker);
    if (cause === "dead") {
      const lina = spouse(store, "farmer");
      lina.age = 89;
      lina.birthDay = 2 - 90 * 360;
      store.state.family.push(lina);
    } else
      store.state.npcs = store.state.npcs.filter((npc) => npc.id !== "farmer");
    store.tick(240);
    assert.equal(economy.worker, null);
    assert.equal(economy.npcSavings.farmer || 0, 0);
    assert.equal(
      store.state.npcs.some((npc) => npc.id === "farmer"),
      false,
    );
  }
});

test("regional milling and baking consume ingredients while village spending never mints money", () => {
  const store = game();
  assert.ok(store.state.economy);
  for (const id of Object.keys(
    store.state.market,
  ) as (keyof typeof store.state.market)[])
    store.state.market[id] = 0;
  store.state.economy.civicFunds = 0;
  const total = money(store);
  store.tick(240);
  assert.equal(
    store.state.market.bread,
    2,
    "spring's three wheat fund only one milling and baking batch",
  );
  assert.equal(store.state.market.wheat, 1);
  assert.equal(store.state.market.flour, 0);
  assert.equal(store.state.market.wood, 2);
  assert.equal(store.state.merchantGold, 431, "17 procurement coins plus two recipe wages reach NPC savings");
  assert.equal(money(store), total);
  store.state.market.wheat = 0;
  store.state.market.flour = 0;
  store.state.market.bread = 0;
  store.state.day = 271;
  store.tick(240);
  assert.equal(
    store.state.market.bread,
    0,
    "winter's one wheat cannot feed a milling batch",
  );
});

test("a funded order needs physical acceptance and delivery, consumes real goods, and pays once", () => {
  const store = game();
  assert.ok(store.state.economy);
  store.tick(240);
  const order = store.state.economy.orders[0];
  assert.ok(order, "first civic order should appear on day two");
  assert.equal(order.status, "available");
  store.act(`order-accept:${order.id}`);
  assert.equal(order.status, "available");
  at(store, 1390, 1090);
  store.act(`order-accept:${order.id}`);
  assert.equal(order.status, "accepted");
  const before = store.state.gold;
  const funds = store.state.economy.civicFunds;
  const quantity = store.state.inventory[order.item];
  store.act(`order-deliver:${order.id}`);
  assert.equal(store.state.gold, before);
  at(store, 1280, 820);
  store.act(`order-deliver:${order.id}`);
  assert.equal(order.status, "fulfilled");
  assert.equal(store.state.gold, before + order.reward);
  assert.equal(store.state.economy.civicFunds, funds - order.reward);
  assert.equal(store.state.inventory[order.item], quantity - order.quantity);
  assert.equal(store.state.economy.prosperity, 60);
  store.act(`order-deliver:${order.id}`);
  assert.equal(store.state.gold, before + order.reward);
  assert.ok(
    store.state.apostle.memories.some((memory) =>
      /abastecimento|pedido/i.test(memory.text),
    ),
  );
});

test("accepted missed deadlines fail without payout while ignored orders use market stock and civic funds", () => {
  for (const accepted of [false, true]) {
    const store = game();
    assert.ok(store.state.economy);
    store.tick(240);
    const order = store.state.economy.orders[0];
    assert.ok(order);
    if (accepted) {
      at(store, 1390, 1090);
      store.act(`order-accept:${order.id}`);
    }
    const gold = store.state.gold;
    const total = money(store);
    store.tick(240 * 3);
    assert.equal(order.status, accepted ? "failed" : "resolved");
    assert.equal(store.state.gold, gold);
    assert.equal(money(store), total);
    if (accepted) {
      assert.equal(store.state.economy.prosperity, 47);
      assert.ok(
        store.state.apostle.memories.some((memory) =>
          /prazo/.test(memory.text),
        ),
      );
      at(store, 1280, 820);
      store.act(`order-deliver:${order.id}`);
      assert.equal(store.state.gold, gold);
    }
  }
});

test("unfunded civic budgets cannot generate orders or pay an invented reward", () => {
  const store = game();
  assert.ok(store.state.economy);
  store.state.economy.civicFunds = 0;
  const total = money(store);
  store.tick(240 * 8);
  assert.equal(store.state.economy.orders.length, 0);
  assert.equal(store.state.economy.civicFunds, 0);
  assert.ok(store.state.merchantGold < 450, "the merchant can still fund regional labor with its own cash");
  assert.equal(money(store), total);
});

test("one long interval and daily intervals produce the same estate and finite economy", () => {
  const fast = game();
  const slow = game();
  for (const store of [fast, slow]) {
    estate(store);
    store.state.gold = 200;
    store.state.inventory.seed = 2;
    store.act("hire:farmer");
  }
  fast.tick(240 * 12);
  for (let day = 0; day < 12; day++) slow.tick(240);
  assert.deepEqual(fast.state.economy, slow.state.economy);
  assert.deepEqual(fast.state.inventory, slow.state.inventory);
  assert.deepEqual(fast.state.market, slow.state.market);
  assert.equal(fast.state.gold, slow.state.gold);
  assert.equal(fast.state.merchantGold, slow.state.merchantGold);
});

test("economic records stay bounded and closed campaigns do not process wages or orders", () => {
  const store = game();
  const economy = estate(store);
  store.state.gold = 200;
  store.act("hire:farmer");
  store.tick(240 * 20);
  assert.ok(economy.ledger.length > 0);
  assert.ok(economy.ledger.length <= 30);
  store.returnTitle();
  const before = JSON.stringify(store.state);
  store.tick(240 * 20);
  assert.equal(JSON.stringify(store.state), before);
});
