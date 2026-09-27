import { expect, test } from "bun:test";
import { address, getAddressEncoder } from "@solana/kit";
import { decodeBondingCurve, getBondingCurveDecoder, BONDING_CURVE_DISCRIMINATOR } from "../../src/pumpsdk/generated/accounts/bondingCurve";
import { decodePool, getPoolDecoder, POOL_DISCRIMINATOR } from "../../src/ammsdk/generated/accounts/pool";

const mint = address("So11111111111111111111111111111111111111112");
const mintBytes = getAddressEncoder().encode(mint);

test("decodes current curve quote reserves and permanent reward fields at their wire offsets", () => {
  const bytes = Buffer.alloc(125);
  bytes.set(BONDING_CURVE_DISCRIMINATOR);
  bytes.writeBigUInt64LE(1073000000000000n, 8);
  bytes.writeBigUInt64LE(30000000000n, 16);
  bytes.writeBigUInt64LE(793100000000000n, 24);
  bytes.writeBigUInt64LE(250000000n, 32);
  bytes.writeBigUInt64LE(1000000000000000n, 40);
  bytes.set(mintBytes, 49);
  bytes.set(mintBytes, 83);
  bytes.writeBigUInt64LE(25n, 115);
  bytes[123] = 1;
  bytes[124] = 1;
  const curve = getBondingCurveDecoder().decode(bytes);
  expect(curve.virtualQuoteReserves).toBe(30000000000n);
  expect(curve.realQuoteReserves).toBe(250000000n);
  expect(curve.quoteMint).toBe(mint);
  expect(curve.creatorFeeBps).toBe(25n);
  expect(curve.canEditCreatorFee).toBe(true);
  expect(curve.isHolderReward).toBe(true);
});

test("decodes PumpSwap virtual quote reserves and reward flags at their wire offsets", () => {
  const bytes = Buffer.alloc(271);
  bytes.set(POOL_DISCRIMINATOR);
  for (const offset of [11, 43, 75, 107, 139, 171, 211]) bytes.set(mintBytes, offset);
  bytes.writeBigUInt64LE(123456n, 245);
  bytes.writeBigUInt64LE(75n, 261);
  bytes[270] = 1;
  const pool = getPoolDecoder().decode(bytes);
  expect(pool.virtualQuoteReserves).toBe(123456n);
  expect(pool.creatorFeeBps).toBe(75n);
  expect(pool.isHolderReward).toBe(true);
});


test("account decoders default whole trailing fields on every historical curve layout", () => {
  for (const size of [49, 81, 82, 83, 115, 123, 124, 125]) {
    const bytes = Buffer.alloc(size);
    bytes.set(BONDING_CURVE_DISCRIMINATOR);
    bytes.writeBigUInt64LE(1000n, 8);
    if (size >= 81) bytes.set(mintBytes, 49);
    if (size >= 83) bytes[82] = 1;
    const result = decodeBondingCurve({ exists: true, address: mint, data: bytes } as any).data;
    expect(result.virtualTokenReserves).toBe(1000n);
    expect(result.creator).toBe(size >= 81 ? mint : address("11111111111111111111111111111111"));
    expect(result.isCashbackCoin).toBe(size >= 83);
    expect(result.creatorFeeBps).toBe(0n);
    expect(result.quoteMint).toBe(address("11111111111111111111111111111111"));
    expect(result.isHolderReward).toBe(false);
  }
});

test("account decoders default whole trailing fields on historical pool layouts", () => {
  for (const size of [211, 243, 244, 245, 261, 269, 270, 271]) {
    const bytes = Buffer.alloc(size);
    bytes.set(POOL_DISCRIMINATOR);
    bytes.set(mintBytes, 43);
    const result = decodePool({ exists: true, address: mint, data: bytes } as any).data;
    expect(result.baseMint).toBe(mint);
    expect(result.virtualQuoteReserves).toBe(0n);
    expect(result.creatorFeeBps).toBe(0n);
    expect(result.isHolderReward).toBe(false);
  }
});

test("compatibility decoding rejects partial fields and wrong discriminators", () => {
  for (const size of [0, 48, 50, 80, 84, 114, 116, 122]) {
    const bytes = Buffer.alloc(size);
    if (size >= 8) bytes.set(BONDING_CURVE_DISCRIMINATOR);
    expect(() => decodeBondingCurve({ exists: true, address: mint, data: bytes } as any)).toThrow();
  }
  expect(() => decodePool({ exists: true, address: mint, data: Buffer.alloc(271) } as any)).toThrow("discriminator");
  const missing = { exists: false, address: mint } as const;
  expect(decodeBondingCurve(missing)).toBe(missing);
});
