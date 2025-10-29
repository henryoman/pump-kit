/**
 * PDA (Program Derived Address) helpers for the Pump AMM program.
 * These functions derive all the necessary accounts for interacting with liquidity pools.
 */

import { getProgramDerivedAddress, address as getAddress, getAddressEncoder } from "@solana/kit";
import type { Address } from "@solana/kit";
import { PUMP_AMM_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda, findAssociatedTokenPda2022 } from "./ata";

const enc = new TextEncoder();
const addressEncoder = getAddressEncoder();

/**
 * Derives the pool PDA.
 * Seed: ["pool", index:u16 (little-endian), creator, baseMint, quoteMint]
 */
export async function poolPda(
  index: number,
  creator: Address | string,
  baseMint: Address | string,
  quoteMint: Address | string
): Promise<Address> {
  // Encode index as little-endian u16
  const indexBytes = new Uint8Array(2);
  indexBytes[0] = index & 0xff;
  indexBytes[1] = (index >> 8) & 0xff;

  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [
      enc.encode("pool"),
      indexBytes,
      addressEncoder.encode(getAddress(creator)),
      addressEncoder.encode(getAddress(baseMint)),
      addressEncoder.encode(getAddress(quoteMint)),
    ],
  });
  return address;
}

/**
 * Derives the LP (Liquidity Provider) mint PDA for a pool.
 * Seed: ["pool_lp_mint", pool]
 */
export async function lpMintPda(pool: Address | string): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("pool_lp_mint"), addressEncoder.encode(getAddress(pool))],
  });
  return address;
}

/**
 * Derives the user's LP token ATA (Associated Token Account).
 * Uses Token-2022 program for LP tokens.
 * Owner: user, Mint: lpMint, TokenProgram: TOKEN_2022_PROGRAM_ID
 */
export async function userLpAta(user: Address | string, lpMint: Address | string): Promise<Address> {
  const [address] = await findAssociatedTokenPda2022({
    owner: user,
    mint: lpMint,
  });
  return address;
}

/**
 * Derives the pool's token ATA for holding base or quote tokens.
 * Owner: pool, Mint: tokenMint, TokenProgram: tokenProgram
 */
export async function poolTokenAta(
  pool: Address | string,
  tokenMint: Address | string,
  tokenProgram: Address | string
): Promise<Address> {
  const [address] = await findAssociatedTokenPda({
    owner: pool,
    mint: tokenMint,
    tokenProgram,
  });
  return address;
}

/**
 * Derives the global config PDA.
 * Seed: ["global_config"]
 */
export async function globalConfigPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("global_config")],
  });
  return address;
}

/**
 * Derives the global volume accumulator PDA.
 * Seed: ["global_volume_accumulator"]
 */
export async function globalVolumeAccumulatorPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("global_volume_accumulator")],
  });
  return address;
}

/**
 * Derives the user volume accumulator PDA.
 * Seed: ["user_volume_accumulator", user]
 */
export async function userVolumeAccumulatorPda(user: Address | string): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("user_volume_accumulator"), addressEncoder.encode(getAddress(user))],
  });
  return address;
}

/**
 * Derives the event authority PDA.
 * Seed: ["__event_authority"]
 */
export async function eventAuthorityPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("__event_authority")],
  });
  return address;
}

/**
 * Derives the coin creator vault authority PDA.
 * Seed: ["creator_vault", coinCreator]
 */
export async function coinCreatorVaultAuthorityPda(
  coinCreator: Address | string
): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("creator_vault"), addressEncoder.encode(getAddress(coinCreator))],
  });
  return address;
}

/**
 * Derives the coin creator vault ATA for the quote mint using the provided token program.
 */
export async function coinCreatorVaultAta(
  coinCreatorVaultAuthority: Address | string,
  quoteMint: Address | string,
  tokenProgram: Address | string
): Promise<Address> {
  const [address] = await findAssociatedTokenPda({
    owner: coinCreatorVaultAuthority,
    mint: quoteMint,
    tokenProgram,
  });
  return address;
}
