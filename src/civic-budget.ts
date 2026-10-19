import type { GameState } from "./types";

export interface CivicBudget {
  /** Spendable treasury after every published, financed promise. */
  available: number;
  /** Council promises remain in the treasury, preserving historical saves. */
  reservedOrders: number;
  /** Financed frontier offers remain in the treasury until accepted. */
  reservedFrontier: number;
  /** Accepted frontier rewards have already left the treasury. */
  escrow: number;
  financedJobIds: string[];
  financedOrderIds: string[];
}

/** Pure allocation: viewing an offer never moves coins or changes a campaign. */
export function civicBudget(state: GameState): CivicBudget {
  let remaining = state.economy.civicFunds;
  let reservedOrders = 0;
  const financedOrderIds: string[] = [];
  // Existing council contracts predate frontier allocations and keep priority.
  for (const order of state.economy.orders) {
    if (order.status !== "available" && order.status !== "accepted") continue;
    reservedOrders += order.reward;
    if (remaining >= order.reward) financedOrderIds.push(order.id);
    remaining = Math.max(0, remaining - order.reward);
  }
  let reservedFrontier = 0;
  const financedJobIds: string[] = [];
  // Fund smaller promises first. A growing treasury then keeps every funded
  // offer funded, instead of diverting its reward to a newly affordable job.
  const offers = state.frontier.jobs
    .filter(job => job.status === "available" && state.day < job.deadline)
    .sort((a, b) => a.reward - b.reward || a.id.localeCompare(b.id));
  for (const job of offers) {
    if (remaining < job.reward) break;
    remaining -= job.reward;
    reservedFrontier += job.reward;
    financedJobIds.push(job.id);
  }
  return {
    available: remaining,
    reservedOrders,
    reservedFrontier,
    escrow: state.frontier.escrow,
    financedJobIds,
    financedOrderIds,
  };
}

export function frontierJobFunded(state: GameState, id: string): boolean {
  return civicBudget(state).financedJobIds.includes(id);
}

export function villageOrderFunded(state: GameState, id: string): boolean {
  return civicBudget(state).financedOrderIds.includes(id);
}
