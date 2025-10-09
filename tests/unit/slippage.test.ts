/**
 * Unit tests for slippage utilities.
 * These tests don't require network access.
 */

import { describe, test, expect } from "bun:test";
import {
  addSlippage,
  subSlippage,
  validateSlippage,
  percentToBps,
  bpsToPercent,
  DEFAULT_SLIPPAGE_BPS,
} from "../../src/utils/slippage";

describe("Slippage Utilities", () => {
  describe("percentToBps", () => {
    test("converts percent to basis points correctly", () => {
      expect(percentToBps(0.5)).toBe(50);
      expect(percentToBps(1)).toBe(100);
      expect(percentToBps(10)).toBe(1000);
      expect(percentToBps(0.01)).toBe(1);
    });
  });

  describe("bpsToPercent", () => {
    test("converts basis points to percent correctly", () => {
      expect(bpsToPercent(50)).toBe(0.5);
      expect(bpsToPercent(100)).toBe(1);
      expect(bpsToPercent(1000)).toBe(10);
      expect(bpsToPercent(1)).toBe(0.01);
    });
  });

  describe("addSlippage", () => {
    test("adds slippage correctly for max input", () => {
      const amount = 1_000_000n;
      const result = addSlippage(amount, 50); // 0.5%
      expect(result).toBe(1_005_000n);
    });

    test("adds slippage for larger amounts", () => {
      const amount = 100_000_000n;
      const result = addSlippage(amount, 100); // 1%
      expect(result).toBe(101_000_000n);
    });

    test("handles zero slippage", () => {
      const amount = 1_000_000n;
      const result = addSlippage(amount, 0);
      expect(result).toBe(amount);
    });
  });

  describe("subSlippage", () => {
    test("subtracts slippage correctly for min output", () => {
      const amount = 1_000_000n;
      const result = subSlippage(amount, 50); // 0.5%
      expect(result).toBe(995_000n);
    });

    test("subtracts slippage for larger amounts", () => {
      const amount = 100_000_000n;
      const result = subSlippage(amount, 100); // 1%
      expect(result).toBe(99_000_000n);
    });

    test("handles zero slippage", () => {
      const amount = 1_000_000n;
      const result = subSlippage(amount, 0);
      expect(result).toBe(amount);
    });
  });

  describe("validateSlippage", () => {
    test("accepts valid slippage values", () => {
      expect(() => validateSlippage(0)).not.toThrow();
      expect(() => validateSlippage(50)).not.toThrow();
      expect(() => validateSlippage(100)).not.toThrow();
      expect(() => validateSlippage(1000)).not.toThrow();
      expect(() => validateSlippage(10000)).not.toThrow();
    });

    test("rejects negative slippage", () => {
      expect(() => validateSlippage(-1)).toThrow();
      expect(() => validateSlippage(-100)).toThrow();
    });

    test("rejects slippage over 100%", () => {
      expect(() => validateSlippage(10001)).toThrow();
      expect(() => validateSlippage(20000)).toThrow();
    });
  });

  describe("DEFAULT_SLIPPAGE_BPS", () => {
    test("is set to 50 bps (0.5%)", () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBe(50);
    });
  });
});

