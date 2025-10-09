/**
 * Ultra-simple swap API - the cleanest way to trade on Pump.fun
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { buySimple, buyWithSlippage } from "./recipes/buy";
import { sellSimple, sellWithSlippage } from "./recipes/sell";
import { DEFAULT_SLIPPAGE_BPS, validateSlippage } from "./utils/slippage";
import { DEFAULT_FEE_RECIPIENT } from "./config/constants";

type BuyImplementationParams = Parameters<typeof buySimple>[0];
type SellImplementationParams = Parameters<typeof sellSimple>[0];

export type CommitmentLevel =
  | "processed"
  | "confirmed"
  | "finalized";

type WithRpcOptions = {
  /** Optional RPC client override */
  rpc?: BuyImplementationParams["rpc"];
  /** Optional commitment override */
  commitment?: BuyImplementationParams["commitment"];
};

type BuyBaseParams = {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount: bigint;
  /** Optional override for fee recipient */
  feeRecipient?: Address | string;
  /** Optional override for bonding curve creator (skips RPC lookup) */
  bondingCurveCreator?: Address | string;
  /** Whether to track volume for analytics (defaults to true) */
  trackVolume?: boolean;
} & WithRpcOptions;

type BuyWithMaxCost = BuyBaseParams & {
  /** Explicit max SOL cost in lamports (already includes slippage allowance) */
  maxSolCostLamports: bigint;
  estimatedSolCostLamports?: never;
  slippageBps?: never;
};

type BuyWithEstimate = BuyBaseParams & {
  /** Estimated SOL cost in lamports; slippage is applied to derive max cost */
  estimatedSolCostLamports: bigint;
  maxSolCostLamports?: never;
  /** Optional slippage tolerance in basis points (defaults to 0.5%) */
  slippageBps?: number;
};

export type BuyParams = BuyWithMaxCost | BuyWithEstimate;

type SellBaseParams = {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount: bigint;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
} & WithRpcOptions;

type SellWithMinOutput = SellBaseParams & {
  /** Explicit minimum SOL output in lamports (already accounts for slippage) */
  minSolOutputLamports: bigint;
  estimatedSolOutputLamports?: never;
  slippageBps?: never;
};

type SellWithEstimate = SellBaseParams & {
  /** Estimated SOL output in lamports; slippage is applied to derive minimum receive */
  estimatedSolOutputLamports: bigint;
  minSolOutputLamports?: never;
  /** Optional slippage tolerance in basis points (defaults to 0.5%) */
  slippageBps?: number;
};

export type SellParams = SellWithMinOutput | SellWithEstimate;

const DEFAULT_FEE_RECIPIENT_ADDRESS = DEFAULT_FEE_RECIPIENT;

const ensurePositive = (value: bigint, field: string) => {
  if (value <= 0n) {
    throw new Error(`${field} must be a positive bigint`);
  }
};

const hasMaxCost = (params: BuyParams): params is BuyWithMaxCost =>
  "maxSolCostLamports" in params;

const hasEstimatedCost = (params: BuyParams): params is BuyWithEstimate =>
  "estimatedSolCostLamports" in params;

const hasMinOutput = (params: SellParams): params is SellWithMinOutput =>
  "minSolOutputLamports" in params;

const hasEstimatedOutput = (params: SellParams): params is SellWithEstimate =>
  "estimatedSolOutputLamports" in params;

/**
 * Buy tokens - provide either a pre-computed max cost or an estimated cost plus slippage.
 */
export async function buy(params: BuyParams): Promise<Instruction> {
  ensurePositive(params.tokenAmount, "tokenAmount");

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;

  if (hasMaxCost(params)) {
    ensurePositive(params.maxSolCostLamports, "maxSolCostLamports");
    return await buySimple({
      user: params.user,
      mint: params.mint,
      tokenAmount: params.tokenAmount,
      maxSolCostLamports: params.maxSolCostLamports,
      feeRecipient,
      trackVolume: params.trackVolume,
      bondingCurveCreator: params.bondingCurveCreator,
      rpc: params.rpc,
      commitment: params.commitment,
    });
  }

  if (hasEstimatedCost(params)) {
    ensurePositive(params.estimatedSolCostLamports, "estimatedSolCostLamports");
    const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    validateSlippage(slippageBps);

    return await buyWithSlippage({
      user: params.user,
      mint: params.mint,
      tokenAmount: params.tokenAmount,
      estimatedSolCost: params.estimatedSolCostLamports,
      slippageBps,
      feeRecipient,
      trackVolume: params.trackVolume,
      bondingCurveCreator: params.bondingCurveCreator,
      rpc: params.rpc,
      commitment: params.commitment,
    });
  }

  throw new Error("Invalid buy params: expected maxSolCostLamports or estimatedSolCostLamports");
}

/**
 * Sell tokens - provide either a pre-computed minimum output or an estimated output plus slippage.
 */
export async function sell(params: SellParams): Promise<Instruction> {
  ensurePositive(params.tokenAmount, "tokenAmount");

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;

  if (hasMinOutput(params)) {
    return await sellSimple({
      user: params.user,
      mint: params.mint,
      tokenAmount: params.tokenAmount,
      minSolOutputLamports: params.minSolOutputLamports,
      feeRecipient,
      bondingCurveCreator: params.bondingCurveCreator,
      rpc: params.rpc,
      commitment: params.commitment,
    });
  }

  if (hasEstimatedOutput(params)) {
    if (params.estimatedSolOutputLamports < 0n) {
      throw new Error("estimatedSolOutputLamports cannot be negative");
    }
    const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    validateSlippage(slippageBps);
    return await sellWithSlippage({
      user: params.user,
      mint: params.mint,
      tokenAmount: params.tokenAmount,
      estimatedSolOut: params.estimatedSolOutputLamports,
      slippageBps,
      feeRecipient,
      bondingCurveCreator: params.bondingCurveCreator,
      rpc: params.rpc,
      commitment: params.commitment,
    });
  }

  throw new Error(
    "Invalid sell params: expected minSolOutputLamports or estimatedSolOutputLamports"
  );
}

/**
 * Quick buy helper that takes an estimated SOL cost and applies the default slippage guard.
 */
export async function quickBuy(
  user: TransactionSigner,
  mint: Address | string,
  tokenAmount: bigint,
  estimatedSolCostLamports: bigint,
  options?: Omit<BuyWithEstimate, "user" | "mint" | "tokenAmount" | "estimatedSolCostLamports">
): Promise<Instruction> {
  return buy({
    user,
    mint,
    tokenAmount,
    estimatedSolCostLamports,
    ...(options ?? {}),
  });
}

/**
 * Quick sell helper that takes an estimated SOL output and applies the default slippage guard.
 */
export async function quickSell(
  user: TransactionSigner,
  mint: Address | string,
  tokenAmount: bigint,
  estimatedSolOutputLamports: bigint,
  options?: Omit<SellWithEstimate, "user" | "mint" | "tokenAmount" | "estimatedSolOutputLamports">
): Promise<Instruction> {
  return sell({
    user,
    mint,
    tokenAmount,
    estimatedSolOutputLamports,
    ...(options ?? {}),
  });
}
