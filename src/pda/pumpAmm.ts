/**
 * PDA (Program Derived Address) helpers for the Pump AMM program.
 * These functions derive all the necessary accounts for interacting with liquidity pools.
 */

import { getProgramDerivedAddress, address as getAddress } from "@solana/kit";
import type { Address } from "@solana/kit";
import { PUMP_AMM_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda as findATA2022 } from "@solana-program/token-2022";

const enc = new TextEncoder();

/**
 * Derives the pool PDA.
 * Seed: ["pool", index:u16 (little-endian), creator, baseMint, quoteMint]
 */
export function poolPda(
  index: number,
  creator: Address | string,
  baseMint: Address | string,
  quoteMint: Address | string
): Address {
  // Encode index as little-endian u16
  const indexBytes = new Uint8Array(2);
  indexBytes[0] = index & 0xff;
  indexBytes[1] = (index >> 8) & 0xff;

  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [
      enc.encode("pool"),
      indexBytes,
      getAddress(creator),
      getAddress(baseMint),
      getAddress(quoteMint),
    ],
  })[0];
}

/**
 * Derives the LP (Liquidity Provider) mint PDA for a pool.
 * Seed: ["pool_lp_mint", pool]
 */
export function lpMintPda(pool: Address | string): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("pool_lp_mint"), getAddress(pool)],
  })[0];
}

/**
 * Derives the user's LP token ATA (Associated Token Account).
 * Uses Token-2022 program for LP tokens.
 * Owner: user, Mint: lpMint, TokenProgram: TOKEN_2022_PROGRAM_ID
 */
export function userLpAta(user: Address | string, lpMint: Address | string): Address {
  return findATA2022({
    owner: getAddress(user),
    mint: getAddress(lpMint),
    tokenProgram: getAddress(TOKEN_2022_PROGRAM_ID),
  })[0];
}

/**
 * Derives the pool's token ATA for holding base or quote tokens.
 * Owner: pool, Mint: tokenMint, TokenProgram: tokenProgram
 */
export function poolTokenAta(
  pool: Address | string,
  tokenMint: Address | string,
  tokenProgram: Address | string
): Address {
  return findATA2022({
    owner: getAddress(pool),
    mint: getAddress(tokenMint),
    tokenProgram: getAddress(tokenProgram),
  })[0];
}

/**
 * Derives the global config PDA.
 * Seed: ["global_config"]
 */
export function globalConfigPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("global_config")],
  })[0];
}

/**
 * Derives the global volume accumulator PDA.
 * Seed: ["global_volume_accumulator"]
 */
export function globalVolumeAccumulatorPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("global_volume_accumulator")],
  })[0];
}

/**
 * Derives the user volume accumulator PDA.
 * Seed: ["user_volume_accumulator", user]
 */
export function userVolumeAccumulatorPda(user: Address | string): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("user_volume_accumulator"), getAddress(user)],
  })[0];
}
