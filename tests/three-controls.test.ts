import test from "node:test";
import assert from "node:assert/strict";
import { cameraChange, DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_YAW, MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE, screenToMap, toMap, toWorld } from "../src/three/coordinates";
import { activeAutonomy } from "../src/world-input";

test("an expired saved autonomous decision does not cancel later player routes", () => {
  const state = { day: 3, minutes: 500, simulation: { autonomousUntil: 3380 } };
  assert.equal(activeAutonomy(state), false);
  state.simulation.autonomousUntil = 3381;
  assert.equal(activeAutonomy(state), true);
  state.simulation.autonomousUntil = 42;
  assert.equal(activeAutonomy(state), false);
});

test("3D ground coordinates round trip every region without changing campaign coordinates", () => {
  for (const point of [{ x: 0, y: 0 }, { x: 450, y: 790 }, { x: 3072, y: 2304 }, { x: 1100.25, y: 1684.166 }]) {
    const result = toMap(toWorld(point));
    assert.ok(Math.abs(result.x - point.x) < 1e-9 && Math.abs(result.y - point.y) < 1e-9);
    assert.equal(toWorld(point).y, 0);
  }
});

test("camera-relative controls preserve length and point toward the screen after rotation", () => {
  assert.deepEqual(screenToMap(1, 0, 0), { x: 1, y: 0 });
  const up = screenToMap(0, -1, Math.PI / 2);
  assert.ok(Math.abs(up.x + 1) < 1e-9 && Math.abs(up.y) < 1e-9);
  for (const yaw of [-Math.PI / 3, 0, Math.PI / 10, Math.PI / 3]) {
    const result = screenToMap(.6, .8, yaw);
    assert.ok(Math.abs(Math.hypot(result.x, result.y) - 1) < 1e-9);
  }
});

test("camera buttons and wheel zoom remain bounded and reset reliably", () => {
  let view = { yaw: DEFAULT_CAMERA_YAW, distance: DEFAULT_CAMERA_DISTANCE };
  for (let i = 0; i < 100; i++) view = cameraChange(view.yaw, view.distance, "in");
  assert.equal(view.distance, MIN_CAMERA_DISTANCE);
  for (let i = 0; i < 100; i++) { view = cameraChange(view.yaw, view.distance, "out"); view = cameraChange(view.yaw, view.distance, "right"); }
  assert.equal(view.distance, MAX_CAMERA_DISTANCE);
  assert.ok(view.yaw >= -Math.PI && view.yaw <= Math.PI, "orbit wraps without an angle jump outside its canonical range");
  assert.deepEqual(cameraChange(view.yaw, view.distance, "reset"), { yaw: DEFAULT_CAMERA_YAW, distance: DEFAULT_CAMERA_DISTANCE });
});

test("character inspection uses a close natural angle and returns to the exploration view", async () => {
  const module = await import("../src/three/coordinates");
  const close = cameraChange(.8, 29, "character");
  assert.ok(close.distance <= 7, "the character must be large enough to inspect its face");
  assert.equal(close.yaw, .8);
  assert.ok(typeof module.cameraFraming === "function", "close framing must lower the camera instead of enlarging a top-down scalp");
  const portrait = module.cameraFraming(close.distance), exploration = module.cameraFraming(29);
  assert.ok(portrait.heightFactor < .5 && portrait.focusHeight > .9);
  assert.equal(exploration.heightFactor, .9);
  assert.ok(portrait.horizontalFactor > exploration.horizontalFactor);
  assert.deepEqual(cameraChange(close.yaw, close.distance, "reset"), { yaw: DEFAULT_CAMERA_YAW, distance: DEFAULT_CAMERA_DISTANCE });
  const orbit = cameraChange(Math.PI - .05, close.distance, "right");
  assert.ok(orbit.yaw < 0, "a full orbit must wrap smoothly across the back of the character");
});
