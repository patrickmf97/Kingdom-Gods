import test from "node:test";
import assert from "node:assert/strict";
import { GameStore, initialState } from "../src/simulation";
import { exportCampaign, parseCampaign } from "../src/campaign-files";
import { validateState } from "../src/persistence";
import type { Person } from "../src/types";

async function identityApi() {
  const identity = await import("../src/character-identity").catch(() => null);
  assert.ok(identity?.npcVisualIdentity, "NPC appearance must have one pure identity source shared with marriage");
  return identity.npcVisualIdentity;
}
function game() {
  const store = new GameStore();
  store.create({ name: "Rowan", surname: "Valen", sex: "male", skin: "#d3a17b", hair: "#493327",
    eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  store.choose("leave-orphanage");
  Object.assign(store.state.apostle, { x: 450, y: 790 }); store.interact("exit");
  return store;
}
const traits = (person: Pick<Person, "skin" | "hair" | "eyes" | "outfit" | "sex" | "age">) => ({
  skin: person.skin, hair: person.hair, eyes: person.eyes, outfit: person.outfit, sex: person.sex, age: person.age,
});

test("the shared identity retains established NPC colours, age and registered roles without modifying a campaign", async () => {
  const appearance = await identityApi(), state = initialState(), before = structuredClone(state);
  const mira = state.npcs.find(npc => npc.id === "mira")!;
  const identity = appearance(state, mira);
  assert.deepEqual(identity, { skin: "#8b5b42", hair: "#614c3d", eyes: "#566d59", outfit: mira.color,
    sex: "female", age: 29, role: "farmer", variant: "mira" });
  const baker = state.npcs.find(npc => npc.id === "alpha12-baker")!;
  assert.equal(appearance(state, baker).role, "baker");
  state.worldLife.residents = state.worldLife.residents.filter(id => id !== baker.id);
  assert.equal(appearance(state, baker).role, "traveler", "an unregistered colliding identity cannot acquire the new profession");
  state.worldLife.residents = before.worldLife.residents;
  assert.equal(appearance(state, { ...mira, id: "toString" }).role, "traveler",
    "an unknown historical identity cannot inherit an Object prototype as its visual profession");
  assert.deepEqual(state, before, "appearance lookup cannot fill defaults or mutate saved state");
});

test("marriage preserves the displayed physical identity, possessions and a valid v8 round trip", async () => {
  const appearance = await identityApi();
  for (const id of ["mira", "guard", "alpha12-baker", "alpha12-ranger"]) {
    const store = game(), npc = store.state.npcs.find(npc => npc.id === id)!;
    store.state.zone = npc.zone;
    Object.assign(store.state.apostle, { x: npc.x, y: npc.y }); npc.relation = 100; npc.trust = 100;
    const before = appearance(store.state, npc), inventory = structuredClone(store.state.inventory), gold = store.state.gold;
    store.act(`marry:${id}`);
    const spouse = store.state.family.find(person => person.id === id)!;
    assert.ok(spouse, `${id} became an actual family member`);
    assert.deepEqual(traits(spouse), traits(before), `${id} must not change face, palette or age upon marriage`);
    assert.deepEqual(appearance(store.state, npc), before);
    assert.equal(spouse.birthDay, store.state.day - spouse.age * 360);
    assert.equal(store.state.gold, gold); assert.deepEqual(store.state.inventory, inventory);
    assert.equal(validateState(store.state), true);
    const saved = parseCampaign(exportCampaign(store.state));
    assert.deepEqual(appearance(saved, saved.npcs.find(npc => npc.id === id)!), before);
    assert.equal(saved.version, 8);
  }
});

test("saved family appearance and age override presentation defaults after import without altering the legacy person", async () => {
  const appearance = await identityApi(), store = game(), npc = store.state.npcs.find(npc => npc.id === "mira")!;
  const relative: Person = { id: npc.id, name: npc.name, surname: "Dorn", sex: "male", skin: "#8c604b",
    hair: "#c8c2b4", eyes: "#493f70", outfit: "#7d3643", age: 68, birthDay: 1 - 68 * 360,
    alive: true, generation: 1, parents: [], title: "Membro da casa" };
  store.state.family.push(relative);
  const before = structuredClone(store.state), identity = appearance(store.state, npc);
  assert.deepEqual(traits(identity), traits(relative)); assert.deepEqual(store.state, before);
  const saved = parseCampaign(exportCampaign(store.state));
  assert.deepEqual(saved.family.find(person => person.id === npc.id), relative);
  assert.deepEqual(appearance(saved, saved.npcs.find(person => person.id === npc.id)!), identity);
});
