/**
 * Sell recipe - sell tokens back to the bonding curve with slippage protection.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { sell as buildSellInstruction } from "../clients/pump";
import { DEFAULT_FEE_RECIPIENT } from "../config/constants";
import { DEFAULT_SLIPPAGE_BPS, subSlippage, validateSlippage } from "../utils/slippage";
import { tokensToRaw, solToLamports } from "../utils/amounts";
import { getDefaultCommitment } from "../config/commitment";

const DEFAULT_TOKEN_DECIMALS = 6;

type RpcClient = Parameters<typeof buildSellInstruction>[0]["rpc"];
type CommitmentLevel = Parameters<typeof buildSellInstruction>[0]["commitment"];

export interface SellWithSlippageParams {
  user: TransactionSigner;
  mint: Address | string;
  /** Amount of tokens to sell (human-readable). */
  tokenAmount: number;
  /** Estimated SOL output in SOL units. */
  estimatedSolOutSol: number;
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  rpc: RpcClient;
  commitment?: CommitmentLevel;
}

export async function sellWithSlippage(params: SellWithSlippageParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    estimatedSolOutSol,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    bondingCurveCreator,
    rpc,
    commitment,
  } = params;

  validateSlippage(slippageBps);
  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) throw new Error("Token amount must be a positive number");
  if (!Number.isFinite(estimatedSolOutSol) || estimatedSolOutSol < 0) throw new Error("Estimated SOL output cannot be negative");

  const tokenAmountRaw = tokensToRaw(tokenAmount, DEFAULT_TOKEN_DECIMALS);
  const estimatedSolOutLamports = solToLamports(estimatedSolOutSol);
  const minSolOutputLamports = subSlippage(estimatedSolOutLamports, slippageBps);

  return await buildSellInstruction({
    user,
    mint,
    tokenAmount: tokenAmountRaw,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator,
    rpc,
    commitment,
  });
}

export interface SimpleSellParams {
  user: TransactionSigner;
  mint: Address | string;
  /** Human-readable token amount to sell (defaults to 6 decimals). */
  tokenAmount?: number;
  /** Raw token amount expressed in the mint's base units. */
  tokenAmountRaw?: bigint;
  /** Minimum SOL output expressed in SOL units. */
  minSolOutputSol?: number;
  /** Optional lamport-denominated minimum SOL output. */
  minSolOutputLamports?: bigint;
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
    tokenAmountRaw,
    minSolOutputSol,
    minSolOutputLamports,
    feeRecipient = DEFAULT_FEE_RECIPIENT,
    bondingCurveCreator,
    rpc,
    commitment,
  } = params;

  let tokenAmountRawValue: bigint | null = null;
  if (tokenAmountRaw !== undefined) {
    if (tokenAmountRaw <= 0n) {
      throw new Error("Token amount lamports must be positive");
    }
    tokenAmountRawValue = tokenAmountRaw;
  } else if (tokenAmount !== undefined) {
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      throw new Error("Token amount must be a positive number");
    }
    tokenAmountRawValue = tokensToRaw(tokenAmount, DEFAULT_TOKEN_DECIMALS);
  }

  if (tokenAmountRawValue === null) {
    throw new Error(
      "Provide either tokenAmountRaw or tokenAmount when calling sellSimple"
    );
  }

  let minSolOutputLamportsValue: bigint | null = null;
  if (minSolOutputLamports !== undefined) {
    if (minSolOutputLamports < 0n) {
      throw new Error("Min SOL output lamports cannot be negative");
    }
    minSolOutputLamportsValue = minSolOutputLamports;
  } else if (minSolOutputSol !== undefined) {
    if (!Number.isFinite(minSolOutputSol) || minSolOutputSol < 0) {
      throw new Error("Min SOL output cannot be negative");
    }
    minSolOutputLamportsValue = solToLamports(minSolOutputSol);
  }

  if (minSolOutputLamportsValue === null) {
    throw new Error(
      "Provide either minSolOutputLamports or minSolOutputSol when calling sellSimple"
    );
  }

  return await buildSellInstruction({
    user,
    mint,
    tokenAmount: tokenAmountRawValue,
    minSolOutputLamports: minSolOutputLamportsValue,
    feeRecipient,
    bondingCurveCreator,
    rpc,
    commitment,
  });
}
