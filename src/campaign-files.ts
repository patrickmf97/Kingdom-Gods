import type { GameState } from "./types";
import { migrateState, saveGame, validateState } from "./persistence";

const FORMAT = "kingdom-gods-campaign";
export const MAX_CAMPAIGN_BYTES = 2 * 1024 * 1024;
const INVALID = "Este arquivo não contém uma campanha válida de Kingdom Gods.";

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** A portable JSON snapshot; exporting never changes the current campaign. */
export function exportCampaign(state: GameState): string {
  const campaign = migrateState(state);
  if (!campaign) throw new Error(INVALID);
  let text: string;
  try {
    text = JSON.stringify({ format: FORMAT, version: 1, exportedAt: Date.now(), campaign }, null, 2);
  } catch {
    throw new Error("Não foi possível preparar o arquivo da campanha.");
  }
  if (byteLength(text) > MAX_CAMPAIGN_BYTES)
    throw new Error("A campanha excede o limite de 2 MiB para transferência.");
  // Check the JSON representation too: portable exports must load as written.
  parseCampaign(text);
  return text;
}

/** Validate a preview without writing to either saved snapshot. */
export function parseCampaign(text: string): GameState {
  if (typeof text !== "string") throw new Error(INVALID);
  if (text.length > MAX_CAMPAIGN_BYTES || byteLength(text) > MAX_CAMPAIGN_BYTES)
    throw new Error("O arquivo excede o limite de 2 MiB para transferência.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Não foi possível ler o JSON deste arquivo de campanha.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(INVALID);
  const envelope = value as Record<string, unknown>;
  let snapshot: unknown = value;
  if (Object.hasOwn(envelope, "format")) {
    if (envelope.format !== FORMAT || envelope.version !== 1 ||
      typeof envelope.exportedAt !== "number" || !Number.isSafeInteger(envelope.exportedAt) ||
      envelope.exportedAt < 0 || !Object.hasOwn(envelope, "campaign")) throw new Error(INVALID);
    snapshot = envelope.campaign;
  }
  const campaign = migrateState(snapshot);
  if (!campaign || !validateState(campaign)) throw new Error(INVALID);
  return campaign;
}

/** Only a validated file reaches storage; persistence retains the previous backup. */
export async function importCampaign(text: string): Promise<GameState> {
  const campaign = parseCampaign(text);
  return saveGame(campaign);
}
