/**
 * The absolute simplest API for Pump.fun
 * Everything you need, nothing you don't.
 */

import "./config/polyfills";

export {
  buy,
  sell,
  curveBuy,
  curveSell,
} from "./swap";

export type {
  BuyParams,
  SellParams,
  CurveBuyParams,
  CurveSellParams,
} from "./swap";

export { mintWithFirstBuy, validateMintParams } from "./recipes/mintFirstBuy";
export type { MintWithFirstBuyParams } from "./recipes/mintFirstBuy";

// Re-export essential types
export type { TransactionSigner, Instruction, Address } from "@solana/kit";

export { createPump, type LaunchRecord, type PrepareLaunchOptions } from "./launch/session";
export { validateLaunchConfig, type LaunchConfig } from "./launch/config";

export type { SwapPlan, SwapQuote } from "./swap/plan";

export { resolveSwapVenue, MigrationPendingError, type SwapVenue } from "./swap/venue";
