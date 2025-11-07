/**
 * Buy recipe - purchase tokens from the bonding curve with slippage protection.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { buy as buildBuyInstruction } from "../clients/pump";
import { DEFAULT_FEE_RECIPIENT } from "../config/constants";
import { addSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";
import { solToLamports } from "../utils/amounts";
import { getDefaultCommitment } from "../config/commitment";

type RpcClient = Parameters<typeof buildBuyInstruction>[0]["rpc"];
type CommitmentLevel = Parameters<typeof buildBuyInstruction>[0]["commitment"];

export interface BuyWithSlippageParams {
  user: TransactionSigner;
  mint: Address | string;
  /** Token amount to buy (raw bigint). */
  tokenAmount: bigint;
  /** Estimated SOL cost in SOL units. */
  estimatedSolCostSol: number;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Fee recipient address */
  feeRecipient?: Address | string;
  /** Optional override to skip fetching the bonding curve account */
  bondingCurveCreator?: Address | string;
  /** Whether to track user volume (default true) */
  trackVolume?: boolean;
  /** RPC client used to fetch Pump accounts */
  rpc: RpcClient;
  /** Optional commitment override */
  commitment?: CommitmentLevel;
}

/**
 * Build a buy instruction with automatic slippage calculation.
 * Takes an estimated SOL cost and adds slippage to create the max SOL cost.
 */
export async function buyWithSlippage(params: BuyWithSlippageParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    estimatedSolCostSol,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    bondingCurveCreator,
    trackVolume = true,
    rpc,
    commitment = getDefaultCommitment(),
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (!Number.isFinite(estimatedSolCostSol) || estimatedSolCostSol <= 0) {
    throw new Error("Estimated SOL cost must be a positive number");
  }

  const estimatedLamports = solToLamports(estimatedSolCostSol);
  const maxSolCostLamports = addSlippage(estimatedLamports, slippageBps);

  return await buildBuyInstruction({
    user,
    mint,
    tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume,
    bondingCurveCreator,
    rpc,
    commitment,
  });
}

/**
 * Simple buy wrapper that takes max SOL cost directly.
 */
export interface SimpleBuyParams {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount: bigint;
  /** Maximum SOL budget expressed in SOL units. */
  maxSolCostSol?: number;
  /** Optional lamport-denominated SOL budget. Takes precedence when provided. */
  maxSolCostLamports?: bigint;
  feeRecipient?: Address | string;
  trackVolume?: boolean;
  bondingCurveCreator?: Address | string;
  rpc: RpcClient;
  commitment?: CommitmentLevel;
}

export async function buySimple(params: SimpleBuyParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    maxSolCostSol,
    maxSolCostLamports,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    trackVolume = true,
    bondingCurveCreator,
    rpc,
    commitment = getDefaultCommitment(),
  } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  let maxSolCostLamportsValue: bigint | null = null;

  if (maxSolCostLamports !== undefined) {
    if (maxSolCostLamports <= 0n) {
      throw new Error("Max SOL cost lamports must be positive");
    }
    maxSolCostLamportsValue = maxSolCostLamports;
  } else if (maxSolCostSol !== undefined) {
    if (!Number.isFinite(maxSolCostSol) || maxSolCostSol <= 0) {
      throw new Error("Max SOL cost must be a positive number");
    }
    maxSolCostLamportsValue = solToLamports(maxSolCostSol);
  }

  if (maxSolCostLamportsValue === null) {
    throw new Error(
      "Provide either maxSolCostLamports or maxSolCostSol when calling buySimple"
    );
  }

  return await buildBuyInstruction({
    user,
    mint,
    tokenAmount,
    maxSolCostLamports: maxSolCostLamportsValue,
    feeRecipient,
    trackVolume,
    bondingCurveCreator,
    rpc,
    commitment,
  });
}