/**
 * Ultra-simple swap API - the cleanest way to trade on Pump.fun.
 * Users now provide input-side amounts (SOL for buys, tokens for sells) plus optional slippage.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import type { RpcClient } from "./config/connection";
import { buySimple } from "./recipes/buy";
import { sellSimple } from "./recipes/sell";
import { DEFAULT_SLIPPAGE_BPS, addSlippage, subSlippage, validateSlippage } from "./utils/slippage";
import { DEFAULT_FEE_RECIPIENT } from "./config/constants";
import { bondingCurvePda, feeConfigPda } from "./pda/pump";
import { fetchBondingCurve } from "./pumpsdk/generated/accounts/bondingCurve";
import { fetchFeeConfig } from "./pumpsdk/generated/accounts/feeConfig";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  type FeeStructure,
  type BondingCurveState,
} from "./ammsdk/bondingCurveMath";
import type { Fees } from "./pumpsdk/generated/types/fees";
import { solToLamports, tokensToRaw } from "./utils/amounts";
import { getDefaultCommitment } from "./config/commitment";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type WithRpcOptions = {
  rpc: RpcClient;
  commitment?: CommitmentLevel;
};

export type BuyParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  /** SOL budget (before slippage), expressed in whole SOL. */
  solAmount: number;
  /** Optional slippage tolerance applied to the SOL budget (default 0.5%). */
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  trackVolume?: boolean;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
};

export type SellParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  /** Token amount the user wants to sell (human-readable quantity). */
  tokenAmount: number;
  /** Token decimals (defaults to 6 for Pump tokens). */
  tokenDecimals?: number;
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
};

const DEFAULT_FEE_RECIPIENT_ADDRESS = DEFAULT_FEE_RECIPIENT;

const ensurePositiveNumber = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
};

const toFeeStructure = (flatFees: Fees): FeeStructure => ({
  lpFeeBps: flatFees.lpFeeBps,
  protocolFeeBps: flatFees.protocolFeeBps,
  creatorFeeBps: flatFees.creatorFeeBps,
});

type CurveLoadOverrides = {
  curve?: BondingCurveState;
  fees?: FeeStructure;
};

async function loadCurveState(
  mint: Address | string,
  rpcClient: RpcClient,
  commitment: CommitmentLevel,
  overrides?: CurveLoadOverrides
) {
  const curvePromise = overrides?.curve
    ? Promise.resolve(overrides.curve)
    : (async () => {
        const address = await bondingCurvePda(mint);
        const account = await fetchBondingCurve(rpcClient, address, { commitment });
        return account.data;
      })();

  const feesPromise = overrides?.fees
    ? Promise.resolve(overrides.fees)
    : (async () => {
        const address = await feeConfigPda();
        const account = await fetchFeeConfig(rpcClient, address, { commitment });
        return toFeeStructure(account.data.flatFees);
      })();

  try {
    const [curve, fees] = await Promise.all([curvePromise, feesPromise]);
    return { curve, fees };
  } catch (error) {
    throw new Error(
      "Failed to load bonding curve state. Provide overrides or ensure the RPC endpoint can access Pump accounts.",
      { cause: error }
    );
  }
}

export async function buy(params: BuyParams): Promise<Instruction> {
  ensurePositiveNumber(params.solAmount, "solAmount");

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;
  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();

  const { curve, fees } = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });
  const creator = params.bondingCurveCreator ?? curve.creator;

  const solBudgetLamports = solToLamports(params.solAmount);
  const quote = quoteBuyWithSolAmount(curve, fees, solBudgetLamports);
  const maxSolCostLamports = addSlippage(quote.totalSolCostLamports, slippageBps);

  return await buySimple({
    user: params.user,
    mint: params.mint,
    tokenAmount: quote.tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume: params.trackVolume,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });
}

export async function sell(params: SellParams): Promise<Instruction> {
  ensurePositiveNumber(params.tokenAmount, "tokenAmount");

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;
  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();

  const { curve, fees } = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });
  const creator = params.bondingCurveCreator ?? curve.creator;

  const decimals = params.tokenDecimals ?? 6;
  const tokenAmountRaw = tokensToRaw(params.tokenAmount, decimals);
  const quote = quoteSellForTokenAmount(curve, fees, tokenAmountRaw);
  const minSolOutputLamports = subSlippage(quote.solOutputLamports, slippageBps);

  if (minSolOutputLamports <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  return await sellSimple({
    user: params.user,
    mint: params.mint,
    tokenAmount: tokenAmountRaw,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });
}

export async function quickBuy(
  user: TransactionSigner,
  mint: Address | string,
  solAmount: number,
  options: Omit<BuyParams, "user" | "mint" | "solAmount"> = {}
): Promise<Instruction> {
  return buy({
    user,
    mint,
    solAmount,
    ...options,
  });
}

export async function quickSell(
  user: TransactionSigner,
  mint: Address | string,
  tokenAmount: number,
  options: Omit<SellParams, "user" | "mint" | "tokenAmount"> = {}
): Promise<Instruction> {
  return sell({
    user,
    mint,
    tokenAmount,
    ...options,
  });
}
