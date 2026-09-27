import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import type { Address } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../config/addresses";
import { bondingCurvePda } from "../pda/pump";
import { poolPda } from "../pda/pumpAmm";
import { fetchBondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import { fetchMaybePool, type Pool } from "../ammsdk/generated/accounts/pool";
import type { BondingCurveState } from "../ammsdk/bondingCurveMath";
import type { CommitmentLevel } from "./curve";
import { WSOL_ADDRESS } from "../utils/wsol";

export type SwapVenue =
  | Readonly<{ status: "curve"; curve: BondingCurveState }>
  | Readonly<{ status: "migrationPending"; curve: BondingCurveState; poolAddress: Address }>
  | Readonly<{ status: "amm"; curve: BondingCurveState; poolAddress: Address; pool: Pool }>;

export async function canonicalPoolCreator(mint: Address | string): Promise<Address> {
  return (await getProgramDerivedAddress({ programAddress: address(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("pool-authority"), getAddressEncoder().encode(address(mint))] }))[0];
}

/** Completion and migration are separate states; RPC failures propagate unchanged. */
export async function resolveSwapVenue(params: {
  rpc: RpcClient; mint: Address | string; commitment?: CommitmentLevel;
  curveStateOverride?: BondingCurveState;
  poolAddress?: Address | string; poolCreator?: Address | string; poolIndex?: number; quoteMint?: Address | string;
}): Promise<SwapVenue> {
  const commitment = params.commitment ?? getDefaultCommitment();
  const mint = address(params.mint);
  const curve = params.curveStateOverride ?? (await fetchBondingCurve(params.rpc, await bondingCurvePda(mint), { commitment })).data;
  if (!curve.complete) return { status: "curve", curve };
  const quote = address(params.quoteMint ?? WSOL_ADDRESS);
  const creator = params.poolCreator ? address(params.poolCreator) : await canonicalPoolCreator(mint);
  const poolAddress = params.poolAddress ? address(params.poolAddress) : await poolPda(params.poolIndex ?? 0, creator, mint, quote);
  const pool = await fetchMaybePool(params.rpc, poolAddress, { commitment });
  if (!pool.exists) return { status: "migrationPending", curve, poolAddress };
  if (pool.programAddress !== address(PUMP_AMM_PROGRAM_ID)) throw new Error("Invalid AMM pool owner");
  if (pool.data.baseMint !== mint || pool.data.quoteMint !== quote ||
    (!params.poolAddress && (pool.data.creator !== creator || pool.data.index !== (params.poolIndex ?? 0)))) {
    throw new Error("AMM pool does not match the requested mint pair and creator");
  }
  return { status: "amm", curve, poolAddress, pool: pool.data };
}

export class MigrationPendingError extends Error {
  constructor(readonly poolAddress: Address) {
    super("Curve is complete but the requested AMM pool is not ready");
    this.name = "MigrationPendingError";
  }
}
