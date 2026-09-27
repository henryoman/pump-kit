import { expect, test } from "bun:test";
import { address, generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import { curveBuy } from "../../src/swap/curve";
import { loadCurveSnapshot, loadAmmSnapshot } from "../../src/swap/snapshot";
import { getBondingCurveEncoder } from "../../src/pumpsdk/generated/accounts/bondingCurve";
import { getFeeConfigEncoder } from "../../src/pumpsdk/generated/accounts/feeConfig";
import { GLOBAL_DISCRIMINATOR } from "../../src/pumpsdk/generated/accounts/global";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, FEE_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

const mint = address("So11111111111111111111111111111111111111112");
test("curve snapshots retain one RPC context slot and resolve each mint owner", async () => {
  const curve = getBondingCurveEncoder().encode({ virtualTokenReserves: 1000000n, virtualQuoteReserves: 1000n,
    realTokenReserves: 500000n, realQuoteReserves: 0n, tokenTotalSupply: 1000000n,
    creator: mint, complete: false, isMayhemMode: false, isCashbackCoin: false,
    quoteMint: address("11111111111111111111111111111111"), creatorFeeBps: 0n,
    canEditCreatorFee: false, isHolderReward: false });
  const global = Buffer.alloc(5000);
  global.set(GLOBAL_DISCRIMINATOR);
  const fees = { lpFeeBps: 0n, protocolFeeBps: 75n, creatorFeeBps: 25n };
  const config = getFeeConfigEncoder().encode({ bump: 0, admin: mint, flatFees: fees,
    feeTiers: [{ marketCapLamportsThreshold: 0n, fees }], stableFeeTiers: [], exoticFlatFees: fees });
  const base = Buffer.alloc(82); base[44] = 6; base[45] = 1;
  const quote = Buffer.alloc(82); quote[44] = 9; quote[45] = 1;
  const values = [curve, global, config, base, quote];
  const owners = [PUMP_PROGRAM_ID, PUMP_PROGRAM_ID, FEE_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID];
  let reads = 0;
  const rpc = { getMultipleAccounts: (addresses: string[]) => {
    reads++;
    expect(addresses).toHaveLength(5);
    return { send: async () => ({ context: { slot: 456n }, value: values.map((data, i) => ({
      owner: owners[i], data: [Buffer.from(data).toString("base64"), "base64"],
    })) }) };
  } } as any;
  const result = await loadCurveSnapshot({ rpc, mint, commitment: "confirmed" });
  expect(reads).toBe(1);
  expect(result.contextSlot).toBe(456n);
  expect(result.baseMint.tokenProgram).toBe(address(TOKEN_2022_PROGRAM_ID));
  expect(result.baseMint.decimals).toBe(6);
  expect(result.quoteMint.decimals).toBe(9);
  expect(result.fees).toEqual(fees);
  const user = await generateKeyPairSigner();
  const plan = await curveBuy({ user, mint, rpc, amountIn: 100n,
    feeRecipient: user.address, buybackFeeRecipient: user.address });
  expect(reads).toBe(2);
  expect(plan.contextSlot).toBe(456n);
  expect(plan.instructions.at(-1)!.accounts![3].address).toBe(address(TOKEN_2022_PROGRAM_ID));
  owners[0] = TOKEN_PROGRAM_ID;
  await expect(loadCurveSnapshot({ rpc, mint, commitment: "confirmed" })).rejects.toThrow("owner");
});


test("AMM snapshots refresh all quote state at one slot and validate retained vaults", async () => {
  const { getPoolEncoder } = await import("../../src/ammsdk/generated/accounts/pool");
  const { GLOBAL_CONFIG_DISCRIMINATOR } = await import("../../src/ammsdk/generated/accounts/globalConfig");
  const poolAddress = address("11111111111111111111111111111111");
  const quoteMint = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const baseVault = address(TOKEN_PROGRAM_ID);
  const quoteVault = address(TOKEN_2022_PROGRAM_ID);
  const context = { poolAddress, baseMint: mint, quoteMint, baseVault, quoteVault };
  const pool = getPoolEncoder().encode({ poolBump: 0, index: 0, creator: quoteMint,
    baseMint: mint, quoteMint, lpMint: mint, poolBaseTokenAccount: baseVault,
    poolQuoteTokenAccount: quoteVault, lpSupply: 100n, coinCreator: quoteMint,
    isMayhemMode: false, isCashbackCoin: false, virtualQuoteReserves: 300n,
    creatorFeeBps: 0n, canEditCreatorFee: false, isHolderReward: false });
  const global = Buffer.alloc(5000); global.set(GLOBAL_CONFIG_DISCRIMINATOR);
  const fees = { lpFeeBps: 20n, protocolFeeBps: 5n, creatorFeeBps: 5n };
  const config = getFeeConfigEncoder().encode({ bump: 0, admin: mint, flatFees: fees,
    feeTiers: [], stableFeeTiers: [], exoticFlatFees: fees });
  const base = Buffer.alloc(82); base[44] = 7; base[45] = 1;
  const quote = Buffer.alloc(82); quote[44] = 6; quote[45] = 1;
  const vault = (tokenMint: typeof mint, amount: bigint) => {
    const data = Buffer.alloc(165);
    data.set(getAddressEncoder().encode(tokenMint));
    data.set(getAddressEncoder().encode(poolAddress), 32);
    data.writeBigUInt64LE(amount, 64); data[108] = 1;
    return data;
  };
  const values = [pool, global, config, base, quote, vault(mint, 1000n), vault(quoteMint, 2000n)];
  const owners = [PUMP_AMM_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, FEE_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID];
  let reads = 0;
  const rpc = { getMultipleAccounts: (addresses: string[], options: any) => {
    reads++;
    expect(addresses).toHaveLength(7);
    expect(addresses.slice(3)).toEqual([mint, quoteMint, baseVault, quoteVault]);
    expect(options).toEqual({ encoding: "base64", commitment: "confirmed" });
    return { send: async () => ({ context: { slot: BigInt(500 + reads) }, value: values.map((data, i) => ({
      owner: owners[i], data: [Buffer.from(data).toString("base64"), "base64"],
    })) }) };
  } } as any;
  const first = await loadAmmSnapshot({ rpc, context, commitment: "confirmed" });
  expect(first.contextSlot).toBe(501n);
  expect(first.baseReserve).toBe(1000n);
  expect(first.realQuoteReserve).toBe(2000n);
  expect(first.quoteReserve).toBe(2300n);
  expect(first.baseMint.decimals).toBe(7);
  expect(first.quoteMint.decimals).toBe(6);
  expect(first.fees).toEqual(fees);
  values[6] = vault(quoteMint, 4000n);
  const refreshed = await loadAmmSnapshot({ rpc, context, commitment: "confirmed" });
  expect(refreshed.contextSlot).toBe(502n);
  expect(refreshed.quoteReserve).toBe(4300n);
  owners[5] = TOKEN_PROGRAM_ID;
  await expect(loadAmmSnapshot({ rpc, context, commitment: "confirmed" })).rejects.toThrow("owner");
  owners[5] = TOKEN_2022_PROGRAM_ID;
  values[5] = vault(quoteMint, 1000n);
  await expect(loadAmmSnapshot({ rpc, context, commitment: "confirmed" })).rejects.toThrow("mint or pool authority");
  values[5] = vault(mint, 1000n);
  values[0] = Buffer.from(pool); values[0][0] ^= 1;
  await expect(loadAmmSnapshot({ rpc, context, commitment: "confirmed" })).rejects.toThrow("discriminator");
});
