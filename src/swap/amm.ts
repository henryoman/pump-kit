import { loadAmmSnapshot, type AmmTradingContext } from "./snapshot";
import type { SwapPlan } from "./plan";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";

import {
  ammBuy as buildAmmBuy,
  ammSell as buildAmmSell,
} from "../clients/amm";
import { canonicalPoolCreator } from "./venue";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import { positiveAmountToRaw } from "../utils/amounts";
import {
  DEFAULT_SLIPPAGE_BPS,
  addSlippage,
  subSlippage,
  validateSlippage,
} from "../utils/slippage";
import { WSOL_ADDRESS, buildWrapSolInstructions, buildUnwrapSolInstructions } from "../utils/wsol";
import { poolPda } from "../pda/pumpAmm";
import { fetchPool, type Pool } from "../ammsdk/generated/accounts/pool";
import { PUMP_AMM_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "../pda/ata";
import { buildCreateAtaInstruction } from "../utils/ata";
import { quoteAmmBuyBudget, quoteAmmBuyCost, quoteAmmSell } from "../ammsdk/amm_math";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type AmmBaseParams = {
  user: TransactionSigner;
  mint: Address | string;
  rpc: RpcClient;
  commitment?: CommitmentLevel;
  /** Retained pool and vault addresses; each plan refreshes their mutable state together. */
  tradingContext?: AmmTradingContext;
  poolAddress?: Address | string;
  poolStateOverride?: Pool;
  poolCreator?: Address | string;
  poolIndex?: number;
  quoteMint?: Address | string;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  allowTrackVolume?: boolean;
  /** Inline wraps/closes WSOL; persistent leaves the quote ATA open. Defaults to persistent. */
  wsolStrategy?: "inline" | "persistent";
};

export type AmmBuyParams = AmmBaseParams & {
  /** SOL budget (before slippage), expressed in SOL. */
  solAmount?: number | string;
  /** Swap budget in lamports (mutually exclusive with solAmount). */
  amountIn?: bigint;
  kind?: "exactIn" | "exactOut";
  /** Fixed token base-unit target for exactOut buys. */
  amountOut?: bigint;
  /** Explicit lamport spending cap; replaces slippageBps. */
  maxAmountIn?: bigint;
  minAmountOut?: bigint;
  /** Optional slippage tolerance applied to the SOL budget (default 0.5%). */
  slippageBps?: number;
};

export type AmmSellParams = AmmBaseParams & {
  /** Human-readable token amount to sell. */
  tokenAmount?: number | string;
  /** Token base units (mutually exclusive with tokenAmount and percentage mode). */
  amountIn?: bigint;
  /** Explicit quote output floor; replaces slippageBps. */
  minAmountOut?: bigint;
  /** Optional decimals for the token (defaults to 6). */
  tokenDecimals?: number;
  /** Optional slippage tolerance applied to the SOL output floor (default 0.5%). */
  slippageBps?: number;
  /** Sell percentage of the wallet balance instead of a fixed amount. */
  useWalletPercentage?: boolean;
  /** Percentage of the wallet balance to sell (0-100]. */
  walletPercentage?: number;
};

const PERCENTAGE_SCALE = 10_000n;



const resolveQuoteMint = (quoteMint?: Address | string): Address =>
  toAddress(quoteMint ?? WSOL_ADDRESS);

export async function ammBuy(params: AmmBuyParams): Promise<SwapPlan> {
  const explicitOutput = params.amountOut !== undefined;
  if (explicitOutput) {
    if (params.kind !== "exactOut" || params.amountIn !== undefined || params.solAmount !== undefined || params.minAmountOut !== undefined) {
      throw new Error("amountOut requires exactOut and cannot be mixed with input budgets or output floors");
    }
    if (typeof params.amountOut !== "bigint" || params.amountOut <= 0n) throw new Error("amountOut must be a positive bigint");
  } else if ((params.amountIn === undefined) === (params.solAmount === undefined)) {
    throw new Error("Supply exactly one of amountIn or solAmount");
  }
  if (params.maxAmountIn !== undefined && (params.kind !== "exactOut" || params.slippageBps !== undefined)) {
    throw new Error("maxAmountIn requires exactOut and cannot be mixed with slippageBps");
  }
  if (params.maxAmountIn !== undefined && (typeof params.maxAmountIn !== "bigint" || params.maxAmountIn <= 0n)) throw new Error("maxAmountIn must be a positive bigint");
  const solBudgetLamports = explicitOutput ? 0n : params.amountIn ?? positiveAmountToRaw(params.solAmount!, 9, "solAmount");
  if (!explicitOutput && (typeof solBudgetLamports !== "bigint" || solBudgetLamports <= 0n)) throw new Error("amountIn must be a positive bigint");

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const commitment = params.commitment ?? getDefaultCommitment();
  const quoteMint = resolveQuoteMint(params.quoteMint);
  const mintAddress = toAddress(params.mint);


  const context = await resolvePoolContext({
    rpc: params.rpc,
    mint: mintAddress,
    quoteMint,
    commitment,
    tradingContext: params.tradingContext,
    poolAddress: params.poolAddress,
    poolStateOverride: params.poolStateOverride,
    poolCreator: params.poolCreator,
    poolIndex: params.poolIndex,
    baseTokenProgram: params.baseTokenProgram,
    quoteTokenProgram: params.quoteTokenProgram,
  });

  const fees = context.fees;
  const { tokenAmountOut, quoteRequired } = explicitOutput
    ? { tokenAmountOut: params.amountOut!, quoteRequired: quoteAmmBuyCost(params.amountOut!, context.baseReserve, context.quoteReserve, fees) }
    : quoteAmmBuyBudget(solBudgetLamports, context.baseReserve, context.quoteReserve, fees);

  const exactIn = params.kind !== "exactOut";
  if (params.minAmountOut !== undefined && (!exactIn || params.slippageBps !== undefined)) {
    throw new Error("Do not mix minAmountOut with exactOut or slippageBps");
  }
  const minAmountOut = params.minAmountOut ?? subSlippage(tokenAmountOut, slippageBps);
  if (exactIn && (typeof minAmountOut !== "bigint" || minAmountOut <= 0n)) throw new Error("minAmountOut must be positive");
  const maxQuoteIn = exactIn ? solBudgetLamports : params.maxAmountIn ?? addSlippage(quoteRequired, slippageBps);

  const { createInstruction } = await ensureUserAta({
    rpc: params.rpc,
    owner: params.user,
    mint: mintAddress,
    tokenProgram: context.baseTokenProgram,
  });

  const instruction = await buildAmmBuy({
    user: params.user,
    baseMint: mintAddress,
    quoteMint,
    tokenAmountOut,
    exactQuoteIn: exactIn ? { amountIn: solBudgetLamports, minAmountOut } : undefined,
    maxQuoteIn,
    resolvedState: { poolAddress: context.poolAddress, poolData: context.poolData, globalConfigData: context.globalConfigData },
    poolAddress: context.poolAddress,
    poolCreator: context.poolCreator,
    index: Number(context.poolData.index),
    allowTrackVolume: params.allowTrackVolume,
    baseTokenProgram: context.baseTokenProgram,
    quoteTokenProgram: context.quoteTokenProgram,
    rpc: params.rpc,
    commitment,
  });

  const prepend: Instruction[] = createInstruction ? [createInstruction] : [];
  const append: Instruction[] = [];
  if (quoteMint === toAddress(WSOL_ADDRESS)) {
    const wrap = await buildWrapSolInstructions({ owner: params.user, amount: maxQuoteIn, autoClose: params.wsolStrategy === "inline" });
    prepend.push(...wrap.prepend);
    append.push(...wrap.append);
  }
  return { venue: "amm", contextSlot: context.contextSlot, instructions: [...prepend, instruction, ...append],
    quote: exactIn
      ? { kind: "exactIn", amountIn: solBudgetLamports, expectedAmountOut: tokenAmountOut, minAmountOut }
      : { kind: "exactOut", amountOut: tokenAmountOut, expectedAmountIn: quoteRequired, maxAmountIn: maxQuoteIn } };
}

export async function ammSell(params: AmmSellParams): Promise<SwapPlan> {
  if (params.minAmountOut !== undefined && params.slippageBps !== undefined) throw new Error("Do not mix minAmountOut with slippageBps");
  if (params.minAmountOut !== undefined && (typeof params.minAmountOut !== "bigint" || params.minAmountOut <= 0n)) throw new Error("minAmountOut must be a positive bigint");
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const commitment = params.commitment ?? getDefaultCommitment();
  const quoteMint = resolveQuoteMint(params.quoteMint);
  const mintAddress = toAddress(params.mint);

  const context = await resolvePoolContext({
    rpc: params.rpc,
    mint: mintAddress,
    quoteMint,
    commitment,
    tradingContext: params.tradingContext,
    poolAddress: params.poolAddress,
    poolStateOverride: params.poolStateOverride,
    poolCreator: params.poolCreator,
    poolIndex: params.poolIndex,
    baseTokenProgram: params.baseTokenProgram,
    quoteTokenProgram: params.quoteTokenProgram,
  });

  const tokenAmountRaw = await resolveTokenAmountRaw({
    params,
    rpc: params.rpc,
    mint: mintAddress,
    tokenProgram: context.baseTokenProgram,
    decimals: context.baseMint.decimals,
  });

  if (tokenAmountRaw <= 0n) {
    throw new Error("Token amount must be positive");
  }
  const fees = context.fees;
  const quoteOut = quoteAmmSell(tokenAmountRaw, context.baseReserve, context.quoteReserve, context.realQuoteReserve, fees);

  const minQuoteOut = params.minAmountOut ?? subSlippage(quoteOut, slippageBps);
  if (minQuoteOut <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  const instruction = await buildAmmSell({
    user: params.user,
    baseMint: mintAddress,
    quoteMint,
    tokenAmountIn: tokenAmountRaw,
    minQuoteOut,
    resolvedState: { poolAddress: context.poolAddress, poolData: context.poolData, globalConfigData: context.globalConfigData },
    poolAddress: context.poolAddress,
    poolCreator: context.poolCreator,
    index: Number(context.poolData.index),
    allowTrackVolume: params.allowTrackVolume,
    baseTokenProgram: context.baseTokenProgram,
    quoteTokenProgram: context.quoteTokenProgram,
    rpc: params.rpc,
    commitment,
  });
  const { createInstruction } = await ensureUserAta({ rpc: params.rpc, owner: params.user, mint: quoteMint, tokenProgram: context.quoteTokenProgram });
  const append = quoteMint === toAddress(WSOL_ADDRESS) && params.wsolStrategy === "inline"
    ? await buildUnwrapSolInstructions(params.user) : [];
  return { venue: "amm", contextSlot: context.contextSlot,
    instructions: [...(createInstruction ? [createInstruction] : []), instruction, ...append],
    quote: { kind: "exactIn", amountIn: tokenAmountRaw, expectedAmountOut: quoteOut, minAmountOut: minQuoteOut } };

}

type ResolveAmmContextParams = {
  rpc: RpcClient;
  mint: Address;
  quoteMint: Address;
  commitment: CommitmentLevel;
  poolAddress?: Address | string;
  poolStateOverride?: Pool;
  poolCreator?: Address | string;
  poolIndex?: number;
};

/** Resolve once and retain the result for repeated quotes of the same pair. */
export async function resolveAmmTradingContext(params: ResolveAmmContextParams): Promise<AmmTradingContext> {
  const creator = params.poolCreator ? toAddress(params.poolCreator) : await canonicalPoolCreator(params.mint);
  const poolAddress = params.poolAddress ? toAddress(params.poolAddress)
    : await poolPda(params.poolIndex ?? 0, creator, params.mint, params.quoteMint);
  const account = params.poolStateOverride ? undefined : await fetchPool(params.rpc, poolAddress, { commitment: params.commitment });
  if (account && account.programAddress !== toAddress(PUMP_AMM_PROGRAM_ID)) throw new Error("Invalid AMM pool owner");
  const pool = params.poolStateOverride ?? account!.data;
  if (pool.baseMint !== params.mint || pool.quoteMint !== params.quoteMint) throw new Error("AMM pool does not match requested mint pair");
  if (!params.poolAddress && (pool.creator !== creator || pool.index !== (params.poolIndex ?? 0))) throw new Error("AMM pool does not match requested creator or index");
  return { poolAddress, baseMint: pool.baseMint, quoteMint: pool.quoteMint,
    baseVault: pool.poolBaseTokenAccount, quoteVault: pool.poolQuoteTokenAccount };
}

async function resolvePoolContext(params: ResolveAmmContextParams & {
  tradingContext?: AmmTradingContext;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
}) {
  const context = params.tradingContext ?? await resolveAmmTradingContext(params);
  if (context.baseMint !== params.mint || context.quoteMint !== params.quoteMint ||
      (params.poolAddress && context.poolAddress !== toAddress(params.poolAddress))) throw new Error("Retained context does not match requested pool or mint pair");
  const snapshot = await loadAmmSnapshot({ rpc: params.rpc, context, commitment: params.commitment });
  if ((params.baseTokenProgram && toAddress(params.baseTokenProgram) !== snapshot.baseTokenProgram) ||
      (params.quoteTokenProgram && toAddress(params.quoteTokenProgram) !== snapshot.quoteTokenProgram)) throw new Error("Token program hint does not match snapshot mint owner");
  return snapshot;
}

async function ensureUserAta({
  owner,
  mint,
  tokenProgram,
}: {
  rpc: RpcClient;
  owner: TransactionSigner;
  mint: Address;
  tokenProgram: Address;
}) {
  const [userAta] = await findAssociatedTokenPda({
    owner: toAddress(owner.address),
    mint,
    tokenProgram,
  });

  const createInstruction = await buildCreateAtaInstruction({ payer: owner, owner, mint, tokenProgram });

  return { userAta, createInstruction } as const;
}

async function resolveTokenAmountRaw({
  params,
  rpc,
  mint,
  tokenProgram,
  decimals,
}: {
  params: AmmSellParams;
  decimals: number;
  rpc: RpcClient;
  mint: Address;
  tokenProgram: Address;
}) {
  const useWalletPercentage = params.useWalletPercentage ?? false;
  if (params.tokenDecimals !== undefined && params.tokenDecimals !== decimals) throw new Error("tokenDecimals does not match snapshot mint");

  if (params.amountIn !== undefined) {
    if (params.tokenAmount !== undefined || useWalletPercentage) throw new Error("Do not mix raw, decimal, and percentage amounts");
    if (typeof params.amountIn !== "bigint" || params.amountIn <= 0n) throw new Error("amountIn must be a positive bigint");
    return params.amountIn;
  }
  if (useWalletPercentage) {
    const percentage = params.walletPercentage ?? 100;
    const scaled = percentageToScaled(percentage);

    const balance = await fetchUserTokenBalance(rpc, params.user, mint, tokenProgram);
    if (balance === 0n) {
      throw new Error("Wallet token balance is zero; nothing to sell");
    }

    const amount = (balance * scaled) / PERCENTAGE_SCALE;
    if (amount <= 0n) {
      throw new Error("Percentage sell rounds to zero token units");
    }
    return amount;
  }

  if (params.tokenAmount === undefined) {
    throw new Error("tokenAmount is required when useWalletPercentage is false");
  }
  return positiveAmountToRaw(params.tokenAmount, decimals, "tokenAmount");
}

async function fetchUserTokenBalance(
  rpc: RpcClient,
  user: TransactionSigner,
  mint: Address,
  tokenProgram: Address
): Promise<bigint> {
  const [userAta] = await findAssociatedTokenPda({
    owner: toAddress(user.address),
    mint,
    tokenProgram,
  });

  const accountInfo = await rpc.getTokenAccountBalance(userAta).send();
  return BigInt(accountInfo.value.amount);
}

function percentageToScaled(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("walletPercentage must be between 0 and 100");
  }
  return BigInt(Math.round(percentage * 100));
}

