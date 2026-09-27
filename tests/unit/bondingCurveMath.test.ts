import { describe, test, expect } from "bun:test";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  quoteSolCostForBuy,
  type BondingCurveState,
  type FeeStructure,
} from "../../src/ammsdk/bondingCurveMath";

const curveState: BondingCurveState = {
  virtualTokenReserves: 40_000_000_000n,
  virtualQuoteReserves: 4_000_000_000n,
  realTokenReserves: 20_000_000_000n,
  realQuoteReserves: 800_000_000n,
  creator: "11111111111111111111111111111111",
};

const fees: FeeStructure = {
  lpFeeBps: 30n,
  protocolFeeBps: 20n,
  creatorFeeBps: 50n,
};

describe("Bonding curve math helpers", () => {
  test("quoteBuyWithSolAmount returns positive token amount", () => {
    const solBudget = 1_500_000n;
    const quote = quoteBuyWithSolAmount(curveState, fees, solBudget);

    expect(quote.tokenAmount).toBeGreaterThan(0n);
    expect(quote.totalSolCostLamports).toBeGreaterThan(0n);
    expect(quote.totalSolCostLamports).toBeLessThanOrEqual(solBudget);
  });

  test("quoteSolCostForBuy aligns with buy quote output", () => {
    const solBudget = 2_000_000n;
    const buyQuote = quoteBuyWithSolAmount(curveState, fees, solBudget);
    const costQuote = quoteSolCostForBuy(curveState, fees, buyQuote.tokenAmount);

    expect(costQuote.totalSolCostLamports).toBeGreaterThan(0n);
    expect(costQuote.totalSolCostLamports).toBeLessThanOrEqual(solBudget);
    expect(costQuote.tokenAmount).toBe(buyQuote.tokenAmount);
  });

  test("quoteSellForTokenAmount returns positive SOL output", () => {
    const sellQuote = quoteSellForTokenAmount(curveState, fees, 1_000_000n);
    expect(sellQuote.solOutputLamports).toBeGreaterThan(0n);
    expect(sellQuote.solOutputLamports).toBeLessThan(sellQuote.preFeeSolOutputLamports);
  });
});

test("uses virtual reserves alone and rounds protocol and creator fees up separately", () => {
  const state: BondingCurveState = { ...curveState, virtualTokenReserves: 1000n,
    virtualQuoteReserves: 100n, realTokenReserves: 500n, realQuoteReserves: 999999n };
  const rates = { lpFeeBps: 9999n, protocolFeeBps: 100n, creatorFeeBps: 50n };
  const buy = quoteSolCostForBuy(state, rates, 100n);
  expect(buy.effectiveSolInLamports).toBe(12n);
  expect(buy.feeLamports).toBe(1n);
  expect(buy.creatorFeeLamports).toBe(1n);
  expect(buy.totalSolCostLamports).toBe(14n);
  expect(quoteBuyWithSolAmount(state, rates, 14n).tokenAmount).toBe(107n);
  expect(quoteSellForTokenAmount(state, rates, 100n).solOutputLamports).toBe(7n);
  expect(() => quoteBuyWithSolAmount(state, rates, 1n)).toThrow();
  expect(() => quoteSolCostForBuy(state, { ...rates, creatorFeeBps: -1n }, 1n)).toThrow();
});


test("curve quotes enforce real liquidity without adding it to pricing reserves", () => {
  expect(() => quoteSolCostForBuy(curveState, fees, curveState.realTokenReserves + 1n)).toThrow("available reserves");
  expect(() => quoteSellForTokenAmount({ ...curveState, realQuoteReserves: 0n }, fees, 1000000n)).toThrow("real quote liquidity");
});
