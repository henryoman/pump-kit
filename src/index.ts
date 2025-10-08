/**
 * Pump Kit - Modern TypeScript SDK for Pump.fun bonding curves and AMM pools.
 * 
 * This is the main public API surface. We export a clean, minimal interface
 * that abstracts away the complexity of program interactions.
 */

// ============================================================================
// Configuration & Setup
// ============================================================================

export { rpc, defaultCommitment } from "./config/rpc";
export * from "./config/addresses";

// ============================================================================
// Core Types
// ============================================================================

export type { Address, TransactionSigner, Instruction } from "@solana/kit";

// ============================================================================
// PDA Helpers
// ============================================================================

export * as PumpPDAs from "./pda/pump";
export * as AmmPDAs from "./pda/pumpAmm";
export { ata, ata2022 } from "./pda/ata";

// ============================================================================
// Low-Level Clients (instruction builders)
// ============================================================================

export * as PumpClient from "./clients/pump";
export * as AmmClient from "./clients/amm";

// ============================================================================
// High-Level Recipes (with automatic slippage)
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

export {
  mintWithFirstBuy,
  validateMintParams,
  type MintWithFirstBuyParams,
} from "./recipes/mintFirstBuy";

export {
  provideLiquidity,
  calculateOptimalDeposit,
  type ProvideLiquidityParams,
} from "./recipes/provideLiquidity";

export {
  removeLiquidity,
  calculateWithdrawal,
  type RemoveLiquidityParams,
} from "./recipes/removeLiquidity";

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

export {
  buildTransaction,
  sendAndConfirmTransaction,
  simulateTransaction,
  type TransactionResult,
} from "./utils/transaction";

// Legacy math exports for backward compatibility
export {
  pctToBps,
  computeSlippageOut,
  computeSlippageIn,
} from "./math";

// ============================================================================
// Generated Code (for advanced users)
// ============================================================================

export * as PumpGenerated from "./pumpsdk/generated";
export * as AmmGenerated from "./ammsdk/generated";
