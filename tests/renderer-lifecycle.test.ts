import test from "node:test";
import assert from "node:assert/strict";
import {
  createRendererLifecycle, getRendererMode, setRendererMode,
  type RendererMode, type RendererMount, type RendererStatus,
} from "../src/world";
import { blockedWorldInput, resetWorldInput, worldInput } from "../src/world-input";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(load: (mode: RendererMode) => Promise<RendererMount>) {
  const statuses: RendererStatus[] = [];
  const log: string[] = [];
  let retry: (() => void) | undefined;
  const lifecycle = createRendererLifecycle({
    element: {} as HTMLElement,
    load,
    report: status => statuses.push(status),
    resetInput: () => log.push("reset"),
    error: callback => { retry = callback; log.push("error"); },
    clearError: () => log.push("clear"),
  });
  return { lifecycle, statuses, log, retry: () => retry?.() };
}

test("the renderer is always 3D regardless of historical preferences or blocked storage", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete (globalThis as { window?: Window }).window;
    assert.equal(getRendererMode(), "3d");
    const browser = new EventTarget();
    const changes: string[] = [];
    browser.addEventListener("kg-renderer-change", event => changes.push((event as CustomEvent<string>).detail));
    Object.defineProperty(browser, "localStorage", {
      configurable: true,
      get() { throw new Error("renderer selection must not access saved preferences or campaigns"); },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    assert.equal(getRendererMode(), "3d");
    setRendererMode("3d");
    assert.equal(getRendererMode(), "3d");
    assert.deepEqual(changes, ["3d"]);
    // A stale UI preference is ignored even if it comes from JavaScript.
    setRendererMode("2d" as RendererMode);
    assert.deepEqual(changes, ["3d"]);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: Window }).window;
  }
});

test("shared world input is SSR safe and blocks overlays and editing controls", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    delete (globalThis as { document?: Document }).document;
    assert.equal(blockedWorldInput(), false);
    const browserDocument = { body: { dataset: { overlay: "true" } }, activeElement: null as { matches: (query: string) => boolean } | null };
    Object.defineProperty(globalThis, "document", { configurable: true, value: browserDocument });
    assert.equal(blockedWorldInput(), true);
    browserDocument.body.dataset.overlay = "false";
    assert.equal(blockedWorldInput(), false);
    browserDocument.activeElement = { matches: query => query.includes("input,textarea,select") };
    assert.equal(blockedWorldInput(), true);
    worldInput.x = 1;
    worldInput.y = -1;
    let called = false;
    worldInput.attack = worldInput.interact = worldInput.dodge = () => { called = true; };
    resetWorldInput();
    assert.equal(worldInput.x, 0);
    assert.equal(worldInput.y, 0);
    worldInput.attack(); worldInput.interact(); worldInput.dodge();
    assert.equal(called, false);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: Document }).document;
  }
});

test("repeated selections mount only one 3D renderer and one simulation clock", async () => {
  const events: string[] = [];
  let clocks = 0;
  const f = fixture(async mode => () => {
    clocks++;
    assert.equal(clocks, 1);
    events.push(`mount-${mode}`);
    return () => { clocks--; events.push(`dispose-${mode}`); };
  });
  await f.lifecycle.select("3d");
  await f.lifecycle.select("3d");
  assert.deepEqual(events, ["mount-3d"]);
  assert.equal(clocks, 1);
  assert.deepEqual(f.statuses.map(status => [status.mode, status.loading]), [["3d", true], ["3d", false]]);
  f.lifecycle.dispose();
  f.lifecycle.dispose();
  assert.equal(clocks, 0);
  assert.deepEqual(events, ["mount-3d", "dispose-3d"]);
});

test("a stale import cannot mount after recovery starts a newer attempt", async () => {
  const oldImport = deferred<RendererMount>();
  const events: string[] = [];
  let loads = 0;
  const f = fixture(async () => ++loads === 1 ? oldImport.promise : () => {
    events.push("mount-current");
    return () => events.push("dispose-current");
  });
  const first = f.lifecycle.select("3d");
  f.lifecycle.fail();
  f.retry();
  await new Promise<void>(resolve => setImmediate(resolve));
  oldImport.resolve(() => { events.push("mount-stale"); return () => {}; });
  await first;
  assert.deepEqual(events, ["mount-current"]);
  f.lifecycle.dispose();
});

test("a synchronous runtime failure while mounting disposes the superseded renderer", async () => {
  const events: string[] = [];
  const f = fixture(async () => () => {
    events.push("mount");
    f.lifecycle.fail();
    return () => events.push("dispose");
  });
  await f.lifecycle.select("3d");
  assert.deepEqual(events, ["mount", "dispose"]);
  assert.match(f.statuses.at(-1)?.message ?? "", /campanha continua salva/);
  f.lifecycle.dispose();
});

test("unmount during an import cancels loading without starting a clock", async () => {
  const pending = deferred<RendererMount>();
  let mounts = 0;
  const f = fixture(() => pending.promise);
  const work = f.lifecycle.select("3d");
  f.lifecycle.dispose();
  pending.resolve(() => { mounts++; return () => {}; });
  await work;
  assert.equal(mounts, 0);
  assert.equal(f.statuses.length, 1);
});

test("a WebGL initialization failure keeps the saved campaign available and offers 3D retry", async () => {
  const modes: string[] = [];
  const f = fixture(async mode => {
    modes.push(mode);
    return () => { throw new Error("WebGL unavailable"); };
  });
  await f.lifecycle.select("3d");
  assert.deepEqual(modes, ["3d"]);
  assert.equal(f.statuses.at(-1)?.mode, "3d");
  assert.equal(f.statuses.at(-1)?.loading, false);
  assert.match(f.statuses.at(-1)?.message ?? "", /campanha continua salva.*Tente novamente/);
  assert.equal(f.log.filter(value => value === "error").length, 1);
  f.lifecycle.dispose();
});

test("a rejected stale import cannot replace a recovered world with an error", async () => {
  const pending = deferred<RendererMount>();
  let loads = 0;
  const f = fixture(async () => ++loads === 1 ? pending.promise : () => () => {});
  const first = f.lifecycle.select("3d");
  f.lifecycle.fail();
  f.retry();
  await new Promise<void>(resolve => setImmediate(resolve));
  pending.reject(new Error("Late network error"));
  await first;
  assert.equal(f.log.filter(value => value === "error").length, 1);
  assert.equal(f.statuses.at(-1)?.message, undefined);
  f.lifecycle.dispose();
});

test("runtime failure releases its canvas and clock before a retry mounts the next world", async () => {
  let working = false;
  let clocks = 0;
  let canvases = 0;
  const f = fixture(async () => {
    if (!working) throw new Error("Offline chunk");
    return () => {
      clocks++; canvases++;
      assert.equal(clocks, 1); assert.equal(canvases, 1);
      return () => { clocks--; canvases--; };
    };
  });
  await f.lifecycle.select("3d");
  working = true;
  f.retry();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(clocks, 1);
  f.lifecycle.fail("O navegador interrompeu o visual 3D. Sua campanha continua salva.");
  assert.equal(clocks, 0);
  assert.equal(canvases, 0);
  f.retry();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(clocks, 1);
  f.lifecycle.dispose();
  assert.equal(clocks, 0);
  assert.equal(canvases, 0);
});
