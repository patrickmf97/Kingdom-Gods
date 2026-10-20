import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { validateState } from "../src/persistence";
import { weatherFor } from "../src/weather";

function game() {
  const store = new GameStore();
  store.create({ name: "Rowan", surname: "Valen", sex: "male", skin: "#d3a17b",
    hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  store.choose("leave-orphanage");
  Object.assign(store.state.apostle, { x: 450, y: 790 }); store.interact("exit");
  store.state.day = Array.from({ length: 360 }, (_, i) => i + 2)
    .find(day => weatherFor(day, 720, "village").kind === "storm")!;
  store.state.minutes = 720;
  return store;
}
function pendingStrike(store: GameStore, remaining = .2) {
  const { x, y } = store.state.apostle;
  Object.assign(store.state.worldLife.storm, { sequence: 1, cooldown: 0,
    warning: { id: 1, zone: "village", x, y, remaining }, impact: null });
}
function tick(store: GameStore, seconds: number) {
  for (let elapsed = 0; elapsed < seconds - 1e-7; elapsed += .1) store.tick(.1);
}

test("GameStore applies a saved strike once, records the wound and restores a non-damaging receipt", async () => {
  const store = game(); pendingStrike(store);
  const hp = store.state.apostle.hp, restored = new GameStore();
  await restored.importCampaign(store.exportCampaign());
  assert.equal(restored.state.worldLife.storm.warning?.remaining, .2);
  tick(restored, .3);
  assert.equal(restored.state.apostle.hp, hp - 28);
  assert.equal(restored.state.worldLife.storm.warning, null);
  assert.equal(restored.state.worldLife.storm.impact?.id, 1);
  assert.equal(restored.state.apostle.memories.filter(memory => memory.title === "O céu tocou a terra").length, 1);
  assert.equal(validateState(restored.state), true);
  const receipt = new GameStore(); await receipt.importCampaign(restored.exportCampaign());
  tick(receipt, 2);
  assert.equal(receipt.state.apostle.hp, hp - 28);
  assert.equal(receipt.state.worldLife.storm.impact, null);
  assert.equal(receipt.state.apostle.memories.filter(memory => memory.title === "O céu tocou a terra").length, 1);
});

test("lightning respects GameStore pause, dodge and interiors; lethal damage uses permanent death", () => {
  const paused = game(); pendingStrike(paused); paused.state.phase = "title";
  const before = structuredClone(paused.state); tick(paused, 1); assert.deepEqual(paused.state, before);
  const dodging = game(); pendingStrike(dodging); const hp = dodging.state.apostle.hp;
  dodging.dodge(); tick(dodging, .3); assert.equal(dodging.state.apostle.hp, hp);
  const sheltered = game(); pendingStrike(sheltered); sheltered.setZone("inn-room");
  tick(sheltered, 1); assert.equal(sheltered.state.apostle.hp, hp);
  assert.equal(sheltered.state.worldLife.storm.warning, null);
  const doomed = game(); doomed.state.apostle.hp = 20; pendingStrike(doomed); tick(doomed, .3);
  assert.equal(doomed.state.phase, "dead"); assert.equal(doomed.state.apostle.alive, false);
  assert.equal(doomed.state.deaths, 1); assert.equal(doomed.state.worldLife.storm.warning, null);
  assert.equal(validateState(doomed.state), true, "a lethal receipt must still be saveable");
  tick(doomed, 10); assert.equal(doomed.state.deaths, 1);
  doomed.act("succeed:alpha12-merchant-grain"); assert.equal(doomed.state.phase, "dead");
});

test("visitors can trade and form memories but cannot become spouses or crypt companions", async () => {
  const store = game(), id = "alpha12-merchant-grain", npc = store.state.npcs.find(npc => npc.id === id)!;
  Object.assign(npc, { x: store.state.apostle.x, y: store.state.apostle.y, relation: 100, trust: 100 });
  const dialog = store.interact(id)!;
  assert.ok(dialog.options.some(option => option.action === "open-travelers"));
  assert.ok(dialog.options.every(option => !/^(court|marry):/.test(option.action)));
  const bread = store.state.inventory.bread;
  store.act(`court:${id}`); store.act(`marry:${id}`);
  assert.equal(store.state.apostle.partnerId, undefined); assert.equal(store.state.inventory.bread, bread);
  assert.ok(!store.state.family.some(person => person.id === id));
  store.act(`socialize:${id}`);
  assert.ok(store.state.simulation.npcMemories[id]?.length);
  const trader = store.state.worldLife.travelers[id], coins = store.state.gold + trader.gold;
  const stock = trader.stock.bread, quote = store.price("bread", true);
  store.act(`traveler-buy:${id}:bread`);
  assert.equal(store.state.gold + trader.gold, coins);
  assert.equal(trader.stock.bread, stock - 1); assert.equal(store.state.inventory.bread, bread + 1);
  assert.ok(store.state.gold < 48 && quote > 0);
  const saved = new GameStore(); await saved.importCampaign(store.exportCampaign());
  assert.deepEqual(saved.state.worldLife.travelers[id], trader);
  store.state.simulation.npcMemories[id] = Array.from({ length: 3 }, (_, i) => ({
    id: `visit-${i}`, day: store.state.day, title: "Encontro", text: "Amizade na estrada", emotion: "Confiança", intensity: 70,
  }));
  store.setZone("dungeon"); assert.notEqual(store.state.simulation.companionId, id);
  assert.notEqual(npc.zone, "dungeon");
});

test("resource dialogs show the actual storm gathering rate", () => {
  const store = game(); Object.assign(store.state.apostle, { x: 520, y: 1060 });
  // The shared node lookup still enforces physical proximity in interact().
  const node = store.state.frontier.resources;
  assert.ok(Object.keys(node).length === 67);
  // Pick an actual authored outdoor node rather than inventing an interaction ID.
  return import("../src/regions").then(({ RESOURCE_NODES }) => {
    const resource = RESOURCE_NODES.find(node => node.zone === "village")!;
    Object.assign(store.state.apostle, { x: resource.x, y: resource.y });
    assert.match(store.interact(resource.id)!.text, /tempestade.*65%/i);
  });
});
