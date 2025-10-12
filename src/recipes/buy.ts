/**
 * Buy recipe - purchase tokens from the bonding curve with slippage protection.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { buy as buildBuyInstruction } from "../clients/pump";
import { DEFAULT_FEE_RECIPIENT } from "../config/constants";
import { addSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";
import { getDefaultCommitment } from "../config/commitment";

type RpcClient = Parameters<typeof buildBuyInstruction>[0]["rpc"];
type CommitmentLevel = Parameters<typeof buildBuyInstruction>[0]["commitment"];

export interface BuyWithSlippageParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: Address | string;
  /** Amount of tokens to buy */
  tokenAmount: bigint;
  /** Estimated SOL cost in lamports (will add slippage) */
  estimatedSolCost: bigint;
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
    estimatedSolCost,
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
  if (estimatedSolCost <= 0n) throw new Error("Estimated SOL cost must be positive");

  // Calculate max SOL cost with slippage
  const maxSolCostLamports = addSlippage(estimatedSolCost, slippageBps);

  return await buildBuyInstruction({
    user,
    mint,
    tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume,
    bondingCurveCreator,
    rpc,
    commitment = getDefaultCommitment(),
  });
}

/**
 * Simple buy wrapper that takes max SOL cost directly.
 */
export interface SimpleBuyParams {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount: bigint;
  maxSolCostLamports: bigint;
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
    maxSolCostLamports,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    trackVolume = true,
    bondingCurveCreator,
    rpc,
    commitment,
  } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (maxSolCostLamports <= 0n) throw new Error("Max SOL cost must be positive");

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
