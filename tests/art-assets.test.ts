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

test("trees and props ship as separate named meshes for instancing", () => {
  const read = (name: string) => {
    const data = readFileSync(new URL(`../public/models/${name}`, import.meta.url));
    return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8"));
  };
  const trees = new Set(read("trees.glb").nodes.map((node: { name: string }) => node.name));
  for (const kind of ["oak", "broadleaf", "pine"]) for (const i of [0, 1]) {
    assert.ok(trees.has(`${kind}-${i}-wood`) && trees.has(`${kind}-${i}-leaves`), `${kind}-${i} keeps wood and leaves apart`);
  }
  const props = new Set(read("props.glb").nodes.map((node: { name: string }) => node.name));
  for (const id of ["rock-0", "rock-1", "rock-2", "ore-0", "herb-0", "log-0", "stump-0", "shrub-0", "fence-post", "fence-rail"]) assert.ok(props.has(id), id);
});
