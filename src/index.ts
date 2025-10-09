/**
 * Pump Kit - The simplest TypeScript SDK for Pump.fun
 * 
 * Clean, minimal API - just buy, sell, mint, and manage liquidity.
 */

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
