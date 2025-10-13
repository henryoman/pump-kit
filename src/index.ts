/**
 * Pump Kit - The simplest TypeScript SDK for Pump.fun
 *
 * Clean, minimal API - just buy, sell, mint, and manage liquidity.
 */

import "./config/polyfills";

// ============================================================================
// Simple API (recommended - start here!)
// ============================================================================

export { buy, sell, quickBuy, quickSell } from "./swap";
export type { BuyParams, SellParams } from "./swap";

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
