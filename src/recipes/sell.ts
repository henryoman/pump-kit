/**
 * Sell recipe - sell tokens back to the bonding curve with slippage protection.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { sell as buildSellInstruction } from "../clients/pump";
import { DEFAULT_FEE_RECIPIENT } from "../config/constants";
import { DEFAULT_SLIPPAGE_BPS, subSlippage, validateSlippage } from "../utils/slippage";
import { getDefaultCommitment } from "../config/commitment";

type RpcClient = Parameters<typeof buildSellInstruction>[0]["rpc"];
type CommitmentLevel = Parameters<typeof buildSellInstruction>[0]["commitment"];

export interface SellWithSlippageParams {
  /** User's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: Address | string;
  /** Amount of tokens to sell */
  tokenAmount: bigint;
  /** Estimated SOL output in lamports (will subtract slippage) */
  estimatedSolOut: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Fee recipient address */
  feeRecipient?: Address | string;
  /** Optional override to skip fetching the bonding curve account */
  bondingCurveCreator?: Address | string;
  /** RPC client used to fetch Pump accounts */
  rpc: RpcClient;
  /** Optional commitment override */
  commitment?: CommitmentLevel;
}

/**
 * Build a sell instruction with automatic slippage calculation.
 * Takes an estimated SOL output and subtracts slippage to create the min SOL output.
 */
export async function sellWithSlippage(params: SellWithSlippageParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    estimatedSolOut,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    bondingCurveCreator,
    rpc,
    commitment = getDefaultCommitment(),
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (estimatedSolOut < 0n) throw new Error("Estimated SOL output cannot be negative");

  // Calculate min SOL output with slippage protection
  const minSolOutputLamports = subSlippage(estimatedSolOut, slippageBps);

  return await buildSellInstruction({
    user,
    mint,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator,
    rpc,
    commitment = getDefaultCommitment(),
  });
}

/**
 * Simple sell wrapper that takes min SOL output directly.
 */
export interface SimpleSellParams {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount: bigint;
  minSolOutputLamports: bigint;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  rpc: RpcClient;
  commitment?: CommitmentLevel;
}

export async function sellSimple(params: SimpleSellParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    bondingCurveCreator,
    rpc,
    commitment,
  } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (minSolOutputLamports < 0n) throw new Error("Min SOL output cannot be negative");

  return await buildSellInstruction({
    user,
    mint,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator,
    rpc,
    commitment,
  });
}
