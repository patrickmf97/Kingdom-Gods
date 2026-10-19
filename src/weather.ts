import type { Zone } from "./types";

export type WeatherKind = "clear" | "cloudy" | "rain" | "fog";

export interface WeatherSnapshot {
  day: number;
  kind: WeatherKind;
  label: string;
  description: string;
  temperature: number;
  /** Precipitation, cloud cover and wind are normalized from zero to one. */
  precipitation: number;
  cloudiness: number;
  wind: number;
  gatheringRate: number;
  supplyPenalty: number;
  outdoors: boolean;
}

const PROFILES: Record<WeatherKind, { label: string; description: string; cloudiness: number; precipitation: number; wind: number }> = {
  clear: { label: "Céu limpo", description: "Tempo aberto para trabalhar e explorar.", cloudiness: 0.12, precipitation: 0, wind: 0.2 },
  cloudy: { label: "Nublado", description: "Nuvens cobrem o céu; o trabalho segue no ritmo habitual.", cloudiness: 0.78, precipitation: 0, wind: 0.42 },
  rain: { label: "Chuva", description: "Coleta externa avança a 80%; a reposição externa perde até uma unidade por produto.", cloudiness: 0.96, precipitation: 0.65, wind: 0.58 },
  fog: { label: "Neblina", description: "A névoa encurta a vista; o trabalho segue no ritmo habitual.", cloudiness: 0.62, precipitation: 0, wind: 0.1 },
};

function calendarDay(day: number): number {
  return Number.isFinite(day) ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(day))) : 1;
}

/** A calendar hash, never a mutable random generator or saved campaign field. */
function dailyRoll(day: number): number {
  let value = Math.imul(day ^ 0x45d9f3b, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Daily skies are shared by nearby regions; shelter only changes exposure. */
export function weatherFor(day: number, minutes: number, zone: Zone): WeatherSnapshot {
  const safeDay = calendarDay(day);
  const season = Math.floor(((safeDay - 1) % 360) / 90);
  // Cumulative clear/cloudy/rain thresholds; the remainder is fog.
  const thresholds = [[0.3, 0.55, 0.9], [0.6, 0.8, 0.93], [0.28, 0.57, 0.83], [0.18, 0.55, 0.8]][season];
  const roll = dailyRoll(safeDay);
  const kind: WeatherKind = safeDay === 1 ? "clear" : roll < thresholds[0] ? "clear" : roll < thresholds[1] ? "cloudy" : roll < thresholds[2] ? "rain" : "fog";
  const profile = PROFILES[kind];
  const outdoors = zone === "village" || zone === "wilderness" || zone === "highlands";
  const hour = Number.isFinite(minutes) ? ((minutes % 1440) + 1440) % 1440 : 720;
  const warmth = Math.cos((hour - 840) / 1440 * Math.PI * 2) * 4;
  const temperature = Math.round([17, 27, 13, 5][season] + warmth + (roll - 0.5) * 4 -
    (kind === "rain" ? 3 : kind === "cloudy" ? 1 : 0) - (zone === "highlands" ? 5 : 0));
  return {
    day: safeDay, kind, label: profile.label,
    description: outdoors ? profile.description : "Ao abrigo: sem precipitação ou redução no ritmo de trabalho.",
    temperature, precipitation: outdoors ? profile.precipitation : 0,
    cloudiness: profile.cloudiness, wind: outdoors ? profile.wind : 0,
    gatheringRate: outdoors && kind === "rain" ? 0.8 : 1,
    supplyPenalty: outdoors && kind === "rain" ? 1 : 0,
    outdoors,
  };
}

/** Today and the following days, evaluated at noon. No persisted weather state. */
export function weatherForecast(day: number, zone: Zone = "village", count = 3): WeatherSnapshot[] {
  const length = Number.isFinite(count) ? Math.max(0, Math.min(360, Math.floor(count))) : 3;
  const start = calendarDay(day);
  return Array.from({ length }, (_, index) => weatherFor(start + index, 720, zone));
}
