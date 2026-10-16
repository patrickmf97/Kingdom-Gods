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
  const fallback: RendererMode[] = [];
  const log: string[] = [];
  let retry: (() => void) | undefined;
  const lifecycle = createRendererLifecycle({
    element: {} as HTMLElement,
    load,
    report: status => statuses.push(status),
    fallback: mode => fallback.push(mode),
    resetInput: () => log.push("reset"),
    error: callback => { retry = callback; log.push("error"); },
    clearError: () => log.push("clear"),
  });
  return { lifecycle, statuses, fallback, log, retry: () => retry?.() };
}

test("renderer preference defaults to 3D and survives unavailable storage without touching campaign keys", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete (globalThis as { window?: Window }).window;
    assert.equal(getRendererMode(), "3d");
    const values = new Map<string, string>();
    const browser = new EventTarget();
    const changes: string[] = [];
    browser.addEventListener("kg-renderer-change", event => changes.push((event as CustomEvent<string>).detail));
    Object.defineProperty(browser, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    assert.equal(getRendererMode(), "3d");
    setRendererMode("2d");
    assert.equal(getRendererMode(), "2d");
    assert.deepEqual([...values], [["kingdom-gods:renderer", "2d"]]);
    Object.defineProperty(browser, "localStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
    assert.equal(getRendererMode(), "2d");
    setRendererMode("3d");
    assert.equal(getRendererMode(), "3d");
    assert.deepEqual(changes, ["2d", "3d"]);
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

test("changing renderers disposes the old engine before starting a new simulation clock", async () => {
  const events: string[] = [];
  let clocks = 0;
  const f = fixture(async mode => () => {
    clocks++;
    assert.equal(clocks, 1, "only one renderer may own the clock");
    events.push(`mount-${mode}`);
    return () => { clocks--; events.push(`dispose-${mode}`); };
  });
  await f.lifecycle.select("3d");
  await f.lifecycle.select("3d");
  await f.lifecycle.select("2d");
  assert.deepEqual(events, ["mount-3d", "dispose-3d", "mount-2d"]);
  assert.equal(clocks, 1);
  assert.deepEqual(f.statuses.map(status => [status.mode, status.loading]), [["3d", true], ["3d", false], ["2d", true], ["2d", false]]);
  f.lifecycle.dispose();
  f.lifecycle.dispose();
  assert.equal(clocks, 0);
  assert.deepEqual(events, ["mount-3d", "dispose-3d", "mount-2d", "dispose-2d"]);
});

test("a slower stale import never mounts after a newer renderer was selected", async () => {
  const oldImport = deferred<RendererMount>();
  const events: string[] = [];
  const f = fixture(async mode => mode === "3d" ? oldImport.promise : () => {
    events.push("mount-2d");
    return () => events.push("dispose-2d");
  });
  const first = f.lifecycle.select("3d");
  await f.lifecycle.select("2d");
  oldImport.resolve(() => { events.push("mount-stale-3d"); return () => {}; });
  await first;
  assert.deepEqual(events, ["mount-2d"]);
  assert.deepEqual(f.fallback, []);
  f.lifecycle.dispose();
});

test("a synchronous mode change during mount disposes that superseded renderer", async () => {
  const events: string[] = [];
  let next: Promise<void> | undefined;
  const f = fixture(async mode => () => {
    events.push(`mount-${mode}`);
    if (mode === "3d") next = f.lifecycle.select("2d");
    return () => events.push(`dispose-${mode}`);
  });
  await f.lifecycle.select("3d");
  await next;
  assert.deepEqual(events, ["mount-3d", "dispose-3d", "mount-2d"]);
  f.lifecycle.dispose();
  assert.deepEqual(events, ["mount-3d", "dispose-3d", "mount-2d", "dispose-2d"]);
});

test("unmount during an import cancels loading without creating renderer listeners or a clock", async () => {
  const pending = deferred<RendererMount>();
  let mounts = 0;
  const f = fixture(() => pending.promise);
  const work = f.lifecycle.select("3d");
  f.lifecycle.dispose();
  pending.resolve(() => { mounts++; return () => {}; });
  await work;
  assert.equal(mounts, 0);
  assert.equal(f.statuses.length, 1, "disposed hosts do not receive later status updates");
});

test("a failed 3D initialization falls back honestly to 2D and preserves the engine-independent campaign", async () => {
  const events: string[] = [];
  const f = fixture(async mode => {
    if (mode === "3d") return () => { throw new Error("WebGL unavailable"); };
    return () => { events.push("mount-2d"); return () => events.push("dispose-2d"); };
  });
  await f.lifecycle.select("3d");
  assert.deepEqual(f.fallback, ["2d"]);
  assert.deepEqual(events, ["mount-2d"]);
  const status = f.statuses.at(-1)!;
  assert.equal(status.mode, "2d");
  assert.equal(status.loading, false);
  assert.match(status.message!, /3D.*2D.*campanha foi preservada/);
  f.lifecycle.dispose();
});

test("a rejected stale 3D import cannot override a newly selected mode with fallback", async () => {
  const pending = deferred<RendererMount>();
  const f = fixture(async mode => mode === "3d" ? pending.promise : () => () => {});
  const first = f.lifecycle.select("3d");
  await f.lifecycle.select("2d");
  pending.reject(new Error("Late network error"));
  await first;
  assert.deepEqual(f.fallback, []);
  assert.equal(f.statuses.at(-1)?.mode, "2d");
  f.lifecycle.dispose();
});

test("failed fallback exposes a retry that can recover without remounting the React app", async () => {
  let working = false;
  let mounts = 0;
  const f = fixture(async () => {
    if (!working) throw new Error("Offline chunk");
    return () => { mounts++; return () => {}; };
  });
  await f.lifecycle.select("3d");
  assert.equal(f.log.filter(value => value === "error").length, 1);
  assert.match(f.statuses.at(-1)?.message ?? "", /Tente novamente/);
  working = true;
  f.retry();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(mounts, 1);
  assert.equal(f.statuses.at(-1)?.loading, false);
  f.lifecycle.dispose();
});
