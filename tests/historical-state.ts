import { LEGACY_RESOURCE_NODES, V5_RESOURCE_NODES } from "../src/regions";
import type { GameState } from "../src/types";

/** Remove v7-only fields when deriving a genuine historical fixture. */
export function removeV7Fields(state: GameState): void {
  for (const npc of state.npcs) delete (npc as unknown as Record<string, unknown>).zone;
  state.frontier.resources = Object.fromEntries(V5_RESOURCE_NODES.map(node =>
    [node.id, state.frontier.resources[node.id]]));
}

/** Compare a migrated result with exactly the fields its old schema possessed. */
export function historicalProjection(state: GameState, version: number): Record<string, any> {
  const restored = structuredClone(state) as unknown as Record<string, any>;
  restored.version = version;
  if (version < 7) removeV7Fields(restored as GameState);
  if (version < 6) delete restored.wildlife;
  if (version < 5) restored.frontier.resources = Object.fromEntries(LEGACY_RESOURCE_NODES.map(node =>
    [node.id, restored.frontier.resources[node.id]]));
  if (version < 4) delete restored.territory;
  if (version < 3) {
    delete restored.frontier;
    delete restored.life;
    delete restored.apostle.skills.woodcutting;
    delete restored.apostle.skills.herbalism;
  }
  if (version < 2) {
    delete restored.economy;
    delete restored.inventory.flour;
    delete restored.market.flour;
    delete restored.apostle.skills.cooking;
    delete restored.apostle.skills.smithing;
  }
  return restored;
}
