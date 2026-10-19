import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FrontierJobs } from "../src/ExpansionPanels";
import { initialState } from "../src/simulation";
import { objectsForZone } from "../src/regions";

function board() {
  const state = initialState();
  state.phase = "playing";
  state.zone = "village";
  const sign = objectsForZone("village").find(object => object.id === "sign")!;
  state.apostle.x = sign.x;
  state.apostle.y = sign.y;
  return state;
}

// Enabling every card while treasury is empty reproduces the user's failed Accept.
test("unfunded job cards explain the budget and disable acceptance at the board", () => {
  const state = board();
  state.economy.civicFunds = 0;
  const html = renderToStaticMarkup(createElement(FrontierJobs, { state }));
  assert.equal((html.match(/Aguardando verba/g) || []).length, 6);
  assert.equal((html.match(/<button[^>]*disabled/g) || []).length, 3);
  assert.match(html, /0 ouro livres/);
  assert.doesNotMatch(html, />Disponível</);
});

test("funded offers show reserved rewards and enable acceptance at the board", () => {
  const state = board();
  const html = renderToStaticMarkup(createElement(FrontierJobs, { state }));
  assert.equal((html.match(/>Disponível</g) || []).length, 3);
  assert.equal((html.match(/<button[^>]*disabled/g) || []).length, 0);
  assert.match(html, /108 ouro.*ofertas/);
});
