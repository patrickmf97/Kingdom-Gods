import { ITEMS } from "./data";
import type { GameState, ItemId } from "./types";

export interface MarketQuote {
  price: number;
  stock: number;
  target: number;
  scarcityFactor: number;
  seasonFactor: number;
  demandFactor: number;
  discountFactor: number;
  status: "scarce" | "balanced" | "abundant";
}

/** Desired reserves guide quotes and procurement; they never truncate saved stock. */
export const MARKET_TARGETS: Readonly<Record<ItemId, number>> = {
  bread: 24, wood: 24, stone: 18, wheat: 20, flour: 12,
  seed: 14, sword: 4, herb: 12, ore: 8,
};

const SEASON_FACTORS: Readonly<Record<ItemId, readonly number[]>> = {
  bread: [1, 0.97, 0.95, 1.12],
  wood: [1, 0.95, 1, 1.18],
  stone: [1, 0.95, 1, 1.08],
  wheat: [1.05, 0.9, 0.85, 1.25],
  flour: [1.03, 0.95, 0.9, 1.18],
  seed: [0.9, 1, 1.08, 1.2],
  sword: [1, 1, 1, 1],
  herb: [1, 0.9, 1.1, 1.35],
  ore: [1, 1, 1, 1.08],
};

/** Pure, state-only quotes: opening a panel or loading a campaign never advances trade. */
export function marketQuote(state: GameState, item: ItemId, buy: boolean): MarketQuote {
  const stock = state.market[item];
  const target = MARKET_TARGETS[item];
  const season = Math.floor(((Math.max(1, Math.floor(state.day)) - 1) % 360) / 90);
  // This continuous curve equals one at target, tending toward 0.75 in surplus.
  const scarcityFactor = 0.75 + 0.5 * target / (stock + target);
  const seasonFactor = SEASON_FACTORS[item][season];
  const demand = state.economy.orders
    .filter((order) => order.item === item && state.day < order.deadline &&
      (order.status === "available" || order.status === "accepted"))
    .reduce((sum, order) => sum + order.quantity, 0);
  const demandFactor = 1 + Math.min(0.25, demand / target * 0.3);
  const skill = Math.max(0, Math.min(100, state.apostle.skills.trading || 0));
  const discountFactor = 1 - skill / 100 * 0.08 - (state.apostle.blessing === "fortune" ? 0.06 : 0);
  const prosperityFactor = 1 + (55 - state.economy.prosperity) / 500;
  const fairValue = ITEMS[item].price * scarcityFactor * seasonFactor * demandFactor * prosperityFactor;
  // The spread exceeds any one-unit movement of the curve, including at zero
  // stock and maximum negotiation. Directed rounding also preserves that margin.
  const price = Math.max(1, buy
    ? Math.ceil(fairValue * 1.15 * discountFactor)
    : Math.floor(fairValue * 0.65 / discountFactor));
  return {
    price, stock, target, scarcityFactor, seasonFactor, demandFactor, discountFactor,
    status: stock < target * 0.6 ? "scarce" : stock > target * 1.5 ? "abundant" : "balanced",
  };
}
