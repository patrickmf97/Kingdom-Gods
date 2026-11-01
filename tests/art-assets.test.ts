import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { assetIdForKind, buildingAsset, hasArtAssets, BUILDING_ASSETS } from "../src/three/art-assets";

test("authored buildings map to the house kinds the world builds, and absent art falls back", () => {
  for (const kind of ["orphanage", "inn", "house", "forge", "bakery", "farm-shed", "owned-home", "estate-home"]) assert.equal(assetIdForKind(kind), kind);
  assert.equal(assetIdForKind("estate-warehouse"), null, "warehouses keep the procedural model");
  assert.equal(hasArtAssets(), false);
  assert.equal(buildingAsset("orphanage"), null, "nothing is returned until the art has loaded");
});

test("the shipped building file names every authored building", () => {
  const file = new URL("../public/models/village-buildings.glb", import.meta.url);
  assert.ok(existsSync(file));
  const data = readFileSync(file);
  const length = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + length).toString("utf8"));
  const names = new Set(json.nodes.map((node: { name: string }) => node.name));
  for (const id of BUILDING_ASSETS) assert.ok(names.has(id), `${id} is exported`);
  assert.ok(json.extensionsUsed.includes("EXT_meshopt_compression"));
  assert.ok(data.length < 4 * 1024 * 1024, "keeps the download small");
});
