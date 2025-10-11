/**
 * Deterministic bonding curve math helpers shared across buy/sell flows.
 * Implements the same constant-product math used by the on-chain program,
 * accounting for flat protocol + creator fees expressed in basis points.
 */

import type { BondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import type { Fees } from "../pumpsdk/generated/types/fees";

const BPS_DENOMINATOR = 10_000n;

export type BondingCurveState = Pick<
  BondingCurve,
  "virtualTokenReserves" | "virtualSolReserves" | "realTokenReserves" | "realSolReserves" | "creator"
>;

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

const mulDivFloor = (value: bigint, numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) {
    throw new Error("Division by zero (floor)");
  }
  return (value * numerator) / denominator;
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
  const lp = BigInt(fees.lpFeeBps);
  const protocol = BigInt(fees.protocolFeeBps);
  const creator = BigInt(fees.creatorFeeBps);
  const combined = lp + protocol;
  const total = combined + creator;
  if (total >= BPS_DENOMINATOR) {
    throw new Error("Total fee basis points must be less than 10_000");
  }
  return { totalFeeBps: total, combinedFeeBps: combined };
};

const computeInvariant = (state: BondingCurveState): bigint => {
  const tokenReserve = state.virtualTokenReserves + state.realTokenReserves;
  const solReserve = state.virtualSolReserves + state.realSolReserves;
  return tokenReserve * solReserve;
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

  const { combinedFeeBps, totalFeeBps } = sumFees(fees);

  const feeLamports = mulDivFloor(totalSolCostLamports, combinedFeeBps, BPS_DENOMINATOR);
  const creatorFeeLamports = mulDivFloor(
    totalSolCostLamports,
    BigInt(fees.creatorFeeBps),
    BPS_DENOMINATOR
  );

  const effectiveSolInLamports =
    totalSolCostLamports - feeLamports - creatorFeeLamports;

  if (effectiveSolInLamports <= 0n) {
    throw new Error("Net SOL after fees must be positive");
  }

  const invariant = computeInvariant(state);
  const startingSolReserve = state.virtualSolReserves + state.realSolReserves;
  const startingTokenReserve = state.virtualTokenReserves + state.realTokenReserves;

  const endingSolReserve = startingSolReserve + effectiveSolInLamports;
  const endingTokenReserve = invariant / endingSolReserve;
  const rawTokensOut = startingTokenReserve - endingTokenReserve;
  let tokenAmount = rawTokensOut > state.realTokenReserves
    ? state.realTokenReserves
    : rawTokensOut;

  if (tokenAmount <= 0n) {
    throw new Error("SOL amount is too small to purchase any tokens");
  }

  let resolvedQuote = quoteSolCostForBuy(state, fees, tokenAmount);

  while (
    resolvedQuote.totalSolCostLamports > totalSolCostLamports &&
    tokenAmount > 0n
  ) {
    tokenAmount -= 1n;
    resolvedQuote = quoteSolCostForBuy(state, fees, tokenAmount);
  }

  if (resolvedQuote.totalSolCostLamports > totalSolCostLamports) {
    throw new Error("Insufficient SOL to purchase any tokens with fees applied");
  }

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

  const { combinedFeeBps, totalFeeBps } = sumFees(fees);
  const invariant = computeInvariant(state);
  const startingSolReserve = state.virtualSolReserves + state.realSolReserves;
  const startingTokenReserve = state.virtualTokenReserves + state.realTokenReserves;

  const endingTokenReserve = startingTokenReserve - tokenAmount;
  if (endingTokenReserve <= 0n) {
    throw new Error("Purchase would exhaust token reserves");
  }

  const endingSolReserve = invariant / endingTokenReserve;
  const effectiveSolInLamports = endingSolReserve - startingSolReserve;
  if (effectiveSolInLamports <= 0n) {
    throw new Error("Resolved SOL input must be positive");
  }

  const netBps = BPS_DENOMINATOR - totalFeeBps;
  const totalSolCostLamports = mulDivCeil(
    effectiveSolInLamports,
    BPS_DENOMINATOR,
    netBps
  );

  const feeLamports = mulDivFloor(totalSolCostLamports, combinedFeeBps, BPS_DENOMINATOR);
  const creatorFeeLamports = mulDivFloor(
    totalSolCostLamports,
    BigInt(fees.creatorFeeBps),
    BPS_DENOMINATOR
  );

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

  const invariant = computeInvariant(state);
  const startingSolReserve = state.virtualSolReserves + state.realSolReserves;
  const startingTokenReserve = state.virtualTokenReserves + state.realTokenReserves;
  const endingTokenReserve = startingTokenReserve + tokenAmount;

  const endingSolReserve = invariant / endingTokenReserve;
  const preFeeSolOutputLamports = startingSolReserve - endingSolReserve;
  if (preFeeSolOutputLamports <= 0n) {
    throw new Error("No SOL output available for the given token amount");
  }

  const { combinedFeeBps } = sumFees(fees);
  const feeLamports = mulDivFloor(
    preFeeSolOutputLamports,
    combinedFeeBps,
    BPS_DENOMINATOR
  );
  const creatorFeeLamports = mulDivFloor(
    preFeeSolOutputLamports,
    BigInt(fees.creatorFeeBps),
    BPS_DENOMINATOR
  );

  const solOutputLamports =
    preFeeSolOutputLamports - feeLamports - creatorFeeLamports;

  if (solOutputLamports <= 0n) {
    throw new Error("SOL output after fees is non-positive");
  }

  return {
    solOutputLamports,
    preFeeSolOutputLamports,
    feeLamports,
    creatorFeeLamports,
  };
}

export { BPS_DENOMINATOR };
