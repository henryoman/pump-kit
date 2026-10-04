import { globalConfigPda, ammFeeConfigPda } from "../pda/pumpAmm";
import { getPoolDecoder, POOL_DISCRIMINATOR } from "../ammsdk/generated/accounts/pool";
import { getGlobalConfigDecoder, GLOBAL_CONFIG_DISCRIMINATOR } from "../ammsdk/generated/accounts/globalConfig";
import { getFeeConfigDecoder as getAmmFeeConfigDecoder, FEE_CONFIG_DISCRIMINATOR as AMM_FEE_CONFIG_DISCRIMINATOR } from "../ammsdk/generated/accounts/feeConfig";
import { canonicalPoolCreator } from "./venue";
import { address, getAddressDecoder } from "@solana/kit";
import type { Address, ReadonlyUint8Array } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import { PUMP_PROGRAM_ID, FEE_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../config/addresses";
import { bondingCurvePda, globalPda, feeConfigPda } from "../pda/pump";
import { getBondingCurveDecoder, BONDING_CURVE_DISCRIMINATOR } from "../pumpsdk/generated/accounts/bondingCurve";
import { getGlobalDecoder, GLOBAL_DISCRIMINATOR } from "../pumpsdk/generated/accounts/global";
import { getFeeConfigDecoder, FEE_CONFIG_DISCRIMINATOR } from "../pumpsdk/generated/accounts/feeConfig";
import { normalizeProtocolAccount } from "../utils/protocol_accounts";
import { validateTokenProgram, type MintContext } from "../utils/token_program";
import { selectFeeSchedule } from "../ammsdk/fee_schedule";
import type { CommitmentLevel } from "./curve";
import { WSOL_ADDRESS } from "../utils/wsol";

/** One getMultipleAccounts response preserves a shared bank slot for related state. */
export async function readAccountSnapshot(rpc: RpcClient, addresses: readonly Address[], commitment: CommitmentLevel) {
  const response = await rpc.getMultipleAccounts([...addresses], { encoding: "base64", commitment }).send();
  if (response.value.length !== addresses.length) throw new Error("Incomplete account snapshot response");
  return {
    contextSlot: response.context.slot,
    accounts: response.value.map((value, index) => {
      if (!value) throw new Error(`Snapshot account does not exist: ${addresses[index]}`);
      return { address: addresses[index]!, owner: value.owner, data: new Uint8Array(Buffer.from(value.data[0], "base64")) };
    }),
  };
}

type SnapshotAccount = Awaited<ReturnType<typeof readAccountSnapshot>>["accounts"][number];
export function assertSnapshotOwner(account: SnapshotAccount, owner: Address | string): Uint8Array {
  if (account.owner !== address(owner)) throw new Error(`Invalid snapshot account owner: ${account.address}`);
  return account.data;
}

export function snapshotMintContext(account: SnapshotAccount): MintContext & { supply: bigint } {
  const tokenProgram = validateTokenProgram(account.owner);
  const bytes = account.data;
  if (bytes.length < 82 || bytes[45] !== 1) throw new Error("Invalid or uninitialized snapshot mint");
  return { mint: account.address, tokenProgram, decimals: bytes[44]!,
    supply: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(36, true) };
}

export async function loadCurveSnapshot(params: { rpc: RpcClient; mint: Address | string; commitment: CommitmentLevel }) {
  const mint = address(params.mint);
  const [curveAddress, globalAddress, feeAddress] = await Promise.all([bondingCurvePda(mint), globalPda(), feeConfigPda()]);
  const { accounts, contextSlot } = await readAccountSnapshot(params.rpc,
    [curveAddress, globalAddress, feeAddress, mint, address(WSOL_ADDRESS)], params.commitment);
  const [curveAccount, globalAccount, feeAccount, baseAccount, quoteAccount] = accounts;
  const curveBytes = assertSnapshotOwner(curveAccount!, PUMP_PROGRAM_ID);
  const normalized = normalizeProtocolAccount({ exists: true, address: curveAddress, data: curveBytes } as any,
    BONDING_CURVE_DISCRIMINATOR, [49, 81, 82, 83, 115, 123, 124], 125);
  if (!normalized.exists) throw new Error("Curve snapshot missing");
  const curve = getBondingCurveDecoder().decode(normalized.data);
  const global = getGlobalDecoder().decode(protocolData(globalAccount!, PUMP_PROGRAM_ID, GLOBAL_DISCRIMINATOR));
  const feeConfig = getFeeConfigDecoder().decode(protocolData(feeAccount!, FEE_PROGRAM_ID, FEE_CONFIG_DISCRIMINATOR));
  const baseMint = snapshotMintContext(baseAccount!);
  const quoteMint = snapshotMintContext(quoteAccount!);
  if (curve.virtualTokenReserves <= 0n) throw new Error("Curve has no virtual reserves");
  const supply = curve.isMayhemMode ? baseMint.supply : 1000000000000000n;
  const marketCap = supply * curve.virtualQuoteReserves / curve.virtualTokenReserves;
  const fees = { ...selectFeeSchedule(feeConfig, true, curve.quoteMint, marketCap) };
  if (global.creatorFeeConfigurable && curve.creatorFeeBps) fees.creatorFeeBps = curve.creatorFeeBps;
  if (curve.creator === address("11111111111111111111111111111111")) fees.creatorFeeBps = 0n;
  return { contextSlot, curve, global, fees, baseMint, quoteMint };
}

/** Immutable addresses retained between quotes; mutable balances are always refreshed. */
export type AmmTradingContext = Readonly<{
  poolAddress: Address;
  baseMint: Address;
  quoteMint: Address;
  baseVault: Address;
  quoteVault: Address;
}>;

export async function loadAmmSnapshot(params: {
  rpc: RpcClient; context: AmmTradingContext; commitment: CommitmentLevel;
}) {
  const context = params.context;
  const [globalAddress, feeAddress] = await Promise.all([globalConfigPda(), ammFeeConfigPda()]);
  const { accounts, contextSlot } = await readAccountSnapshot(params.rpc,
    [context.poolAddress, globalAddress, feeAddress, context.baseMint, context.quoteMint,
      context.baseVault, context.quoteVault], params.commitment);
  const [poolAccount, globalAccount, feeAccount, baseAccount, quoteAccount, baseVault, quoteVault] = accounts;
  const normalized = normalizeProtocolAccount({ exists: true, address: context.poolAddress,
    data: assertSnapshotOwner(poolAccount!, PUMP_AMM_PROGRAM_ID) } as any,
    POOL_DISCRIMINATOR, [211, 243, 244, 245, 261, 269, 270], 271);
  if (!normalized.exists) throw new Error("Pool snapshot missing");
  const poolData = getPoolDecoder().decode(normalized.data);
  if (poolData.baseMint !== context.baseMint || poolData.quoteMint !== context.quoteMint ||
      poolData.poolBaseTokenAccount !== context.baseVault || poolData.poolQuoteTokenAccount !== context.quoteVault) {
    throw new Error("AMM snapshot does not match retained pool addresses");
  }
  const globalConfigData = getGlobalConfigDecoder().decode(protocolData(globalAccount!, PUMP_AMM_PROGRAM_ID, GLOBAL_CONFIG_DISCRIMINATOR));
  const config = getAmmFeeConfigDecoder().decode(protocolData(feeAccount!, FEE_PROGRAM_ID, AMM_FEE_CONFIG_DISCRIMINATOR));
  const baseMint = snapshotMintContext(baseAccount!);
  const quoteMint = snapshotMintContext(quoteAccount!);
  const baseReserve = snapshotVaultBalance(baseVault!, baseMint, context.poolAddress);
  const realQuoteReserve = snapshotVaultBalance(quoteVault!, quoteMint, context.poolAddress);
  const quoteReserve = realQuoteReserve + poolData.virtualQuoteReserves;
  if (baseReserve <= 0n || quoteReserve <= 0n) throw new Error("Invalid pool reserves");
  const canonical = poolData.creator === await canonicalPoolCreator(context.baseMint);
  const supply = poolData.isMayhemMode ? 1000000000000000n : baseMint.supply;
  const fees = { ...selectFeeSchedule(config, canonical, context.quoteMint, supply * quoteReserve / baseReserve) };
  if (globalConfigData.creatorFeeConfigurable && poolData.creatorFeeBps > 0n) fees.creatorFeeBps = poolData.creatorFeeBps;
  if (poolData.coinCreator === address("11111111111111111111111111111111")) fees.creatorFeeBps = 0n;
  return { contextSlot, poolAddress: context.poolAddress, poolCreator: poolData.creator,
    poolData, globalConfigData, baseMint, quoteMint, baseTokenProgram: baseMint.tokenProgram,
    quoteTokenProgram: quoteMint.tokenProgram, baseReserve, realQuoteReserve, quoteReserve, fees };
}

function protocolData(account: SnapshotAccount, owner: string | Address, discriminator: ReadonlyUint8Array) {
  const data = assertSnapshotOwner(account, owner);
  if (!discriminator.every((byte, index) => data[index] === byte)) throw new Error("Invalid protocol account discriminator");
  return data;
}

function snapshotVaultBalance(account: SnapshotAccount, mint: MintContext, pool: Address): bigint {
  const data = assertSnapshotOwner(account, mint.tokenProgram);
  if (data.length < 165 || data[108] !== 1) throw new Error("Invalid or uninitialized pool vault");
  const decoder = getAddressDecoder();
  if (decoder.decode(data.subarray(0, 32)) !== mint.mint || decoder.decode(data.subarray(32, 64)) !== pool) {
    throw new Error("Pool vault does not match mint or pool authority");
  }
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}
