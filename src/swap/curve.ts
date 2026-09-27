import { loadCurveSnapshot } from "./snapshot";
import type { SwapPlan } from "./plan";
import type { Address, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";

import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import { buyV2, sellV2, buyExactQuoteInV2 } from "../clients/trade_v2";
import { resolveTokenProgram } from "../utils/token_program";
import { fetchGlobal } from "../pumpsdk/generated/accounts/global";
import { globalPda } from "../pda/pump";
import { findAssociatedTokenPda } from "../pda/ata";
import { TOKEN_PROGRAM_ID } from "../config/addresses";
import { buildCreateAtaInstruction } from "../utils/ata";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  quoteSolCostForBuy,
  type BondingCurveState,
  type FeeStructure,
} from "../ammsdk/bondingCurveMath";
import { positiveAmountToRaw } from "../utils/amounts";
import {
  DEFAULT_SLIPPAGE_BPS,
  addSlippage,
  subSlippage,
  validateSlippage,
} from "../utils/slippage";


export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type WithRpcOptions = {
  rpc: RpcClient;
  commitment?: CommitmentLevel;
  /** Required slot for complete state overrides; fetched state retains its snapshot slot. */
  contextSlot?: bigint;
};

export type CurveBuyParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  solAmount?: number | string;
  /** Swap budget in lamports (mutually exclusive with solAmount). */
  amountIn?: bigint;
  /** Defaults to exactIn. exactOut uses a fixed token output derived from the budget. */
  kind?: "exactIn" | "exactOut";
  /** Fixed token base-unit target for exactOut buys. */
  amountOut?: bigint;
  /** Explicit lamport spending cap; replaces slippageBps. */
  maxAmountIn?: bigint;
  minAmountOut?: bigint;
  slippageBps?: number;
  feeRecipient?: Address | string;
  buybackFeeRecipient?: Address | string;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  bondingCurveCreator?: Address | string;
  trackVolume?: boolean;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
  allowAtaCreation?: boolean;
};

export type CurveSellParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount?: number | string;
  /** Token base units (mutually exclusive with tokenAmount and percentage mode). */
  amountIn?: bigint;
  /** Explicit quote output floor; replaces slippageBps. */
  minAmountOut?: bigint;
  useWalletPercentage?: boolean;
  walletPercentage?: number;
  tokenDecimals?: number;
  slippageBps?: number;
  feeRecipient?: Address | string;
  buybackFeeRecipient?: Address | string;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  bondingCurveCreator?: Address | string;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
};

const PERCENTAGE_SCALE = 10_000;



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
  if (!overrides?.curve || !overrides?.fees) {
    return loadCurveSnapshot({ rpc: rpcClient, mint, commitment });
  }
  return { curve: overrides.curve, fees: overrides.fees, contextSlot: undefined,
    global: undefined, baseMint: undefined, quoteMint: undefined } as const;

}

async function resolveTradeContext(params: CurveBuyParams | CurveSellParams, curve: BondingCurveState, snapshot?: Awaited<ReturnType<typeof loadCurveState>>) {
  if (snapshot?.baseMint && params.baseTokenProgram && toAddress(params.baseTokenProgram) !== snapshot.baseMint.tokenProgram) {
    throw new Error("Token program hint does not match snapshot mint owner");
  }
  if (snapshot?.quoteMint && params.quoteTokenProgram && toAddress(params.quoteTokenProgram) !== snapshot.quoteMint.tokenProgram) {
    throw new Error("Quote token program hint does not match snapshot mint owner");
  }
  const [baseTokenProgram, quoteTokenProgram] = await Promise.all([
    resolveTokenProgram({ rpc: params.rpc, mint: params.mint, tokenProgram: snapshot?.baseMint?.tokenProgram ?? params.baseTokenProgram }),
    resolveTokenProgram({ rpc: params.rpc, mint: "So11111111111111111111111111111111111111112", tokenProgram: snapshot?.quoteMint?.tokenProgram ?? params.quoteTokenProgram ?? TOKEN_PROGRAM_ID }),
  ]);
  const global = snapshot?.global ?? (params.feeRecipient && params.buybackFeeRecipient ? undefined : (await fetchGlobal(params.rpc, await globalPda())).data);
  const feeRecipient = toAddress(params.feeRecipient ?? (curve.isMayhemMode ? global!.reservedFeeRecipient : global!.feeRecipient));
  const buybackFeeRecipient = params.buybackFeeRecipient ?? global!.buybackFeeRecipients.find(value => value !== toAddress("11111111111111111111111111111111"));
  if (!buybackFeeRecipient) throw new Error("No buyback fee recipient configured");
  return { baseTokenProgram, quoteTokenProgram, feeRecipient, buybackFeeRecipient: toAddress(buybackFeeRecipient) };
}

function percentageToScaled(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("walletPercentage must be between 0 and 100");
  }
  return BigInt(Math.round(percentage * 100));
}

export async function curveBuy(params: CurveBuyParams): Promise<SwapPlan> {
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


  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();


  const snapshot = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });
  const { curve, fees } = snapshot;
  const contextSlot = snapshot.contextSlot ?? params.contextSlot;
  if (contextSlot === undefined) throw new Error("State overrides require contextSlot");

  if (curve.quoteMint && curve.quoteMint !== toAddress("11111111111111111111111111111111") && curve.quoteMint !== toAddress("So11111111111111111111111111111111111111112")) {
    throw new Error("SOL helpers require a SOL-paired curve; use explicit quote v2 builders for other pairs");
  }
  if (curve.complete) {
    throw new Error("Token has migrated to the AMM. Use ammBuy instead of curveBuy.");
  }

  const creator = params.bondingCurveCreator
    ? toAddress(params.bondingCurveCreator)
    : curve.creator;


  const tokenAmountToBuy = params.amountOut ?? quoteBuyWithSolAmount(curve, fees, solBudgetLamports).tokenAmount;
  const exactCost = quoteSolCostForBuy(curve, fees, tokenAmountToBuy);
  const slippageAdjustedCost = addSlippage(exactCost.totalSolCostLamports, slippageBps);
  const budgetLimit = explicitOutput ? slippageAdjustedCost : addSlippage(solBudgetLamports, slippageBps);
  const maxSolCostLamports = params.maxAmountIn ?? (slippageAdjustedCost < budgetLimit ? slippageAdjustedCost : budgetLimit);

  const tradeContext = await resolveTradeContext(params, curve, snapshot);
  const mintAddress = toAddress(params.mint);
  const createAtaInstruction = params.allowAtaCreation === false ? undefined : await buildCreateAtaInstruction({
    payer: params.user,
    owner: params.user,
    mint: mintAddress,
    tokenProgram: tradeContext.baseTokenProgram,
  });

  if (params.kind !== "exactOut") {
    if (params.minAmountOut !== undefined && params.slippageBps !== undefined) {
      throw new Error("Do not mix minAmountOut with slippageBps");
    }
    const minAmountOut = params.minAmountOut ?? subSlippage(tokenAmountToBuy, slippageBps);
    if (typeof minAmountOut !== "bigint" || minAmountOut <= 0n) throw new Error("minAmountOut must be a positive bigint");
    const instruction = await buyExactQuoteInV2({ user: params.user, mint: params.mint,
      quoteAmountRaw: solBudgetLamports, minTokenOutputRaw: minAmountOut,
      ...tradeContext, bondingCurveCreator: creator, rpc: rpcClient });
    return { venue: "curve", contextSlot,
      instructions: createAtaInstruction ? [createAtaInstruction, instruction] : [instruction],
      quote: { kind: "exactIn", amountIn: solBudgetLamports, expectedAmountOut: tokenAmountToBuy, minAmountOut } };
  }
  if (params.minAmountOut !== undefined) throw new Error("minAmountOut applies only to exactIn buys");
  const buyInstruction = await buyV2({
    user: params.user,
    mint: params.mint,
    tokenAmountRaw: tokenAmountToBuy,
    maxQuoteInputRaw: maxSolCostLamports,
    ...tradeContext,
    bondingCurveCreator: creator,
    rpc: rpcClient,
  });

  return { venue: "curve", contextSlot,
    instructions: createAtaInstruction ? [createAtaInstruction, buyInstruction] : [buyInstruction],
    quote: { kind: "exactOut", amountOut: tokenAmountToBuy,
      expectedAmountIn: exactCost.totalSolCostLamports, maxAmountIn: maxSolCostLamports } };

}

export async function curveSell(params: CurveSellParams): Promise<SwapPlan> {
  if (params.minAmountOut !== undefined && params.slippageBps !== undefined) throw new Error("Do not mix minAmountOut with slippageBps");
  if (params.minAmountOut !== undefined && (typeof params.minAmountOut !== "bigint" || params.minAmountOut <= 0n)) throw new Error("minAmountOut must be a positive bigint");
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);


  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();


  const snapshot = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });
  const { curve, fees } = snapshot;
  const contextSlot = snapshot.contextSlot ?? params.contextSlot;
  if (contextSlot === undefined) throw new Error("State overrides require contextSlot");

  if (curve.quoteMint && curve.quoteMint !== toAddress("11111111111111111111111111111111") && curve.quoteMint !== toAddress("So11111111111111111111111111111111111111112")) {
    throw new Error("SOL helpers require a SOL-paired curve; use explicit quote v2 builders for other pairs");
  }
  if (curve.complete) {
    throw new Error("Token has migrated to the AMM. Use ammSell instead of curveSell.");
  }

  const creator = params.bondingCurveCreator
    ? toAddress(params.bondingCurveCreator)
    : curve.creator;

  const tradeContext = await resolveTradeContext(params, curve, snapshot);
  const useWalletPercentage = params.useWalletPercentage ?? false;
  const mintAddress = toAddress(params.mint);
  let tokenAmountRaw: bigint;

  if (params.amountIn !== undefined) {
    if (params.tokenAmount !== undefined || useWalletPercentage) throw new Error("Do not mix raw, decimal, and percentage amounts");
    if (typeof params.amountIn !== "bigint" || params.amountIn <= 0n) throw new Error("amountIn must be a positive bigint");
    tokenAmountRaw = params.amountIn;
  } else if (useWalletPercentage) {
    const percentage = params.walletPercentage ?? 100;
    const scaled = percentageToScaled(percentage);

    const [associatedUser] = await findAssociatedTokenPda({
      owner: toAddress(params.user.address),
      mint: mintAddress,
      tokenProgram: tradeContext.baseTokenProgram,
    });

    const balanceResponse = await rpcClient.getTokenAccountBalance(associatedUser, { commitment }).send();
    const rawBalance = BigInt(balanceResponse.value.amount);
    if (rawBalance === 0n) {
      throw new Error("Wallet token balance is zero; nothing to sell");
    }

    tokenAmountRaw = (rawBalance * scaled) / BigInt(PERCENTAGE_SCALE);
    if (tokenAmountRaw <= 0n) {
      throw new Error("Percentage sell rounds to zero token units");
    }
  } else {
    if (params.tokenAmount === undefined) {
      throw new Error("tokenAmount is required when useWalletPercentage is false");
    }
    const decimals = params.tokenDecimals ?? snapshot.baseMint?.decimals ?? 6;
    tokenAmountRaw = positiveAmountToRaw(params.tokenAmount, decimals, "tokenAmount");
  }

  const quote = quoteSellForTokenAmount(curve, fees, tokenAmountRaw);
  const minSolOutputLamports = params.minAmountOut ?? subSlippage(quote.solOutputLamports, slippageBps);

  if (minSolOutputLamports <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  const instruction = await sellV2({
    user: params.user,
    mint: params.mint,
    tokenAmountRaw,
    minQuoteOutputRaw: minSolOutputLamports,
    ...tradeContext,
    bondingCurveCreator: creator,
    rpc: rpcClient,
  });
  return { venue: "curve", contextSlot, instructions: [instruction],
    quote: { kind: "exactIn", amountIn: tokenAmountRaw,
      expectedAmountOut: quote.solOutputLamports, minAmountOut: minSolOutputLamports } };

}


