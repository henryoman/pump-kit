/**
 * Sell recipe - sell tokens back to the bonding curve with slippage protection.
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { sell as buildSellInstruction } from "../clients/pump";
import { subSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";

export interface SellWithSlippageParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: string;
  /** Amount of tokens to sell */
  tokenAmount: bigint;
  /** Estimated SOL output in lamports (will subtract slippage) */
  estimatedSolOut: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Fee recipient address */
  feeRecipient: string;
}

/**
 * Build a sell instruction with automatic slippage calculation.
 * Takes an estimated SOL output and subtracts slippage to create the min SOL output.
 */
export function sellWithSlippage(params: SellWithSlippageParams): Instruction {
  const {
    user,
    mint,
    tokenAmount,
    estimatedSolOut,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient,
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (estimatedSolOut < 0n) throw new Error("Estimated SOL output cannot be negative");

  // Calculate min SOL output with slippage protection
  const minSolOutputLamports = subSlippage(estimatedSolOut, slippageBps);

  return buildSellInstruction({
    user,
    mint,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    trackVolume: true,
  });
}

/**
 * Simple sell wrapper that takes min SOL output directly.
 */
export interface SimpleSellParams {
  user: TransactionSigner;
  mint: string;
  tokenAmount: bigint;
  minSolOutputLamports: bigint;
  feeRecipient: string;
  trackVolume?: boolean;
}

export function sellSimple(params: SimpleSellParams): Instruction {
  const { user, mint, tokenAmount, minSolOutputLamports, feeRecipient, trackVolume = true } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (minSolOutputLamports < 0n) throw new Error("Min SOL output cannot be negative");

  return buildSellInstruction({
    user,
    mint,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    trackVolume,
  });
}
