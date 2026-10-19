import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { objectsForZone } from "../src/regions";
import { clearSavedGame, loadGame, saveGame, validateState } from "../src/persistence";

test("a married successor can immediately save after a dungeon death with another companion", async () => {
  const game = new GameStore();
  Object.assign(game.state, { started: true, phase: "playing", intro: false, zone: "village" });
  const mira = game.state.npcs.find(npc => npc.id === "mira")!;
  Object.assign(mira, { relation: 90, trust: 80 });
  Object.assign(game.state.apostle, { x: mira.x, y: mira.y });
  game.act("marry:mira");
  assert.equal(game.state.apostle.partnerId, "mira");

  const friend = game.state.npcs.find(npc => npc.id === "guard")!;
  Object.assign(friend, { relation: 90, trust: 80 });
  game.state.simulation.npcMemories.guard = Array.from({ length: 3 }, (_, index) => ({
    id: `friend-${index}`, day: game.state.day, title: "Uma amizade construída",
    text: "Cedric se recorda de uma conversa com o apóstolo.", emotion: "Lealdade", intensity: 60,
  }));
  const crypt = objectsForZone("village").find(object => object.id === "dungeon")!;
  Object.assign(game.state.apostle, { x: crypt.x, y: crypt.y + 60 });
  game.interact("dungeon");
  assert.equal(game.state.zone, "dungeon");
  assert.equal(game.state.simulation.companionId, friend.id);
  assert.equal(friend.zone, "dungeon");
  assert.equal(validateState(game.state), true);

  game.damage(game.state.apostle.maxHp);
  assert.equal(game.state.phase, "dead");
  assert.equal(validateState(game.state), true);
  game.act("succeed:mira");
  assert.equal(game.state.phase, "playing");
  assert.equal(game.state.apostle.id, "mira");
  assert.equal(game.state.zone, "village");
  assert.equal(game.state.simulation.companionId, undefined);
  assert.equal(validateState(game.state), true, "inheritance must be immediately saveable before another simulation tick");

  await clearSavedGame();
  try {
    const saved = await saveGame(game.state);
    const loaded = await loadGame();
    assert.deepEqual(loaded, saved);
    assert.equal(loaded?.apostle.id, "mira");
    assert.equal(validateState(loaded), true);
  } finally {
    await clearSavedGame();
  }
});
