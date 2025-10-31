/**
 * Ultra-simple swap API - the cleanest way to trade on Pump.fun.
 * Users now provide input-side amounts (SOL for buys, tokens for sells) plus optional slippage.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";
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
import { findAssociatedTokenPda } from "./pda/ata";
import { TOKEN_PROGRAM_ID } from "./config/addresses";
import { buildCreateAtaInstruction } from "./utils/ata";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type WithRpcOptions = {
  rpc: RpcClient;
  commitment?: CommitmentLevel;
};

export type BuyParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  /** SOL budget (before slippage), expressed in SOL. */
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
  /** Human-readable token amount to sell. */
  tokenAmount?: number;
  /** Use a percentage of the wallet balance instead of fixed token amount. */
  useWalletPercentage?: boolean;
  /** Percentage of the wallet balance to sell (0-100]. */
  walletPercentage?: number;
  /** Token decimals (defaults to 6). */
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

  const mintAddress = toAddress(params.mint);
  const [userAta] = await findAssociatedTokenPda({
    owner: toAddress(params.user.address),
    mint: mintAddress,
    tokenProgram: toAddress(TOKEN_PROGRAM_ID),
  });

  // Check if user ATA exists - if not, we need to create it
  let createAtaInstruction: Instruction | null = null;
  try {
    const ataAccount = await rpcClient.getAccountInfo(userAta).send();
    if (!ataAccount.value) {
      // ATA doesn't exist, create it
      createAtaInstruction = buildCreateAtaInstruction({
        payer: params.user,
        owner: params.user,
        mint: mintAddress,
      });
    }
  } catch {
    // If we can't check, assume it needs to be created (safe to create even if exists)
    createAtaInstruction = buildCreateAtaInstruction({
      payer: params.user,
      owner: params.user,
      mint: mintAddress,
    });
  }

  const buyInstruction = await buySimple({
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

  // If we need to create ATA, return both instructions
  // The caller will need to handle prepending
  if (createAtaInstruction) {
    // Return a special instruction that includes both
    // For now, we'll modify the buy instruction to include prepend info
    // Actually, better to throw an error or return both instructions
    // Let's create a wrapper that handles this
    return {
      ...buyInstruction,
      prepend: [createAtaInstruction],
    } as Instruction & { prepend?: Instruction[] };
  }

  return buyInstruction;
}

const PERCENTAGE_SCALE = 10_000;

function percentageToScaled(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("walletPercentage must be between 0 and 100");
  }
  return BigInt(Math.round(percentage * 100));
}

export async function sell(params: SellParams): Promise<Instruction> {
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

  const useWalletPercentage = params.useWalletPercentage ?? false;
  const mintAddress = toAddress(params.mint);
  let tokenAmountRaw: bigint;

  if (useWalletPercentage) {
    const percentage = params.walletPercentage ?? 100;
    const scaled = percentageToScaled(percentage);

    const [associatedUser] = await findAssociatedTokenPda({
      owner: toAddress(params.user.address),
      mint: mintAddress,
      tokenProgram: toAddress(TOKEN_PROGRAM_ID),
    });

    const balanceResponse = await rpcClient
      .getTokenAccountBalance(associatedUser)
      .send();

    const rawBalance = BigInt(balanceResponse.value.amount);
    if (rawBalance === 0n) {
      throw new Error("Wallet token balance is zero; nothing to sell");
    }

    tokenAmountRaw = (rawBalance * scaled) / BigInt(PERCENTAGE_SCALE);
    if (tokenAmountRaw <= 0n) {
      tokenAmountRaw = 1n;
    }
  } else {
    if (params.tokenAmount === undefined) {
      throw new Error("tokenAmount is required when useWalletPercentage is false");
    }
    ensurePositiveNumber(params.tokenAmount, "tokenAmount");
    const decimals = params.tokenDecimals ?? 6;
    tokenAmountRaw = tokensToRaw(params.tokenAmount, decimals);
  }

  const quote = quoteSellForTokenAmount(curve, fees, tokenAmountRaw);
  const minSolOutputLamports = subSlippage(quote.solOutputLamports, slippageBps);

  if (minSolOutputLamports <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  return await sellSimple({
    user: params.user,
    mint: params.mint,
    tokenAmountRaw,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });
}

type QuickBuyOptions = Omit<BuyParams, "user" | "mint" | "solAmount">;
type QuickSellOptions = Omit<SellParams, "user" | "mint" | "tokenAmount">;

export async function quickBuy(
  user: TransactionSigner,
  mint: Address | string,
  solAmount: number,
  options?: QuickBuyOptions
): Promise<Instruction> {
  if (!options) {
    throw new Error("quickBuy requires options with an RPC client (options.rpc)");
  }

  const { rpc, ...rest } = options;

  return buy({
    user,
    mint,
    solAmount,
    rpc,
    ...rest,
  });
}

export async function quickSell(
  user: TransactionSigner,
  mint: Address | string,
  tokenAmount: number,
  options?: QuickSellOptions
): Promise<Instruction> {
  if (!options) {
    throw new Error("quickSell requires options with an RPC client (options.rpc)");
  }

  const { rpc, ...rest } = options;

  return sell({
    user,
    mint,
    tokenAmount,
    rpc,
    ...rest,
  });
}
