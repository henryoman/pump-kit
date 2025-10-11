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
  virtualSolReserves: 4_000_000_000n,
  realTokenReserves: 20_000_000_000n,
  realSolReserves: 800_000_000n,
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
