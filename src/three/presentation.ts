/** Presentation-only switches shared by the 3D layers. Never saved with the campaign. */
export type ViewMode = "first" | "third";

export const presentation = {
  /** First person shows full-height interiors and keeps roofs opaque. */
  firstPerson: false,
};

const KEY = "kingdom-gods:view-mode";

export function loadViewMode(): ViewMode {
  try { return localStorage.getItem(KEY) === "third" ? "third" : "first"; } catch { return "first"; }
}

export function saveViewMode(mode: ViewMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* storage may be unavailable */ }
}

/** Eye height in world units and the human scale used in first person (doors stay taller than people). */
export const FIRST_PERSON_EYE = 1.55;
export const FIRST_PERSON_HUMAN_SCALE = .8;
export const FIRST_PERSON_FOV = 70;

/** Forward direction on the map for a camera yaw (same convention as screenToMap). */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function clampPitch(pitch: number): number {
  return Number.isFinite(pitch) ? Math.max(-1.25, Math.min(1.1, pitch)) : 0;
}
