/**
 * Ultra-simple swap API - the cleanest way to trade on Pump.fun.
 * Users now provide input-side amounts (SOL for buys, tokens for sells) plus optional slippage.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import type { RpcClient } from "./config/connection";
import { getDefaultCommitment } from "./config/commitment";
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

type BuyImplementationParams = Parameters<typeof buySimple>[0];
type SellImplementationParams = Parameters<typeof sellSimple>[0];

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type WithRpcOptions = {
  /** RPC client used to fetch Pump accounts. */
  rpc: RpcClient;
  /** Optional commitment override */
  commitment?: BuyImplementationParams["commitment"];
};

export type BuyParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  /** Target SOL spend (lamports) before applying slippage */
  solAmountLamports: bigint;
  /** Optional slippage tolerance applied to the SOL budget (default 0.5%) */
  slippageBps?: number;
  /** Optional override for fee recipient */
  feeRecipient?: Address | string;
  /** Optional override for bonding curve creator (skips extra RPC) */
  bondingCurveCreator?: Address | string;
  /** Whether to track user volume (defaults to true) */
  trackVolume?: boolean;
  /** Advanced: provide pre-fetched bonding curve reserves to skip RPC */
  curveStateOverride?: BondingCurveState;
  /** Advanced: provide pre-resolved fee structure to skip RPC */
  feeStructureOverride?: FeeStructure;
};

export type SellParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  /** Token amount (input mint) to sell */
  tokenAmount: bigint;
  /** Optional slippage tolerance applied to SOL output (default 0.5%) */
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  /** Advanced: provide pre-fetched bonding curve reserves to skip RPC */
  curveStateOverride?: BondingCurveState;
  /** Advanced: provide pre-resolved fee structure to skip RPC */
  feeStructureOverride?: FeeStructure;
};

const DEFAULT_FEE_RECIPIENT_ADDRESS = DEFAULT_FEE_RECIPIENT;

const ensurePositive = (value: bigint, field: string) => {
  if (value <= 0n) {
    throw new Error(`${field} must be a positive bigint`);
  }
};

const toFeeStructure = (flatFees: Fees): FeeStructure => ({
  lpFeeBps: flatFees.lpFeeBps,
  protocolFeeBps: flatFees.protocolFeeBps,
  creatorFeeBps: flatFees.creatorFeeBps,
});

async function loadCurveState(
  mint: Address | string,
  rpcClient: NonNullable<BuyImplementationParams["rpc"]>,
  commitment: CommitmentLevel | undefined,
  overrides?: {
    curve?: BondingCurveState;
    fees?: FeeStructure;
  }
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
      "Failed to load bonding curve state. Provide `curveStateOverride`/`feeStructureOverride` or ensure the RPC endpoint can access Pump accounts.",
      { cause: error }
    );
  }
}

/**
 * Buy tokens by specifying the SOL budget (input mint).
 * Slippage is applied to the SOL budget; the helper computes the token amount automatically.
 */
export async function buy(params: BuyParams): Promise<Instruction> {
  ensurePositive(params.solAmountLamports, "solAmountLamports");

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

  const quote = quoteBuyWithSolAmount(curve, fees, params.solAmountLamports);
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

/**
 * Sell tokens by specifying the input token amount.
 * Slippage is applied to the SOL output floor; min output is derived automatically.
 */
export async function sell(params: SellParams): Promise<Instruction> {
  ensurePositive(params.tokenAmount, "tokenAmount");

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

  const quote = quoteSellForTokenAmount(curve, fees, params.tokenAmount);
  const minSolOutputLamports = subSlippage(quote.solOutputLamports, slippageBps);

  if (minSolOutputLamports <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  return await sellSimple({
    user: params.user,
    mint: params.mint,
    tokenAmount: params.tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });
}

/**
 * Quick buy helper that takes a SOL budget and applies the default slippage guard.
 */
export async function quickBuy(
  user: TransactionSigner,
  mint: Address | string,
  solAmountLamports: bigint,
  options?: Omit<BuyParams, "user" | "mint" | "solAmountLamports">
): Promise<Instruction> {
  return buy({
    user,
    mint,
    solAmountLamports,
    ...(options ?? {}),
  });
}

/**
 * Quick sell helper that takes a token amount and applies the default slippage guard.
 */
export async function quickSell(
  user: TransactionSigner,
  mint: Address | string,
  tokenAmount: bigint,
  options?: Omit<SellParams, "user" | "mint" | "tokenAmount">
): Promise<Instruction> {
  return sell({
    user,
    mint,
    tokenAmount,
    ...(options ?? {}),
  });
}
