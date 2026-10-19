import type { GameState } from "./types";

export interface RestPreview {
  day: number;
  minutes: number;
  rollovers: number;
  bread: number;
  wheat: number;
  missingMeals: number;
}

/** Calendar and current provisions only: a preview never runs the simulation. */
export function restPreview(state: GameState, hours: number): RestPreview {
  if (!Number.isFinite(hours) || hours < 0 || hours > 168)
    throw new RangeError("O descanso deve durar entre zero e 168 horas.");
  const total = state.minutes + hours * 60;
  const rollovers = Math.floor(total / 1440);
  const bread = Math.min(rollovers, state.inventory.bread);
  const wheat = Math.min(rollovers - bread, state.inventory.wheat);
  return { day: state.day + rollovers, minutes: total % 1440, rollovers, bread, wheat,
    missingMeals: rollovers - bread - wheat };
}

export function formatRestPreview(state: GameState, hours: number): string {
  const preview = restPreview(state, hours);
  const hour = `${Math.floor(preview.minutes / 60).toString().padStart(2, "0")}:${Math.floor(preview.minutes % 60).toString().padStart(2, "0")}`;
  const arrival = `${hours} horas de descanso · chegada prevista no dia ${preview.day} às ${hour}.`;
  if (!preview.rollovers) return `${arrival} Sem virada de dia ou consumo diário de provisões.`;
  const meals = [preview.bread ? `${preview.bread} pão` : "", preview.wheat ? `${preview.wheat} trigo` : ""].filter(Boolean).join(" e ") || "sem alimento disponível";
  return `${arrival} Atravessa ${preview.rollovers} ${preview.rollovers === 1 ? "virada de dia" : "viradas de dia"}. Pelas reservas atuais, o consumo diário usará ${meals}.${preview.missingMeals ? ` Faltam ${preview.missingMeals} refeições; cada dia sem alimento causa 4 de dano.` : ""} Salários, tributos e prazos também avançam; acontecimentos podem interromper o descanso.`;
}
