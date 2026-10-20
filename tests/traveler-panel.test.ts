import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TravelerPanel } from "../src/TravelerPanel";
import { initialState } from "../src/simulation";
import { initializePopulation } from "../src/population";
import { travelerQuote } from "../src/travelers";

function campaign() {
  const state = initialState();
  state.worldLife ??= { residents: [], travelers: {}, storm: { sequence: 0, cooldown: 12, warning: null, impact: null } };
  initializePopulation(state);
  state.started = true;
  state.phase = "playing";
  return state;
}
const markup = (state: ReturnType<typeof campaign>) => renderToStaticMarkup(createElement(TravelerPanel, { state, onAction: () => {} }));

test("caravans show live stock and cash; remote trading stays disabled", () => {
  const state = campaign();
  const npc = state.npcs.find(person => person.id === "alpha12-merchant-grain")!;
  state.zone = npc.zone;
  state.apostle.x = npc.x + 151;
  state.apostle.y = npc.y;
  state.worldLife.travelers[npc.id].gold = 73;
  state.worldLife.travelers[npc.id].stock.bread = 7;
  const html = markup(state);
  assert.match(html, /Gaspar/);
  assert.match(html, /Samira/);
  assert.match(html, /Caixa.*73/s);
  assert.match(html, /Estoque.*7/s);
  assert.match(html, /Comprar 1[^<]*<\/button>/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /aproxime-se para negociar/);
});

test("nearby living apostles get quoted unit actions backed by real balances", () => {
  const state = campaign();
  const npc = state.npcs.find(person => person.id === "alpha12-merchant-grain")!;
  state.zone = npc.zone;
  state.apostle.x = npc.x + 150;
  state.apostle.y = npc.y;
  state.gold = 100;
  state.inventory.bread = 2;
  const quote = travelerQuote(state, npc.id, "bread", true)!;
  const html = markup(state);
  assert.ok(html.includes(`${quote.price} ouro`));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 0);
  state.worldLife.travelers[npc.id].stock.bread = 0;
  state.worldLife.travelers[npc.id].gold = 0;
  assert.equal((markup(state).match(/disabled=""/g) ?? []).length, 2);
  state.apostle.alive = false;
  assert.equal((markup(state).match(/disabled=""/g) ?? []).length, 2);
});

test("colliding legacy identities do not become caravan shopkeepers", () => {
  const state = campaign();
  delete state.worldLife.travelers["alpha12-merchant-grain"];
  assert.doesNotMatch(markup(state), /Gaspar/);
});

test("trade controls require a started campaign, the same zone and a living merchant", () => {
  const state = campaign();
  const npc = state.npcs.find(person => person.id === "alpha12-merchant-grain")!;
  state.apostle.x = npc.x;
  state.apostle.y = npc.y;
  state.inventory.bread = 2;
  state.gold = 100;
  state.zone = npc.zone;
  state.started = false;
  assert.equal((markup(state).match(/disabled=""/g) ?? []).length, 2);
  state.started = true;
  state.zone = "highlands";
  assert.equal((markup(state).match(/disabled=""/g) ?? []).length, 2);
  state.zone = npc.zone;
  state.family.push({ ...state.apostle, id: npc.id, alive: false });
  assert.equal((markup(state).match(/disabled=""/g) ?? []).length, 2);
});
