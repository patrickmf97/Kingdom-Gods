import test from "node:test";
import assert from "node:assert/strict";
import { weatherFor } from "../src/weather";
import {
  CROP_FERTILE_BONUS, CROP_FERTILIZER_HERBS, CROP_MAX_WATERING, WATERING_STAMINA,
  canWaterCrop, cropStage, fertilizeCrop, harvestCrop, plantCrop, processEconomicDay, waterCrop,
  type EconomicHooks,
} from "../src/economy";
import { initialState } from "../src/simulation";
import { validateState } from "../src/persistence";

const messages: string[] = [];
const hooks: EconomicHooks = {
  message: text => { messages.push(text); }, remember() {}, rememberNpc() {}, practice() {},
  nearObject: () => true, nearNpc: () => false,
};
const isWet = (day: number) => ["rain", "storm"].includes(weatherFor(day, 720, "village").kind);
const dryDay = Array.from({ length: 300 }, (_, i) => i + 2).find(day => !isWet(day) && !isWet(day + 1) && !isWet(day + 2) && !isWet(day + 3))!;
const wetDay = Array.from({ length: 300 }, (_, i) => i + 2).find(day => isWet(day + 1) && !isWet(day))!;

function farm(day = dryDay) {
  const state = initialState();
  state.phase = "playing"; state.day = day;
  state.property.owned = true;
  state.inventory.seed = 2; state.inventory.herb = 4;
  state.apostle.stamina = state.apostle.maxStamina;
  messages.length = 0;
  return state;
}

test("watering adds one wheat per day, once per day, and costs energy", () => {
  const state = farm();
  assert.equal(cropStage(state), "none");
  assert.equal(waterCrop(state, hooks), false, "nothing to water before planting");
  assert.ok(plantCrop(state, hooks));
  const base = state.economy.crop!.yield, stamina = state.apostle.stamina;
  assert.ok(waterCrop(state, hooks));
  assert.equal(state.economy.crop!.yield, base + 1);
  assert.equal(state.economy.crop!.watered, 1);
  assert.equal(state.economy.crop!.lastWatered, state.day);
  assert.equal(state.apostle.stamina, stamina - WATERING_STAMINA);
  assert.equal(waterCrop(state, hooks), false, "a second watering on the same day does nothing");
  assert.equal(state.economy.crop!.yield, base + 1);
  assert.ok(validateState(JSON.parse(JSON.stringify(state))), "cared-for crops remain a valid campaign");
});

test("tired apostles cannot water and ripe wheat cannot be watered", () => {
  const state = farm();
  plantCrop(state, hooks);
  state.apostle.stamina = WATERING_STAMINA - 1;
  assert.equal(waterCrop(state, hooks), false);
  assert.equal(state.economy.crop!.watered ?? 0, 0);
  state.apostle.stamina = state.apostle.maxStamina;
  state.day = state.economy.crop!.readyDay;
  assert.equal(cropStage(state), "ripe");
  assert.equal(canWaterCrop(state), false);
  assert.equal(waterCrop(state, hooks), false);
});

test("watering bonus is capped per crop", () => {
  const state = farm();
  state.day = 271; // winter: the longest growth
  plantCrop(state, hooks);
  const crop = state.economy.crop!, base = crop.yield;
  for (let day = state.day; day < crop.readyDay; day++) {
    state.day = day; state.apostle.stamina = state.apostle.maxStamina;
    waterCrop(state, hooks);
  }
  assert.ok((crop.watered ?? 0) <= CROP_MAX_WATERING);
  assert.ok(crop.yield <= base + CROP_MAX_WATERING);
});

test("green manure uses herbs once per crop and the bonus is harvested", () => {
  const state = farm();
  assert.equal(fertilizeCrop(state, hooks), false, "manure needs a planted crop");
  plantCrop(state, hooks);
  const base = state.economy.crop!.yield;
  assert.ok(fertilizeCrop(state, hooks));
  assert.equal(state.inventory.herb, 4 - CROP_FERTILIZER_HERBS);
  assert.equal(state.economy.crop!.yield, base + CROP_FERTILE_BONUS);
  assert.equal(fertilizeCrop(state, hooks), false);
  assert.equal(state.inventory.herb, 4 - CROP_FERTILIZER_HERBS);
  const wheat = state.inventory.wheat;
  state.day = state.economy.crop!.readyDay;
  assert.ok(harvestCrop(state, hooks));
  assert.equal(state.inventory.wheat, wheat + base + CROP_FERTILE_BONUS);
  assert.equal(state.economy.crop, null);
});

test("without herbs the soil cannot be manured", () => {
  const state = farm();
  plantCrop(state, hooks);
  state.inventory.herb = CROP_FERTILIZER_HERBS - 1;
  assert.equal(fertilizeCrop(state, hooks), false);
  assert.equal(state.economy.crop!.fertile, undefined);
});

test("rain over Valeverde waters a growing crop during the night", () => {
  const state = farm(wetDay);
  plantCrop(state, hooks);
  const base = state.economy.crop!.yield;
  if (state.economy.crop!.readyDay <= wetDay + 1) state.economy.crop!.readyDay = wetDay + 3;
  state.day = wetDay + 1;
  processEconomicDay(state, hooks);
  assert.equal(state.economy.crop!.lastWatered, wetDay + 1);
  assert.equal(state.economy.crop!.yield, base + 1);
  assert.ok(messages.some(text => text.includes("chuva")));
});

test("dry nights leave watering to the apostle", () => {
  const state = farm(dryDay);
  plantCrop(state, hooks);
  const base = state.economy.crop!.yield;
  state.day = dryDay + 1;
  processEconomicDay(state, hooks);
  assert.equal(state.economy.crop!.yield, base);
  assert.equal(state.economy.crop!.lastWatered, undefined);
});

test("older campaigns without care fields stay valid and invalid care data is rejected", () => {
  const state = farm();
  plantCrop(state, hooks);
  const plain = JSON.parse(JSON.stringify(state));
  assert.ok(validateState(plain));
  const broken = JSON.parse(JSON.stringify(state));
  broken.economy.crop.watered = CROP_MAX_WATERING + 5;
  assert.equal(validateState(broken), false);
  const wrongType = JSON.parse(JSON.stringify(state));
  wrongType.economy.crop.fertile = "sim";
  assert.equal(validateState(wrongType), false);
});
