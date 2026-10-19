import test from "node:test";
import assert from "node:assert/strict";
import type { Creation, Person } from "../src/types";
import type { GameStore } from "../src/simulation";

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
async function makeGame(blessing: Creation["blessing"] = "vigor") {
  const module = await import("../src/simulation").catch(() => null);
  assert.ok(module, "GameStore simulation must be implemented");
  const game = new module.GameStore();
  game.create({ ...creation, blessing });
  return game;
}
function person(id: string, age = 23): Person {
  return {
    id,
    name: "Mira",
    surname: "Valen",
    sex: "female",
    skin: "#c69b76",
    hair: "#50362a",
    eyes: "#779787",
    outfit: "#a9806d",
    age,
    birthDay: 1 - age * 360,
    alive: true,
    generation: 1,
    parents: [],
    title: "Companheira",
  };
}
function leave(game: GameStore) {
  game.choose("leave-orphanage");
  game.state.apostle.x = 450;
  game.state.apostle.y = 790;
  game.interact("exit");
}

test("blessings change attributes and fortune lowers the same merchant price", async () => {
  const vigor = await makeGame("vigor");
  const wisdom = await makeGame("wisdom");
  const fortune = await makeGame("fortune");
  assert.equal(vigor.state.apostle.maxHp, wisdom.state.apostle.maxHp + 25);
  assert.equal(
    vigor.state.apostle.maxStamina,
    wisdom.state.apostle.maxStamina + 20,
  );
  assert.equal(
    wisdom.state.apostle.attributes.intelligence,
    vigor.state.apostle.attributes.intelligence + 4,
  );
  assert.ok(fortune.price("sword", true) < vigor.price("sword", true));
});

test("orphanage introduction gives a bounded starting estate and records the farewell once", async () => {
  const game = await makeGame();
  assert.equal(game.state.zone, "orphanage");
  assert.ok(game.interact("matron"));
  game.choose("leave-orphanage");
  assert.equal(
    game.state.zone,
    "orphanage",
    "receiving belongings leaves physical exploration available",
  );
  assert.equal(game.state.intro, false);
  const gold = game.state.gold;
  assert.ok(gold > 0);
  assert.ok(game.state.inventory.bread > 0);
  game.choose("leave-orphanage");
  assert.equal(game.state.gold, gold);
  assert.ok(
    game.state.apostle.memories.some((memory) => /Elara/.test(memory.text)),
  );
  game.state.apostle.x = 450;
  game.state.apostle.y = 790;
  game.interact("exit");
  assert.equal(game.state.zone, "village");
  assert.deepEqual(
    { x: game.state.apostle.x, y: game.state.apostle.y },
    { x: 736, y: 648 },
  );
});

test("market transactions require proximity and preserve both sides of the economy", async () => {
  const game = await makeGame("fortune");
  leave(game);
  const before = game.state.gold;
  game.act("buy:sword");
  assert.equal(game.state.gold, before);
  game.state.apostle.x = 1280;
  game.state.apostle.y = 920;
  const merchantBefore = game.state.merchantGold;
  const quote = game.price("sword", true);
  game.act("buy:sword");
  assert.equal(game.state.gold, before - quote);
  assert.equal(game.state.merchantGold, merchantBefore + quote);
  assert.equal(game.state.inventory.sword, 1);
  game.act("equip:sword");
  assert.equal(game.state.apostle.equipment, "sword");
  game.state.inventory.wheat = 1;
  const sale = game.price("wheat", false);
  const preSale = game.state.gold;
  game.act("sell:wheat");
  assert.equal(game.state.gold, preSale + sale);
  game.act("sell:wheat");
  assert.equal(game.state.gold, preSale + sale);
  assert.ok(
    Object.values(game.state.inventory).every((quantity) => quantity >= 0),
  );
});

test("property planting consumes seed and harvest becomes available after two days", async () => {
  const game = await makeGame();
  leave(game);
  game.state.apostle.x = 1900;
  game.state.apostle.y = 1030;
  game.state.gold = 500;
  game.act("acquire-property");
  assert.equal(game.state.property.owned, true);
  const seed = game.state.inventory.seed;
  game.act("plant");
  assert.equal(game.state.inventory.seed, seed - 1);
  game.act("harvest");
  assert.equal(game.state.inventory.wheat, 0);
  game.tick(480);
  game.act("harvest");
  assert.ok(game.state.inventory.wheat >= 5);
  assert.equal(game.state.property.harvests, 1);
  assert.ok(game.state.apostle.skills.farming > 0);
});

test("calendar advances at six game minutes per second and movement is normalized", async () => {
  const game = await makeGame();
  leave(game);
  const { x, y } = game.state.apostle;
  game.move(1, 1, 1);
  assert.ok(
    Math.abs(
      Math.hypot(game.state.apostle.x - x, game.state.apostle.y - y) - 170,
    ) < 0.01,
  );
  game.tick(240);
  assert.equal(game.state.day, 2);
  game.state.day = 360;
  game.state.minutes = 1439;
  game.tick(1);
  assert.equal(game.state.day, 361);
  assert.equal(game.getCalendar().year, 2);
  assert.equal(game.state.apostle.age, 17);
});

test("death permits a living partner successor and carries family resources forward", async () => {
  const game = await makeGame();
  leave(game);
  const spouse = person("mira");
  spouse.partnerId = game.state.apostle.id;
  game.state.apostle.partnerId = spouse.id;
  game.state.family.push(spouse);
  const gold = game.state.gold;
  game.damage(1000);
  assert.equal(game.state.phase, "dead");
  game.act("succeed:mira");
  assert.equal(game.state.phase, "playing");
  assert.equal(game.state.apostle.id, "mira");
  assert.equal(game.state.gold, gold);
  assert.ok(game.state.family.some((member) => member.id === "mira") === false);
  assert.ok(
    game.state.family.some(
      (member) => !member.alive && member.name === "Rowan",
    ),
  );
});

test("an unrelated person cannot inherit and fresh creation clears a dead dynasty estate", async () => {
  const game = await makeGame();
  leave(game);
  game.state.family.push(person("outsider"));
  game.damage(1000);
  game.act("succeed:outsider");
  assert.equal(game.state.phase, "dead");
  game.startCreation();
  game.create(creation);
  assert.equal(game.state.gold, 0);
  assert.equal(game.state.family.length, 0);
  assert.equal(game.state.property.owned, false);
});

test("save validation rejects corrupt numbers and load does not simulate offline time", async () => {
  const game = await makeGame();
  leave(game);
  const persistence = await import("../src/persistence");
  assert.equal(persistence.validateState(game.state), true);
  assert.equal(persistence.validateState({ ...game.state, gold: -1 }), false);
  assert.equal(
    persistence.validateState({ ...game.state, minutes: Number.NaN }),
    false,
  );
  assert.equal(
    persistence.validateState({
      ...game.state,
      apostle: { ...game.state.apostle, skills: {} },
    }),
    false,
  );
  assert.equal(
    persistence.validateState({
      ...game.state,
      apostle: {
        ...game.state.apostle,
        skills: { ...game.state.apostle.skills, sword: Number.NaN },
      },
    }),
    false,
  );
  await game.save();
  const next = await makeGame();
  assert.equal(await next.load(), true);
  assert.equal(next.state.day, game.state.day);
  assert.equal(next.state.apostle.hp, game.state.apostle.hp);
  assert.deepEqual(next.state.apostle.memories, game.state.apostle.memories);
});

test("sword combat defeats three skeletons and quest reward can only be claimed once", async () => {
  const game = await makeGame();
  leave(game);
  game.state.apostle.x = 1390;
  game.state.apostle.y = 1090;
  game.act("quest-accept");
  game.state.inventory.sword = 1;
  game.act("equip:sword");
  game.setZone("dungeon");
  for (const enemy of game.state.enemies) {
    while (enemy.alive) {
      game.state.apostle.x = enemy.x;
      game.state.apostle.y = enemy.y + 90;
      game.attack();
      game.tick(0.5);
    }
  }
  assert.equal(game.state.kills, 3);
  assert.equal(game.state.quest, "complete");
  assert.equal(game.state.inventory.ore, 3);
  game.setZone("village");
  game.state.apostle.x = 1390;
  game.state.apostle.y = 1090;
  const gold = game.state.gold;
  game.act("quest-claim");
  game.act("quest-claim");
  assert.equal(game.state.gold, gold + 45);
  assert.equal(game.state.quest, "claimed");
});

test("friendship memories recruit a companion who autonomously protects the apostle", async () => {
  const game = await makeGame();
  leave(game);
  const guard = game.state.npcs.find((npc) => npc.id === "guard")!;
  for (let index = 0; index < 6; index++) {
    game.state.apostle.x = guard.x;
    game.state.apostle.y = guard.y;
    game.act("socialize:guard");
    game.tick(12.1);
  }
  game.setZone("dungeon");
  assert.equal(game.state.simulation.companionId, "guard");
  const enemy = game.state.enemies[0];
  game.state.apostle.x = enemy.x;
  game.state.apostle.y = enemy.y + 50;
  const beforeHp = enemy.hp;
  game.tick(0.1);
  assert.ok(enemy.hp < beforeHp);
  assert.ok(
    game.state.messages.some((message) => /defende você/.test(message.text)),
  );
});

test("marriage and parenthood obey their waiting period and a child inherits under regency", async () => {
  const game = await makeGame();
  leave(game);
  const mira = game.state.npcs.find((npc) => npc.id === "mira")!;
  mira.relation = 90;
  mira.trust = 80;
  game.state.apostle.x = mira.x;
  game.state.apostle.y = mira.y;
  game.act("marry:mira");
  game.act("child");
  assert.equal(game.state.family.length, 1);
  game.state.inventory.bread = 100;
  game.tick(240 * 16);
  game.state.apostle.x = mira.x;
  game.state.apostle.y = mira.y;
  game.act("child");
  const child = game.state.family.find((person) =>
    person.parents.includes(game.state.apostle.id),
  )!;
  assert.ok(child);
  assert.equal(child.age, 0);
  game.damage(1000);
  game.act(`succeed:${child.id}`);
  assert.equal(game.state.apostle.age, 0);
  assert.match(game.state.apostle.title, /regência/);
  game.setZone("dungeon");
  assert.equal(game.state.zone, "village");
});

test("a successor does not leave a duplicate copy of themselves walking in the village", async () => {
  const game = await makeGame();
  leave(game);
  const spouse = person("mira");
  game.state.apostle.partnerId = spouse.id;
  game.state.family.push(spouse);
  game.damage(1000);
  game.act("succeed:mira");
  assert.equal(
    game.state.npcs.some((npc) => npc.id === game.state.apostle.id),
    false,
  );
});

test("merchant spread cannot become a repeatable money machine at maximum trading skill", async () => {
  const game = await makeGame("fortune");
  leave(game);
  game.state.apostle.x = 1280;
  game.state.apostle.y = 920;
  game.state.apostle.skills.trading = 100;
  game.state.market.sword = 3;
  game.state.gold = 500;
  const startGold = game.state.gold;
  for (let index = 0; index < 10; index++) {
    game.act("buy:sword");
    game.act("sell:sword");
  }
  assert.ok(game.state.gold < startGold);
});

test("a widowed apostle may form a new union and cannot marry themselves", async () => {
  const game = await makeGame();
  leave(game);
  const spouse = person("mira", 89);
  spouse.birthDay = 2 - 90 * 360;
  game.state.apostle.partnerId = spouse.id;
  game.state.family.push(spouse);
  game.tick(240);
  assert.equal(spouse.alive, false);
  assert.equal(game.state.apostle.partnerId, undefined);
});

test("critical injury triggers an autonomous retreat that overrides attack and movement commands", async () => {
  const game = await makeGame();
  leave(game);
  game.setZone("dungeon");
  game.state.inventory.bread = 0;
  game.state.apostle.hp = 15;
  game.state.apostle.x = 360;
  game.state.apostle.y = 390;
  const beforeY = game.state.apostle.y;
  game.tick(0.1);
  assert.ok(
    game.state.apostle.y > beforeY,
    "apostle chooses to flee toward the exit",
  );
  const position = { x: game.state.apostle.x, y: game.state.apostle.y };
  game.move(-1, -1, 0.1);
  assert.deepEqual(
    { x: game.state.apostle.x, y: game.state.apostle.y },
    position,
  );
  const enemyHp = game.state.enemies[0].hp;
  game.attack();
  assert.equal(game.state.enemies[0].hp, enemyHp);
  assert.ok(
    game.state.messages.some((message) => /vontade própria/.test(message.text)),
  );
});

test("legacy saves with partial simulation metadata are normalized safely", async () => {
  const game = await makeGame();
  leave(game);
  const persistence = await import("../src/persistence");
  await persistence.saveGame({
    ...game.state,
    simulation: {},
  } as unknown as Parameters<typeof persistence.saveGame>[0]);
  const next = await makeGame();
  assert.equal(await next.load(), true);
  const mira = next.state.npcs.find((npc) => npc.id === "mira")!;
  next.state.apostle.x = mira.x;
  next.state.apostle.y = mira.y;
  assert.ok(next.interact("mira"));
});

test("coming of age ends regency and natural death still happens with a full pantry", async () => {
  const game = await makeGame();
  leave(game);
  game.state.apostle.age = 15;
  game.state.apostle.birthDay = 2 - 16 * 360;
  game.state.apostle.title = "Herdeiro sob regência";
  game.state.inventory.bread = 100;
  game.tick(240);
  assert.equal(game.state.apostle.age, 16);
  assert.equal(game.state.apostle.title, "Guardião da linhagem");
  game.state.apostle.age = 89;
  game.state.apostle.birthDay = 3 - 90 * 360;
  game.tick(240);
  assert.equal(game.state.phase, "dead");
  assert.ok(
    game.state.apostle.memories.some((memory) => /natural/.test(memory.text)),
  );
});

test("Cedric can inherit the apostle role and claim the crypt reward without an NPC duplicate", async () => {
  const game = await makeGame();
  leave(game);
  const cedric = game.state.npcs.find((npc) => npc.id === "guard")!;
  cedric.relation = 90;
  cedric.trust = 80;
  game.state.apostle.x = cedric.x;
  game.state.apostle.y = cedric.y;
  game.act("marry:guard");
  game.state.quest = "complete";
  game.state.kills = 3;
  game.damage(1000);
  game.act("succeed:guard");
  assert.equal(game.state.apostle.name, "Cedric");
  assert.equal(
    game.state.npcs.some((npc) => npc.id === "guard"),
    false,
  );
  game.state.apostle.x = 1390;
  game.state.apostle.y = 1090;
  const gold = game.state.gold;
  assert.doesNotThrow(() => game.act("quest-claim"));
  assert.equal(game.state.gold, gold + 45);
  assert.equal(game.state.quest, "claimed");
  game.act("quest-claim");
  assert.equal(game.state.gold, gold + 45);
});

test("succession clears the predecessor retreat so the new apostle can move immediately", async () => {
  const game = await makeGame();
  leave(game);
  const spouse = person("mira");
  game.state.family.push(spouse);
  game.state.apostle.partnerId = spouse.id;
  game.setZone("dungeon");
  game.state.inventory.bread = 0;
  game.state.apostle.hp = 15;
  game.state.apostle.x = 360;
  game.state.apostle.y = 390;
  game.tick(0.1);
  game.tick(1);
  assert.ok(game.state.simulation.autonomousUntil);
  game.damage(1000);
  game.act("succeed:mira");
  assert.equal(game.state.phase, "playing");
  assert.equal(game.state.simulation.autonomousUntil, undefined);
  assert.equal(game.state.simulation.autonomousReason, undefined);
  const x = game.state.apostle.x;
  game.move(1, 0, 0.1);
  assert.ok(game.state.apostle.x > x);
});
