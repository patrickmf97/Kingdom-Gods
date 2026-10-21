import type { Point } from "../types";

export const WORLD_SCALE = 1 / 24;
export const DEFAULT_CAMERA_YAW = Math.PI / 10;
export const DEFAULT_CAMERA_DISTANCE = 29;
export const MIN_CAMERA_DISTANCE = 6.5;
export const MAX_CAMERA_DISTANCE = 48;

export function toWorld(point: Point): { x: number; y: number; z: number } {
  return { x: point.x * WORLD_SCALE, y: 0, z: point.y * WORLD_SCALE };
}

export function toMap(point: { x: number; z: number }): Point {
  return { x: point.x / WORLD_SCALE, y: point.z / WORLD_SCALE };
}

/** Screen-down follows the camera's horizontal position, rather than map north. */
export function screenToMap(x: number, y: number, yaw: number): Point {
  return { x: x * Math.cos(yaw) + y * Math.sin(yaw), y: -x * Math.sin(yaw) + y * Math.cos(yaw) };
}

export function cameraChange(yaw: number, distance: number, action: string): { yaw: number; distance: number } {
  if (action === "reset") return { yaw: DEFAULT_CAMERA_YAW, distance: DEFAULT_CAMERA_DISTANCE };
  const angle = (Number.isFinite(yaw) ? yaw : DEFAULT_CAMERA_YAW) +
    (action === "left" ? -Math.PI / 8 : action === "right" ? Math.PI / 8 : 0);
  const wrapped = angle >= -Math.PI && angle <= Math.PI ? angle :
    ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const currentDistance = Number.isFinite(distance) ? distance : DEFAULT_CAMERA_DISTANCE;
  return {
    yaw: wrapped,
    distance: action === "character" ? MIN_CAMERA_DISTANCE : Math.max(MIN_CAMERA_DISTANCE,
      Math.min(MAX_CAMERA_DISTANCE, currentDistance * (action === "in" ? .85 : action === "out" ? 1 / .85 : 1))),
  };
}

/** Smoothly lowers the close camera to show a face instead of the top of a scalp. */
export function cameraFraming(distance: number): { heightFactor: number; horizontalFactor: number; focusHeight: number } {
  const t = Math.max(0, Math.min(1, (17 - distance) / (17 - MIN_CAMERA_DISTANCE)));
  const blend = t * t * (3 - 2 * t);
  return { heightFactor: .9 - .49 * blend, horizontalFactor: .77 + .20 * blend, focusHeight: .7 + .42 * blend };
}
