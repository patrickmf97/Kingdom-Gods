import { isWalkable, nearestWalkable } from "./navigation";
import { regionForZone } from "./regions";
import { estateBuildings } from "./territory-data";
import { weatherFor } from "./weather";
import type { GameState, OutdoorZone, StormState } from "./types";

export const LIGHTNING_WARNING_SECONDS = 3.5;
export const LIGHTNING_RADIUS = 64;
export const LIGHTNING_DAMAGE = 28;
export interface StormHooks {
  damage(amount: number): void;
  message(text: string, type?: string): void;
  remember(title: string, text: string, emotion: string, intensity?: number): void;
}
export function createStormState(): StormState {
  return { sequence: 0, cooldown: 12, warning: null, impact: null };
}
export function clearStormExposure(state: GameState): void {
  const storm = state.worldLife.storm;
  storm.warning = null; storm.impact = null; storm.cooldown = Math.max(12, storm.cooldown);
}
function hash(seed: number): number {
  let n = Math.imul(seed ^ 0x45d9f3b, 0x45d9f3b);
  n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
function strikeTarget(state: GameState, id: number) {
  const region = regionForZone(state.zone);
  const context = { zone: state.zone, building: state.property.building, estates: estateBuildings(state) };
  const seed = state.day * 7919 + id * 104729 + region.width;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = hash(seed + attempt * 37) * Math.PI * 2;
    const distance = 120 + hash(seed + attempt * 53 + 7) * 200;
    const point = { x: Math.max(18, Math.min(region.width - 18, state.apostle.x + Math.cos(angle) * distance)),
      y: Math.max(18, Math.min(region.height - 18, state.apostle.y + Math.sin(angle) * distance)) };
    if (isWalkable(point, context) && Math.hypot(point.x - state.apostle.x, point.y - state.apostle.y) >= 90) return point;
  }
  const point = nearestWalkable({ x: state.apostle.x + 180, y: state.apostle.y + 100 }, context);
  return Math.hypot(point.x - state.apostle.x, point.y - state.apostle.y) >= 90 ? point : null;
}

/** Authoritative simulation only. A render, import or offline interval never calls this. */
export function updateStorms(state: GameState, delta: number, hooks: StormHooks): void {
  if (!state.started || state.phase !== "playing" || !state.apostle.alive ||
      !Number.isFinite(delta) || delta <= 0) return;
  const storm = state.worldLife.storm, dt = Math.min(delta, 1);
  const weather = weatherFor(state.day, state.minutes, state.zone);
  if (!weather.outdoors) { clearStormExposure(state); return; }
  if (storm.impact) {
    storm.impact.remaining = Math.max(0, storm.impact.remaining - dt);
    if (!storm.impact.remaining) storm.impact = null;
  }
  if (storm.warning) {
    storm.warning.remaining = Math.max(0, storm.warning.remaining - dt);
    if (storm.warning.remaining > 1e-7) return;
    const warning = storm.warning;
    // Consume the warning before invoking damage/death/autosave callbacks.
    storm.warning = null;
    storm.impact = { ...warning, remaining: 1.2 };
    storm.cooldown = 36 + hash(warning.id * 65537 + state.day) * 14;
    if (state.zone === warning.zone && Math.hypot(state.apostle.x - warning.x, state.apostle.y - warning.y) <= LIGHTNING_RADIUS) {
      const before = state.apostle.hp;
      hooks.damage(LIGHTNING_DAMAGE);
      const damage = Math.max(0, before - state.apostle.hp);
      if (damage) {
        hooks.message(`Um raio atingiu o terreno próximo: −${Math.round(damage)} de vitalidade. Procure um interior para se abrigar.`, "warning");
        hooks.remember("O céu tocou a terra", "Uma descarga da tempestade me feriu. O clarão no chão avisara onde o raio cairia.", "Temor", 85);
      }
    }
    return;
  }
  if (weather.kind !== "storm") { storm.cooldown = Math.max(12, storm.cooldown); return; }
  storm.cooldown = Math.max(0, storm.cooldown - dt);
  if (storm.cooldown > 1e-7 || !Number.isSafeInteger(storm.sequence + 1)) return;
  const target = strikeTarget(state, storm.sequence + 1);
  if (!target) { storm.cooldown = 12; return; }
  storm.sequence++;
  storm.warning = { id: storm.sequence, zone: state.zone as OutdoorZone, ...target, remaining: LIGHTNING_WARNING_SECONDS };
  hooks.message("O ar crepita. Afaste-se da marca no chão; um raio vai atingir aquele ponto.", "warning");
}
