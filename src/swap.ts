/**
 * Ultra-simple swap API - the cleanest way to trade on Pump.fun
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { buyWithSlippage } from "./recipes/buy";
import { sellWithSlippage } from "./recipes/sell";

// Default fee recipient (can be overridden)
const DEFAULT_FEE_RECIPIENT = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM";

export interface BuyParams {
  /** Your wallet */
  user: TransactionSigner;
  /** Token to buy */
  mint: string;
  /** How many tokens to buy */
  amount: bigint;
  /** Max SOL you're willing to spend (in lamports) */
  maxCost: bigint;
  /** Slippage tolerance (optional, default 0.5%) */
  slippage?: number;
  /** Fee recipient (optional) */
  feeRecipient?: string;
}

export interface SellParams {
  /** Your wallet */
  user: TransactionSigner;
  /** Token to sell */
  mint: string;
  /** How many tokens to sell */
  amount: bigint;
  /** Minimum SOL you want to receive (in lamports) */
  minReceive: bigint;
  /** Slippage tolerance (optional, default 0.5%) */
  slippage?: number;
  /** Fee recipient (optional) */
  feeRecipient?: string;
}

/**
 * Buy tokens - the simplest way
 */
export async function buy(params: BuyParams): Promise<Instruction> {
  return await buyWithSlippage({
    user: params.user,
    mint: params.mint,
    tokenAmount: params.amount,
    estimatedSolCost: params.maxCost,
    slippageBps: params.slippage,
    feeRecipient: params.feeRecipient || DEFAULT_FEE_RECIPIENT,
  });
}

/**
 * Sell tokens - the simplest way
 */
export async function sell(params: SellParams): Promise<Instruction> {
  return await sellWithSlippage({
    user: params.user,
    mint: params.mint,
    tokenAmount: params.amount,
    estimatedSolOut: params.minReceive,
    slippageBps: params.slippage,
    feeRecipient: params.feeRecipient || DEFAULT_FEE_RECIPIENT,
  });
}

/**
 * Quick buy with auto slippage - even simpler
 */
export async function quickBuy(
  user: TransactionSigner,
  mint: string,
  amount: bigint,
  maxCost: bigint
): Promise<Instruction> {
  return buy({ user, mint, amount, maxCost });
}

/**
 * Quick sell with auto slippage - even simpler
 */
export async function quickSell(
  user: TransactionSigner,
  mint: string,
  amount: bigint,
  minReceive: bigint
): Promise<Instruction> {
  return sell({ user, mint, amount, minReceive });
}

