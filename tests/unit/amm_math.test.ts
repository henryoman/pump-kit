import { expect, test } from "bun:test";
import { quoteAmmBuyCost, quoteAmmBuyBudget, quoteAmmSell } from "../../src/ammsdk/amm_math";
import { selectFeeSchedule } from "../../src/ammsdk/fee_schedule";
import type { FeeConfig } from "../../src/ammsdk/generated/accounts/feeConfig";

const fees = { lpFeeBps: 75n, protocolFeeBps: 75n, creatorFeeBps: 25n };
test("AMM quotes use quote-denominated fees with independent upward rounding", () => {
  expect(quoteAmmBuyCost(100n, 1000n, 100n, fees)).toBe(15n);
  expect(quoteAmmBuyBudget(15n, 1000n, 100n, fees)).toEqual({ tokenAmountOut: 99n, quoteRequired: 14n });
  expect(quoteAmmBuyCost(108n, 1000n, 100n, fees)).toBe(16n);
  expect(quoteAmmSell(100n, 1000n, 100n, 100n, fees)).toBe(6n);
  expect(quoteAmmSell(2000n, 1000n, 100n, 100n, fees)).toBe(63n);
});
test("AMM quotes reject insufficient budgets and virtual liquidity that cannot be paid out", () => {
  expect(() => quoteAmmBuyBudget(3n, 1000n, 100n, fees)).toThrow();
  expect(() => quoteAmmSell(100n, 1000n, 200n, 10n, fees)).toThrow("real quote liquidity");
  expect(() => quoteAmmBuyCost(1000n, 1000n, 100n, fees)).toThrow();
  expect(() => quoteAmmBuyBudget(15n, 1000n, 100n, { ...fees, creatorFeeBps: -1n })).toThrow();
});
test("fee schedules distinguish canonical SOL, stable, exotic and ordinary pools", () => {
  const high = { ...fees, creatorFeeBps: 50n };
  const stable = { ...fees, protocolFeeBps: 10n };
  const exotic = { ...fees, protocolFeeBps: 20n };
  const config = { flatFees: fees, feeTiers: [{ marketCapLamportsThreshold: 100n, fees }, { marketCapLamportsThreshold: 200n, fees: high }],
    stableFeeTiers: [{ marketCapLamportsThreshold: 0n, fees: stable }], exoticFlatFees: exotic } as FeeConfig;
  const sol = "So11111111111111111111111111111111111111112";
  expect(selectFeeSchedule(config, true, sol, 0n)).toEqual(fees);
  expect(selectFeeSchedule(config, true, sol, 199n)).toEqual(fees);
  expect(selectFeeSchedule(config, true, sol, 200n)).toEqual(high);
  expect(selectFeeSchedule(config, true, sol, 201n)).toEqual(high);
  expect(selectFeeSchedule(config, false, sol, 200n)).toEqual(fees);
  expect(selectFeeSchedule(config, true, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 200n)).toEqual(stable);
  expect(selectFeeSchedule(config, true, "other", 200n)).toEqual(exotic);
  expect(selectFeeSchedule({ ...config, exoticFlatFees: { lpFeeBps: 0n, protocolFeeBps: 0n, creatorFeeBps: 0n } }, true, "other", 200n)).toEqual(fees);
});
