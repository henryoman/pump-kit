import { expect, test } from "bun:test";
import { decimalToRaw, solToLamports, tokensToRaw, positiveAmountToRaw } from "../../src/utils/amounts";

test("parses decimal strings without floating point loss", () => {
  expect(solToLamports("0.000000001")).toBe(1n);
  expect(solToLamports("9007199254740993.123456789")).toBe(9007199254740993123456789n);
  expect(tokensToRaw("1.2300000", 6)).toBe(1230000n);
  expect(decimalToRaw("0", 0)).toBe(0n);
});

test("trade amounts preserve exact u64 boundaries and reject overflow or zero", () => {
  expect(positiveAmountToRaw("18446744073.709551615", 9, "solAmount")).toBe(18446744073709551615n);
  expect(positiveAmountToRaw("9007199254.740993", 6, "tokenAmount")).toBe(9007199254740993n);
  for (const value of ["0", "18446744073.709551616", "0.0000000001"]) {
    expect(() => positiveAmountToRaw(value, 9, "solAmount")).toThrow();
  }
});

test("rejects invalid strings, precision and unsafe numeric amounts", () => {
  for (const value of ["-1", "NaN", "1e3", " 1", ".1", "1.", "0.0000000001"]) {
    expect(() => solToLamports(value)).toThrow();
  }
  for (const value of [NaN, Infinity, -1, 1e20]) {
    expect(() => solToLamports(value)).toThrow();
    expect(() => tokensToRaw(value, 6)).toThrow();
  }
  for (const decimals of [-1, 1.5, NaN, Infinity, 256]) {
    expect(() => decimalToRaw("1", decimals)).toThrow();
  }
});
