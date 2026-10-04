import { expect, test } from "bun:test";
import { address, generateKeyPairSigner, getAddressEncoder, getProgramDerivedAddress, getTransactionDecoder, getCompiledTransactionMessageDecoder } from "@solana/kit";
import { mintWithFirstBuy } from "../../src/recipes/mintFirstBuy";
import { createV2 } from "../../src/clients/create_v2";
import { createAndBuy } from "../../src/helpers/createAndBuy";
import { createPump, type LaunchRecord } from "../../src/launch/session";
import { getGlobalEncoder, type GlobalArgs } from "../../src/pumpsdk/generated/accounts/global";
import { getFeeConfigEncoder } from "../../src/pumpsdk/generated/accounts/feeConfig";
import { getBuyExactQuoteInV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyExactQuoteInV2";
import { globalPda, feeConfigPda, creatorVaultPda } from "../../src/pda/pump";
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

async function fixture(overrides: Partial<GlobalArgs> = {}) {
  const accounts = new Map([
    [await globalPda(), { data: [Buffer.from(getGlobalEncoder().encode({ ...global, ...overrides })).toString("base64"), "base64"], owner: PUMP_PROGRAM_ID }],
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
  const createOnlyMint = await generateKeyPairSigner();
  const createOnly = await f.pump.launch.prepare(config, { signer, mint: createOnlyMint });
  expect(createOnly.addresses.mint).toBe(createOnlyMint.address);
  expect(createOnly.instructions).toHaveLength(1);
  expect(createOnly.preview.firstBuy).toBeUndefined();
  const records: LaunchRecord[] = [];
  const mint = await generateKeyPairSigner();
  const atomicConfig = { ...config, firstBuy: { amount: "0.25", slippageBps: 100 } };
  const preview = await f.pump.launch.prepare(atomicConfig, { signer, mint });
  const lookupTables = { [key]: [...new Set(preview.instructions.flatMap(ix => (ix.accounts ?? []).filter(meta => !(meta.role & 2)).map(meta => meta.address)))] };
  const launch = await f.pump.launch.prepare(atomicConfig, { signer, mint, addressLookupTables: lookupTables, saveRecord: async r => { records.push(r); } });
  expect(launch.instructions).toHaveLength(3);
  expect(launch.addresses.mint).not.toBe(createOnly.addresses.mint);
  const decoded = getBuyExactQuoteInV2InstructionDataDecoder().decode(launch.instructions[2]!.data!);
  expect(decoded.spendableQuoteIn).toBe(250000000n);
  expect(decoded.minTokensOut).toBe(launch.preview.firstBuy?.minTokenOutputRaw);
  expect(decoded.minTokensOut).toBeGreaterThan(0n);
  expect(records[0]?.status).toBe("prepared");
  lookupTables[key].length = 0; // Caller mutations must not alter a prepared transaction.
  expect(launch.addressLookupTables[key]!.length).toBeGreaterThan(0);
  expect((await launch.simulate()).value.err).toBeNull();
  expect(f.simulations).toBe(1);
  expect(launch.record.status).toBe("prepared");
});

test("atomic holder-reward launches use the effective on-chain creator vault in both recipes", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const [holderCreator] = await getProgramDerivedAddress({ programAddress: address(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("holder-rewards"), getAddressEncoder().encode(mint.address)] });
  const launch = await f.pump.launch.prepare({ ...config, creatorFees: { holderReward: true },
    firstBuy: { amount: "0.25" } }, { signer, mint });
  expect(launch.preview.creator).toBe(holderCreator);
  const idl = await Bun.file("idl/pumpfun.idl.json").json();
  const accountIndex = (name: string) => idl.instructions.find((ix: any) => ix.name === name).accounts
    .findIndex((account: any) => account.name === "creator_vault");
  const vault = await creatorVaultPda(holderCreator);
  expect(launch.instructions[2]!.accounts![accountIndex("buy_exact_quote_in_v2")]!.address).toBe(vault);
  const explicit = await mintWithFirstBuy({ user: signer, mint, rpc: f.rpc, name: "Example", symbol: "EX",
    uri: "ipfs://example", holderReward: true, firstBuyTokenAmount: 1000n, estimatedFirstBuyCost: 1000n });
  expect(explicit.buyInstruction.accounts![accountIndex("buy_v2")]!.address).toBe(vault);
});

test("launch gates reject unavailable creation modes and require lookup tables before atomic simulation", async () => {
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const disabled = await fixture({ createV2Enabled: false });
  await expect(disabled.pump.launch.prepare(config, { signer, mint })).rejects.toThrow("create_v2 is disabled");
  const rewardsDisabled = await fixture({ isHolderRewardEnabled: false });
  await expect(rewardsDisabled.pump.launch.prepare({ ...config, creatorFees: { holderReward: true } }, { signer, mint }))
    .rejects.toThrow("Holder reward creation is disabled");
  const f = await fixture();
  const atomic = await f.pump.launch.prepare({ ...config, firstBuy: { amount: "0.25" } }, { signer, mint });
  expect(() => atomic.simulate()).toThrow("call launch.setup()");
  expect(f.simulations).toBe(0);
});

test("expected contract guards require the matching mint signer before any RPC", async () => {
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const pump = createPump({ rpc: { getAccountInfo: () => { throw new Error("Unexpected RPC"); } } as any });
  await expect(pump.launch.prepare(config, { signer, expectedMint: mint.address } as any)).rejects.toThrow("mint signer");
  await expect(pump.launch.prepare(config, { signer, mint, expectedMint: signer.address })).rejects.toThrow("expectedMint");
  await expect(pump.launch.prepare(config, { signer } as any)).rejects.toThrow("mint signer");
  await expect(pump.launch.prepare(config, { signer, mint: { address: mint.address } } as any)).rejects.toThrow("mint signer");
  await expect(createV2({ user: signer, ...config.token, uri: config.token.metadataUri } as any)).rejects.toThrow("mint signer");
  await expect(mintWithFirstBuy({ user: signer, ...config.token, uri: config.token.metadataUri } as any)).rejects.toThrow("mint signer");
  await expect(createAndBuy({ creator: signer, metadata: config.token } as any)).rejects.toThrow("mint signer");
});

test("launch simulation includes priority fees and hooks in the signed wire transaction", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  let encoded: string | undefined;
  f.rpc.simulateTransaction = (transaction: string) => ({ send: async () => {
    encoded = transaction;
    return { context: { slot: 1n }, value: { err: null, logs: [] } };
  } });
  const memo = { programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: new TextEncoder().encode("launch"), accounts: [] };
  const launch = await f.pump.launch.prepare(config, { signer, mint,
    priorityFees: { computeUnitLimit: 300000, computeUnitPriceMicroLamports: 5000n },
    prependInstructions: [memo], appendInstructions: [memo] });
  expect(launch.preview.instructionCount).toBe(5);
  await launch.simulate();
  const transaction = getTransactionDecoder().decode(Buffer.from(encoded!, "base64"));
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  expect(message.instructions.map(ix => Array.from(ix.data ?? []))).toEqual(
    launch.instructions.map(ix => Array.from(ix.data ?? [])));
  expect(transaction.signatures[signer.address]).not.toBeNull();
  expect(transaction.signatures[launch.addresses.mint]).not.toBeNull();
});

test("confirmed launch failures are persisted as failed and cannot be resubmitted", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  f.rpc.sendTransaction = () => ({ send: async () => { throw new Error("submission failed"); } });
  f.rpc.getSignatureStatuses = () => ({ send: async () => ({ value: [{ err: { InstructionError: [0, "Custom"] } }] }) });
  f.rpc.getTransaction = () => ({ send: async () => ({ meta: { logMessages: ["Program log: creation failed"] } }) });
  const records: LaunchRecord[] = [];
  const launch = await f.pump.launch.prepare(config, { signer, mint, saveRecord: async record => { records.push(record); } });
  await expect(launch.send()).rejects.toThrow("creation failed");
  expect(launch.record.status).toBe("failed");
  expect(records.at(-1)?.status).toBe("failed");
  await expect(launch.send()).rejects.toThrow("already submitted");
});

test("persists signature before broadcast and refuses a second launch after submission uncertainty", async () => {
  const f = await fixture();
  const signer = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  let saved: LaunchRecord | undefined;
  const launch = await f.pump.launch.prepare(config, { signer, mint, saveRecord: async r => {
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
