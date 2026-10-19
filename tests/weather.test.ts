import test from "node:test";
import assert from "node:assert/strict";
import type { Zone } from "../src/types";

async function weather() {
  const module = await import("../src/weather").catch(() => null);
  assert.ok(module, "the pure calendar weather API must exist");
  return module;
}

test("calendar weather repeats without shared mutable snapshots and starts clear", async () => {
  const { weatherFor } = await weather();
  for (const zone of ["village", "wilderness", "highlands"] as Zone[]) {
    assert.equal(weatherFor(1, 0, zone).kind, "clear");
    for (const minutes of [0, 480, 720, 1439]) {
      const first = weatherFor(148, minutes, zone);
      const saved = structuredClone(first);
      first.temperature = 999;
      assert.deepEqual(weatherFor(148, minutes, zone), saved);
      assert.ok(saved.wind >= 0 && saved.wind <= 1);
      assert.ok(saved.cloudiness >= 0 && saved.cloudiness <= 1);
      assert.ok(saved.precipitation >= 0 && saved.precipitation <= 1);
    }
  }
});

test("seasons produce different predictable distributions and summer is warmer than winter", async () => {
  const { weatherFor } = await weather();
  const seasons = Array.from({ length: 4 }, (_, season) =>
    Array.from({ length: 90 }, (_, index) => weatherFor(1 + season * 90 + index, 720, "village")));
  const counts = seasons.map(days => Object.fromEntries(["clear", "cloudy", "rain", "fog"].map(kind =>
    [kind, days.filter(day => day.kind === kind).length])));
  assert.ok(counts.every(count => Object.values(count).every(value => value > 0)));
  assert.ok(counts[0].rain > counts[1].rain, "spring rain is more frequent than summer rain");
  assert.ok(counts[1].clear > counts[3].clear, "summer has more clear skies than winter");
  const average = (index: number) => seasons[index].reduce((sum, day) => sum + day.temperature, 0) / 90;
  assert.ok(average(1) > average(3) + 10);
});

test("shelter removes precipitation and work penalties while the daily sky stays stable", async () => {
  const { weatherFor } = await weather();
  const rainDay = Array.from({ length: 90 }, (_, index) => index + 2)
    .find(day => weatherFor(day, 720, "village").kind === "rain");
  assert.ok(rainDay);
  for (const zone of ["village", "wilderness", "highlands"] as Zone[]) {
    const rain = weatherFor(rainDay, 720, zone);
    assert.equal(rain.outdoors, true);
    assert.ok(rain.precipitation > 0);
    assert.equal(rain.gatheringRate, 0.8);
    assert.equal(rain.supplyPenalty, 1);
    assert.equal(weatherFor(rainDay, 0, zone).kind, rain.kind);
  }
  for (const zone of ["mine", "dungeon", "inn-room", "orphanage", "ranger-room"] as Zone[]) {
    const sheltered = weatherFor(rainDay, 720, zone);
    assert.equal(sheltered.outdoors, false);
    assert.equal(sheltered.precipitation, 0);
    assert.equal(sheltered.gatheringRate, 1);
    assert.equal(sheltered.supplyPenalty, 0);
  }
});

test("forecast includes today and two following days with no calendar mutation", async () => {
  const { weatherFor, weatherForecast } = await weather();
  assert.deepEqual(weatherForecast(89), [89, 90, 91].map(day => weatherFor(day, 720, "village")));
  assert.deepEqual(weatherForecast(90, "highlands", 5), [90, 91, 92, 93, 94].map(day => weatherFor(day, 720, "highlands")));
  assert.deepEqual(weatherForecast(1, "village", 0), []);
  for (const day of [NaN, Infinity, -7]) {
    assert.equal(weatherFor(day, NaN, "village").day, 1);
    assert.ok(Number.isFinite(weatherFor(day, NaN, "village").temperature));
  }
});
