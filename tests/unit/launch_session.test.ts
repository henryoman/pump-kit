import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { mintWithFirstBuy } from "../../src/recipes/mintFirstBuy";
import { createPump, type LaunchRecord } from "../../src/launch/session";
import { getGlobalEncoder, type GlobalArgs } from "../../src/pumpsdk/generated/accounts/global";
import { getFeeConfigEncoder } from "../../src/pumpsdk/generated/accounts/feeConfig";
import { getBuyExactQuoteInV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyExactQuoteInV2";
import { globalPda, feeConfigPda } from "../../src/pda/pump";
import { PUMP_PROGRAM_ID, FEE_PROGRAM_ID } from "../../src/config/addresses";

const key = address("So11111111111111111111111111111111111111112");
const config = { schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" } };
const global: GlobalArgs = {
  initialized: true, authority: key, feeRecipient: key, initialVirtualTokenReserves: 1073000000000000n,
  initialVirtualSolReserves: 30000000000n, initialRealTokenReserves: 793100000000000n,
  tokenTotalSupply: 1000000000000000n, feeBasisPoints: 100n, withdrawAuthority: key,
  enableMigrate: true, poolMigrationFee: 0n, creatorFeeBasisPoints: 50n,
  feeRecipients: Array(7).fill(key), setCreatorAuthority: key, adminSetCreatorAuthority: key,
  createV2Enabled: true, whitelistPda: key, reservedFeeRecipient: key, mayhemModeEnabled: true,
  reservedFeeRecipients: Array(7).fill(key), isCashbackEnabled: false, buybackFeeRecipients: Array(8).fill(key),
  buybackBasisPoints: 0n, initialVirtualQuoteReserves: 0n, whitelistedQuoteMints: Array(1).fill(key),
  creatorFeeConfigurable: false, maxConfigurableCreatorFeeBps: 100n, holderRewardClaimAuthority: key,
  isHolderRewardEnabled: true,
};

async function fixture() {
  const accounts = new Map([
    [await globalPda(), { data: [Buffer.from(getGlobalEncoder().encode(global)).toString("base64"), "base64"], owner: PUMP_PROGRAM_ID }],
    [await feeConfigPda(), { data: [Buffer.from(getFeeConfigEncoder().encode({ bump: 1, admin: key,
      flatFees: { lpFeeBps: 0n, protocolFeeBps: 100n, creatorFeeBps: 50n },
      feeTiers: [{ marketCapLamportsThreshold: 0n, fees: { lpFeeBps: 0n, protocolFeeBps: 100n, creatorFeeBps: 50n } }],
      stableFeeTiers: [], exoticFlatFees: { lpFeeBps: 0n, protocolFeeBps: 0n, creatorFeeBps: 0n },
    })).toString("base64"), "base64"], owner: FEE_PROGRAM_ID }],
  ]);
  let simulations = 0;
  const rpc = {
    getAccountInfo: (key: string) => ({ send: async () => ({ context: { slot: 1n }, value: accounts.get(address(key)) }) }),
    getLatestBlockhash: () => ({ send: async () => ({ value: { blockhash: key, lastValidBlockHeight: 100n } }) }),
    simulateTransaction: () => ({ send: async () => { simulations++; return { context: { slot: 1n }, value: { err: null, logs: [], unitsConsumed: 100n } }; } }),
  } as any;
  return { rpc, pump: createPump({ rpc, rpcSubscriptions: {} as any }), get simulations() { return simulations; } };
}

test("prepares and signs create-only and atomic first-buy sessions", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  const createOnly = await f.pump.launch.prepare(config, { signer });
  expect(createOnly.instructions).toHaveLength(1);
  expect(createOnly.preview.firstBuy).toBeUndefined();
  const records: LaunchRecord[] = [];
  const lookupTables: Record<string, readonly any[]> = {};
  const launch = await f.pump.launch.prepare({ ...config, firstBuy: { amount: "0.25", slippageBps: 100 } }, { signer, addressLookupTables: lookupTables, saveRecord: async r => { records.push(r); } });
  expect(launch.instructions).toHaveLength(3);
  expect(launch.addresses.mint).not.toBe(createOnly.addresses.mint);
  const decoded = getBuyExactQuoteInV2InstructionDataDecoder().decode(launch.instructions[2]!.data!);
  expect(decoded.spendableQuoteIn).toBe(250000000n);
  expect(decoded.minTokensOut).toBe(launch.preview.firstBuy?.minTokenOutputRaw);
  expect(decoded.minTokensOut).toBeGreaterThan(0n);
  expect(records[0]?.status).toBe("prepared");
  lookupTables[key] = [...new Set(launch.instructions.flatMap(ix => (ix.accounts ?? []).filter(meta => !(meta.role & 2)).map(meta => meta.address)))];
  expect((await launch.simulate()).value.err).toBeNull();
  expect(f.simulations).toBe(1);
  expect(launch.record.status).toBe("prepared");
});

test("persists signature before broadcast and refuses a second launch after submission uncertainty", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  let saved: LaunchRecord | undefined;
  const launch = await f.pump.launch.prepare(config, { signer, saveRecord: async r => {
    saved = r;
    if (r.status === "submitted") throw new Error("Storage unavailable");
  } });
  await expect(launch.send()).rejects.toThrow("Storage unavailable");
  expect(saved?.mint).toBe(launch.addresses.mint);
  expect(saved?.signature).toBeDefined();
  expect(saved?.lastValidBlockHeight).toBe("100");
  await expect(launch.send()).rejects.toThrow("already submitted");
});


test("launch convenience recipe uses budget mode and returns every required instruction", async () => {
  const f = await fixture();
  const user = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const params = { user, mint, rpc: f.rpc, name: "Example", symbol: "EX", uri: "ipfs://example", firstBuyAmountSol: "0.25" };
  const result = await mintWithFirstBuy(params);
  expect(result.instructions).toHaveLength(3);
  expect(result.createInstruction).toBe(result.instructions[0]);
  expect(result.buyInstruction).toBe(result.instructions[2]);
  expect(getBuyExactQuoteInV2InstructionDataDecoder().decode(result.buyInstruction.data!).spendableQuoteIn).toBe(250000000n);
  await expect(mintWithFirstBuy({ ...params, firstBuyTokenAmount: 100n })).rejects.toThrow("mix budget");
  await expect(mintWithFirstBuy({ ...params, mintAuthority: user.address })).rejects.toThrow("program-derived");
});
