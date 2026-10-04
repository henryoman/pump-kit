/**
 * Pump Kit - The simplest TypeScript SDK for Pump.fun
 *
 * Clean, minimal API - just buy, sell, mint, and manage liquidity.
 */

import "./config/polyfills";

// ============================================================================
// Simple API (recommended - start here!)
// ============================================================================

export {
  buy,
  sell,
  curveBuy,
  curveSell,
  ammBuy,
  ammSell,
  resolveAmmTradingContext,
} from "./swap";

export type {
  BuyParams,
  SellParams,
  CurveBuyParams,
  CurveSellParams,
  AmmBuyParams,
  AmmSellParams,
  AmmTradingContext,
} from "./swap";

export {
  mintWithFirstBuy,
  validateMintParams,
  type MintWithFirstBuyParams,
} from "./recipes/mintFirstBuy";

export {
  createAndBuy,
  type CreateAndBuyOptions,
  type CreateAndBuyResult,
  type TokenMetadata,
} from "./helpers/createAndBuy";

export {
  addLiquidity,
  removeLiquidity,
  quickAddLiquidity,
  quickRemoveLiquidity,
  type AddLiquidityParams,
  type RemoveLiquidityParams,
  WSOL,
} from "./liquidity";

// ============================================================================
// Core Types
// ============================================================================

export type { Address, TransactionSigner, Instruction } from "@solana/kit";

// ============================================================================
// Advanced: Detailed control (optional)
// ============================================================================

export {
  buyWithSlippage,
  buySimple,
  type BuyWithSlippageParams,
  type SimpleBuyParams,
} from "./recipes/buy";

export {
  sellWithSlippage,
  sellSimple,
  type SellWithSlippageParams,
  type SimpleSellParams,
} from "./recipes/sell";


// ============================================================================
// Utilities
// ============================================================================

export {
  addSlippage,
  subSlippage,
  validateSlippage,
  percentToBps,
  bpsToPercent,
  DEFAULT_SLIPPAGE_BPS,
} from "./utils/slippage";

export type { RpcClient, RpcSubscriptionsClient } from "./config/connection";
export { setDefaultCommitment, getDefaultCommitment } from "./config/commitment";

export {
  buildTransaction,
  TransactionExecutionError,
  type TransactionLifetime,
  sendAndConfirmTransaction,
  simulateTransaction,
  type TransactionResult,
  type BuildTransactionParams,
  type SendAndConfirmTransactionParams,
  type SimulateTransactionParams,
  type SimulationResponse,
  type PriorityFeeOptions,
  type SendOptions,
  buildPriorityFeeInstructions,
} from "./utils/transaction";

export {
  buildWrapSolInstructions,
  buildUnwrapSolInstructions,
  type WrapSolParams,
  type WrapSolInstructions,
  WSOL_ADDRESS,
} from "./utils/wsol";

export {
  createPumpEventManager,
  PumpEventManager,
  type PumpEvent,
  type PumpEventListener,
  type PumpEventManagerOptions,
  type PumpEventType,
} from "./events/pumpEvents";

export { decimalToRaw, solToLamports, lamportsToSol, tokensToRaw, rawToTokens } from "./utils/amounts";
export { createV2, mintAuthorityPda, validateCreateV2Params, type CreateV2Params } from "./clients/create_v2";
export { resolveTokenProgram, validateTokenProgram, resolveMintContext, type MintContext } from "./utils/token_program";
export { buyV2, sellV2, buyExactQuoteInV2, type CurveTradeV2Params } from "./clients/trade_v2";
export { validateLaunchConfig, type LaunchConfig } from "./launch/config";
export { createPump, type CreatePumpOptions, type LaunchSession, type LaunchRecord, type PrepareLaunchOptions } from "./launch/session";
export { reconcileLaunchRecord } from "./launch/reconcile";
export { holderRewardsPda } from "./pda/pump";

export { createLaunchLookupTable, loadLookupTable } from "./launch/lookup_table";
export { migrateV2 } from "./clients/migrate_v2";

export type { AmmResolvedState } from "./clients/amm";

export type { SwapPlan, SwapQuote } from "./swap/plan";

export { resolveSwapVenue, MigrationPendingError, type SwapVenue } from "./swap/venue";
