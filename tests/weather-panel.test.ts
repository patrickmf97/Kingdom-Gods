import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeatherChip, WeatherPanel } from "../src/WeatherPanel";
import { initialState } from "../src/simulation";
import { weatherFor } from "../src/weather";

test("forecast renders three dated days and the current work consequences", () => {
  const state = initialState();
  state.zone = "village";
  const html = renderToStaticMarkup(createElement(WeatherPanel, { state }));
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.match(html, /Hoje · 1/);
  assert.match(html, /Amanhã · 2/);
  assert.match(html, /Depois · 3/);
  assert.match(html, /100% do ritmo/);
  assert.match(html, /Capacidade normal/);
  assert.match(html, /Oficinas internas/);
});

test("rain forecast distinguishes sheltered work from the exterior restock penalty", () => {
  const state = initialState();
  state.day = Array.from({ length: 90 }, (_, index) => index + 2)
    .find(day => weatherFor(day, 720, "village").kind === "rain")!;
  assert.ok(state.day);
  state.zone = "village";
  const outdoors = renderToStaticMarkup(createElement(WeatherPanel, { state }));
  assert.match(outdoors, /80% do ritmo/);
  assert.match(outdoors, /Capacidade −1 por produto/);
  state.zone = "inn-room";
  const indoors = renderToStaticMarkup(createElement(WeatherPanel, { state }));
  assert.match(indoors, /Ao abrigo/);
  assert.match(indoors, /100% do ritmo/);
  assert.match(indoors, /Capacidade −1 por produto/);
});

test("weather chip is an accessible forecast action with the live weather label", () => {
  const state = initialState();
  state.zone = "village";
  const current = weatherFor(state.day, state.minutes, state.zone);
  const html = renderToStaticMarkup(createElement(WeatherChip, { state, season: "Primavera", onOpen: () => {} }));
  assert.match(html, /^<button/);
  assert.ok(html.includes(`${current.temperature}°`));
  assert.ok(html.includes(current.label));
  assert.match(html, /Abrir previsão no diário/);
  assert.match(html, /lucide/);
});

test("storm warnings show the saved countdown only in the exposed current zone", async () => {
  const { StormWarning } = await import("../src/WeatherPanel");
  const state = initialState();
  state.worldLife ??= { residents: [], travelers: {}, storm: { sequence: 0, cooldown: 12, warning: null, impact: null } };
  state.phase = "playing";
  state.zone = "village";
  state.worldLife.storm.warning = { id: 12, zone: "village", x: 1000, y: 1100, remaining: 2.3 };
  const render = () => renderToStaticMarkup(createElement(StormWarning, { state }));
  assert.match(render(), /3 s/);
  assert.match(render(), /Saia da área marcada ou procure abrigo/);
  assert.match(render(), /procure abrigo/);
  state.zone = "inn-room";
  assert.equal(render(), "");
  state.zone = "highlands";
  assert.equal(render(), "");
  state.zone = "village";
  state.apostle.alive = false;
  assert.equal(render(), "");
});

test("storm forecast names lightning risk and the 65 percent exterior gathering rate", () => {
  const state = initialState();
  state.day = Array.from({ length: 360 }, (_, i) => i + 2).find(day => weatherFor(day, 720, "village").kind === "storm")!;
  assert.ok(state.day);
  state.zone = "village";
  const html = renderToStaticMarkup(createElement(WeatherPanel, { state }));
  assert.match(html, /65% do ritmo/);
  assert.match(html, /raios/i);
  state.zone = "inn-room";
  assert.match(renderToStaticMarkup(createElement(WeatherPanel, { state })), /100% do ritmo/);
});
