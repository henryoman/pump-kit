/**
 * Remove Liquidity recipe - withdraw liquidity from a Pump AMM pool.
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { DEFAULT_SLIPPAGE_BPS, validateSlippage, subSlippage } from "../utils/slippage";

export interface RemoveLiquidityParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Base token mint address */
  baseMint: string;
  /** Quote token mint address */
  quoteMint: string;
  /** Amount of LP tokens to burn */
  lpAmount: bigint;
  /** Expected base tokens to receive */
  estimatedBaseOut: bigint;
  /** Expected quote tokens to receive */
  estimatedQuoteOut: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Pool index (for multi-pool support, default: 0) */
  poolIndex?: number;
}

/**
 * Build a remove liquidity instruction with slippage protection.
 * 
 * TODO: This needs to be implemented once the AMM client is complete.
 */
export async function removeLiquidity(params: RemoveLiquidityParams): Promise<Instruction> {
  const {
    user,
    baseMint,
    quoteMint,
    lpAmount,
    estimatedBaseOut,
    estimatedQuoteOut,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    poolIndex = 0,
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (lpAmount <= 0n) throw new Error("LP amount must be positive");
  if (estimatedBaseOut < 0n) throw new Error("Estimated base output cannot be negative");
  if (estimatedQuoteOut < 0n) throw new Error("Estimated quote output cannot be negative");

  // Calculate minimum outputs with slippage protection
  const minBaseOut = subSlippage(estimatedBaseOut, slippageBps);
  const minQuoteOut = subSlippage(estimatedQuoteOut, slippageBps);

  // TODO: Implement using AMM client once available
  // This would use getWithdrawInstruction from src/ammsdk/generated/instructions
  // and derive all necessary PDAs (pool, lpMint, ATAs, etc.)
  
  throw new Error("removeLiquidity not yet implemented - needs AMM client completion");
}

/**
 * Calculate expected withdrawal amounts based on LP share.
 */
export function calculateWithdrawal(params: {
  lpAmount: bigint;
  totalLpSupply: bigint;
  baseReserve: bigint;
  quoteReserve: bigint;
}): {
  baseOut: bigint;
  quoteOut: bigint;
} {
  const { lpAmount, totalLpSupply, baseReserve, quoteReserve } = params;

  if (totalLpSupply === 0n) {
    return { baseOut: 0n, quoteOut: 0n };
  }

  // Calculate proportional share
  const baseOut = (lpAmount * baseReserve) / totalLpSupply;
  const quoteOut = (lpAmount * quoteReserve) / totalLpSupply;

  return { baseOut, quoteOut };
}
