/**
 * Deterministic bonding curve math helpers shared across buy/sell flows.
 * Implements the same constant-product math used by the on-chain program,
 * accounting for resolved protocol + creator fees expressed in basis points.
 */

import type { BondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import type { Fees } from "../pumpsdk/generated/types/fees";

const BPS_DENOMINATOR = 10_000n;

export type BondingCurveState = Pick<
  BondingCurve,
  | "virtualTokenReserves"
  | "virtualQuoteReserves"
  | "realTokenReserves"
  | "realQuoteReserves"
  | "creator"
  | "complete"
> & Partial<Pick<BondingCurve, "quoteMint" | "isMayhemMode" | "creatorFeeBps" | "tokenTotalSupply">>;

export type FeeStructure = Pick<Fees, "lpFeeBps" | "protocolFeeBps" | "creatorFeeBps">;

export type BuyQuote = {
  tokenAmount: bigint;
  /** Total SOL cost including protocol + creator fees */
  totalSolCostLamports: bigint;
  /** Net SOL that actually hits the bonding curve reserves */
  effectiveSolInLamports: bigint;
  feeLamports: bigint;
  creatorFeeLamports: bigint;
};

export type SellQuote = {
  /** Net SOL the curve returns after subtracting protocol + creator fees */
  solOutputLamports: bigint;
  /** SOL output before extracting protocol + creator fees */
  preFeeSolOutputLamports: bigint;
  feeLamports: bigint;
  creatorFeeLamports: bigint;
};

const mulDivCeil = (value: bigint, numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) {
    throw new Error("Division by zero (ceil)");
  }
  const dividend = value * numerator;
  const quotient = dividend / denominator;
  return dividend % denominator === 0n ? quotient : quotient + 1n;
};

const sumFees = (fees: FeeStructure): { totalFeeBps: bigint; combinedFeeBps: bigint } => {
  const protocol = BigInt(fees.protocolFeeBps);
  const creator = BigInt(fees.creatorFeeBps);
  if (protocol < 0n || creator < 0n || protocol + creator >= BPS_DENOMINATOR) {
    throw new Error("Curve fees must be non-negative and total less than 10_000 bps");
  }
  // Bonding curves charge protocol and creator fees; LP fees apply only to AMM pools.
  return { totalFeeBps: protocol + creator, combinedFeeBps: protocol };
};

const validateReserves = (state: BondingCurveState): void => {
  if (state.virtualTokenReserves <= 0n || state.virtualQuoteReserves <= 0n || state.realTokenReserves < 0n || state.realQuoteReserves < 0n) {
    throw new Error("Invalid bonding curve reserves");
  }
};

/**
 * Quote how many tokens can be purchased with a given total SOL cost (before slippage),
 * returning the derived token amount alongside the fee breakdown.
 */
export function quoteBuyWithSolAmount(
  state: BondingCurveState,
  fees: FeeStructure,
  totalSolCostLamports: bigint
): BuyQuote {
  if (totalSolCostLamports <= 0n) {
    throw new Error("Total SOL cost must be positive");
  }

  validateReserves(state);
  const { totalFeeBps } = sumFees(fees);
  const input = ((totalSolCostLamports - 1n) * BPS_DENOMINATOR) / (BPS_DENOMINATOR + totalFeeBps);
  const rawTokens = (input * state.virtualTokenReserves) / (state.virtualQuoteReserves + input);
  let tokenAmount = rawTokens < state.realTokenReserves ? rawTokens : state.realTokenReserves;
  if (tokenAmount <= 0n) throw new Error("SOL amount is too small to purchase any tokens");
  // Separate fee ceilings may need a further unit of headroom. Binary search
  // preserves the hard budget without walking token units one at a time.
  let low = 0n;
  let high = tokenAmount;
  while (low < high) {
    const middle = (low + high + 1n) / 2n;
    if (quoteSolCostForBuy(state, fees, middle).totalSolCostLamports <= totalSolCostLamports) low = middle;
    else high = middle - 1n;
  }
  tokenAmount = low;
  if (tokenAmount <= 0n) throw new Error("Insufficient SOL to purchase any tokens with fees applied");
  const resolvedQuote = quoteSolCostForBuy(state, fees, tokenAmount);

  return {
    tokenAmount,
    totalSolCostLamports: resolvedQuote.totalSolCostLamports,
    effectiveSolInLamports: resolvedQuote.effectiveSolInLamports,
    feeLamports: resolvedQuote.feeLamports,
    creatorFeeLamports: resolvedQuote.creatorFeeLamports,
  };
}

/**
 * Inverse of `quoteBuyWithSolAmount`: given an exact token amount, compute the SOL budget required.
 */
export function quoteSolCostForBuy(
  state: BondingCurveState,
  fees: FeeStructure,
  tokenAmount: bigint
): BuyQuote {
  if (tokenAmount <= 0n) {
    throw new Error("Token amount must be positive");
  }
  if (tokenAmount > state.realTokenReserves) {
    throw new Error("Token amount exceeds available reserves");
  }

  validateReserves(state);
  const { combinedFeeBps } = sumFees(fees);
  if (tokenAmount >= state.virtualTokenReserves) throw new Error("Purchase would exhaust virtual reserves");
  const effectiveSolInLamports = (tokenAmount * state.virtualQuoteReserves) / (state.virtualTokenReserves - tokenAmount) + 1n;
  const feeLamports = mulDivCeil(effectiveSolInLamports, combinedFeeBps, BPS_DENOMINATOR);
  const creatorFeeLamports = mulDivCeil(effectiveSolInLamports, BigInt(fees.creatorFeeBps), BPS_DENOMINATOR);
  const totalSolCostLamports = effectiveSolInLamports + feeLamports + creatorFeeLamports;

  return {
    tokenAmount,
    totalSolCostLamports,
    effectiveSolInLamports,
    feeLamports,
    creatorFeeLamports,
  };
}

/**
 * Quote how much SOL will be returned for selling a given token amount.
 */
export function quoteSellForTokenAmount(
  state: BondingCurveState,
  fees: FeeStructure,
  tokenAmount: bigint
): SellQuote {
  if (tokenAmount <= 0n) {
    throw new Error("Token amount must be positive");
  }

  validateReserves(state);
  const { combinedFeeBps } = sumFees(fees);
  const preFeeSolOutputLamports = (tokenAmount * state.virtualQuoteReserves) / (state.virtualTokenReserves + tokenAmount);
  if (preFeeSolOutputLamports > state.realQuoteReserves) throw new Error("Curve has insufficient real quote liquidity");
  const feeLamports = mulDivCeil(preFeeSolOutputLamports, combinedFeeBps, BPS_DENOMINATOR);
  const creatorFeeLamports = mulDivCeil(preFeeSolOutputLamports, BigInt(fees.creatorFeeBps), BPS_DENOMINATOR);
  const solOutputLamports = preFeeSolOutputLamports - feeLamports - creatorFeeLamports;
  if (solOutputLamports <= 0n) throw new Error("SOL output after fees is non-positive");

  return {
    solOutputLamports,
    preFeeSolOutputLamports,
    feeLamports,
    creatorFeeLamports,
  };
}

export { BPS_DENOMINATOR };
