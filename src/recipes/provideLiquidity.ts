/**
 * Provide Liquidity recipe - add liquidity to a Pump AMM pool.
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { DEFAULT_SLIPPAGE_BPS, validateSlippage, subSlippage } from "../utils/slippage";

export interface ProvideLiquidityParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Base token mint address */
  baseMint: string;
  /** Quote token mint address (e.g., SOL, USDC) */
  quoteMint: string;
  /** Amount of base tokens to deposit */
  baseIn: bigint;
  /** Amount of quote tokens to deposit */
  quoteIn: bigint;
  /** Expected LP tokens to receive */
  estimatedLpOut: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Pool index (for multi-pool support, default: 0) */
  poolIndex?: number;
}

/**
 * Build a provide liquidity instruction with slippage protection.
 * 
 * TODO: This needs to be implemented once the AMM client is complete.
 * The AMM client needs deposit/withdraw instruction builders similar to the pump client.
 */
export function provideLiquidity(params: ProvideLiquidityParams): Instruction {
  const {
    user,
    baseMint,
    quoteMint,
    baseIn,
    quoteIn,
    estimatedLpOut,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    poolIndex = 0,
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (baseIn <= 0n) throw new Error("Base amount must be positive");
  if (quoteIn <= 0n) throw new Error("Quote amount must be positive");
  if (estimatedLpOut <= 0n) throw new Error("Estimated LP output must be positive");

  // Calculate minimum LP tokens to accept
  const minLpOut = subSlippage(estimatedLpOut, slippageBps);

  // TODO: Implement using AMM client once available
  // This would use getDepositInstruction from src/ammsdk/generated/instructions
  // and derive all necessary PDAs (pool, lpMint, ATAs, etc.)
  
  throw new Error("provideLiquidity not yet implemented - needs AMM client completion");
}

/**
 * Calculate optimal deposit amounts for balanced liquidity provision.
 * This helps prevent losing value to impermanent loss or price impact.
 */
export function calculateOptimalDeposit(params: {
  baseReserve: bigint;
  quoteReserve: bigint;
  desiredBase: bigint;
  desiredQuote: bigint;
}): {
  optimalBase: bigint;
  optimalQuote: bigint;
} {
  const { baseReserve, quoteReserve, desiredBase, desiredQuote } = params;

  if (baseReserve === 0n || quoteReserve === 0n) {
    // Initial deposit - use desired amounts
    return { optimalBase: desiredBase, optimalQuote: desiredQuote };
  }

  // Calculate the ratio
  const desiredRatio = (desiredQuote * 10_000n) / desiredBase;
  const poolRatio = (quoteReserve * 10_000n) / baseReserve;

  if (desiredRatio > poolRatio) {
    // Quote is excessive, scale down to match pool ratio
    const optimalQuote = (desiredBase * quoteReserve) / baseReserve;
    return { optimalBase: desiredBase, optimalQuote };
  } else {
    // Base is excessive, scale down to match pool ratio
    const optimalBase = (desiredQuote * baseReserve) / quoteReserve;
    return { optimalBase, optimalQuote: desiredQuote };
  }
}
