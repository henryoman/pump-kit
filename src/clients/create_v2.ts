import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import type { Address, TransactionSigner } from "@solana/kit";
import { getCreateV2Instruction } from "../pumpsdk/generated/instructions/createV2";
import { bondingCurvePda, globalPda, eventAuthorityPda } from "../pda/pump";
import { findAssociatedTokenPda } from "../pda/ata";
import { PUMP_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";

export const MAYHEM_PROGRAM_ID = address("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");

export interface CreateV2Params {
  user: TransactionSigner;
  mint: TransactionSigner;
  name: string;
  symbol: string;
  uri: string;
  creator?: Address | string;
  holderReward?: boolean;
  mayhemMode?: boolean;
  /** Cashback creation is deprecated by the program. */
  cashback?: false;
}

export function validateCreateV2Params(params: Pick<CreateV2Params, "name" | "symbol" | "uri" | "creator" | "holderReward" | "mayhemMode" | "cashback">): void {
  for (const [field, limit] of [["name", 32], ["symbol", 13], ["uri", 200]] as const) {
    const value = params[field];
    if (typeof value !== "string" || !value.trim() || new TextEncoder().encode(value).length > limit) {
      throw new Error(`${field} must contain 1 to ${limit} UTF-8 bytes`);
    }
  }
  const uri = new URL(params.uri);
  if (!["https:", "http:", "ipfs:"].includes(uri.protocol)) throw new Error("Unsupported metadata URI protocol");
  if (params.creator !== undefined && address(params.creator) === address("11111111111111111111111111111111")) {
    throw new Error("Creator must not be the default public key");
  }
  for (const field of ["holderReward", "mayhemMode"] as const) {
    if (params[field] !== undefined && typeof params[field] !== "boolean") throw new Error(`${field} must be a boolean`);
  }
  if (params.cashback !== undefined && params.cashback !== false) throw new Error("Cashback creation is deprecated");
}

async function derive(programAddress: Address, seed: string, mint?: Address): Promise<Address> {
  const seeds = [new TextEncoder().encode(seed)];
  if (mint) seeds.push(new Uint8Array(getAddressEncoder().encode(mint)));
  const [result] = await getProgramDerivedAddress({ programAddress, seeds });
  return result;
}

export async function mintAuthorityPda(): Promise<Address> {
  return derive(address(PUMP_PROGRAM_ID), "mint-authority");
}

/** Create a SOL-paired Token-2022 coin with all required protocol accounts. */
export async function createV2(params: CreateV2Params) {
  validateCreateV2Params(params);
  const creator = address(params.creator ?? params.user.address);
  if (creator === address("11111111111111111111111111111111")) throw new Error("Creator must not be the default public key");
  const tokenProgram = address(TOKEN_2022_PROGRAM_ID);
  const [mintAuthority, bondingCurve, global, eventAuthority, globalParams, solVault, mayhemState] = await Promise.all([
    mintAuthorityPda(), bondingCurvePda(params.mint.address), globalPda(), eventAuthorityPda(),
    derive(MAYHEM_PROGRAM_ID, "global-params"), derive(MAYHEM_PROGRAM_ID, "sol-vault"),
    derive(MAYHEM_PROGRAM_ID, "mayhem-state", params.mint.address),
  ]);
  const [[associatedBondingCurve], [mayhemTokenVault]] = await Promise.all([
    findAssociatedTokenPda({ owner: bondingCurve, mint: params.mint.address, tokenProgram }),
    findAssociatedTokenPda({ owner: solVault, mint: params.mint.address, tokenProgram }),
  ]);
  return getCreateV2Instruction({
    mint: params.mint, mintAuthority, bondingCurve, associatedBondingCurve, global,
    user: params.user, tokenProgram, mayhemProgramId: MAYHEM_PROGRAM_ID,
    globalParams, solVault, mayhemState, mayhemTokenVault, eventAuthority,
    program: address(PUMP_PROGRAM_ID), name: params.name, symbol: params.symbol, uri: params.uri,
    creator, isMayhemMode: params.mayhemMode ?? false, isCashbackEnabled: [false],
    creatorFeeBps: [0n], isHolderReward: [params.holderReward ?? false],
  });
}
