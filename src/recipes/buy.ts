/**
 * Buy recipe - purchase tokens from the bonding curve with slippage protection.
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { buy as buildBuyInstruction } from "../clients/pump";
import { addSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";

export interface BuyWithSlippageParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: string;
  /** Amount of tokens to buy */
  tokenAmount: bigint;
  /** Estimated SOL cost in lamports (will add slippage) */
  estimatedSolCost: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Fee recipient address */
  feeRecipient: string;
}

/**
 * Build a buy instruction with automatic slippage calculation.
 * Takes an estimated SOL cost and adds slippage to create the max SOL cost.
 */
export function buyWithSlippage(params: BuyWithSlippageParams): Instruction {
  const {
    user,
    mint,
    tokenAmount,
    estimatedSolCost,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient,
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (estimatedSolCost <= 0n) throw new Error("Estimated SOL cost must be positive");

  // Calculate max SOL cost with slippage
  const maxSolCostLamports = addSlippage(estimatedSolCost, slippageBps);

  return buildBuyInstruction({
    user,
    mint,
    tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume: true,
  });
}

/**
 * Simple buy wrapper that takes max SOL cost directly.
 */
export interface SimpleBuyParams {
  user: TransactionSigner;
  mint: string;
  tokenAmount: bigint;
  maxSolCostLamports: bigint;
  feeRecipient: string;
  trackVolume?: boolean;
}

export function buySimple(params: SimpleBuyParams): Instruction {
  const { user, mint, tokenAmount, maxSolCostLamports, feeRecipient, trackVolume = true } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (maxSolCostLamports <= 0n) throw new Error("Max SOL cost must be positive");

  return buildBuyInstruction({
    user,
    mint,
    tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume,
  });
}
