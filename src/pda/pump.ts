/**
 * PDA (Program Derived Address) helpers for the Pump bonding curve program.
 * These functions derive all the necessary accounts for interacting with the program.
 */

import { getProgramDerivedAddress, address as getAddress } from "@solana/kit";
import type { Address } from "@solana/kit";
import { PUMP_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "@solana-program/token";

const enc = new TextEncoder();

/**
 * Derives the global state PDA.
 * Seed: ["global"]
 */
export function globalPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("global")],
  })[0];
}

/**
 * Derives the bonding curve PDA for a given mint.
 * Seed: ["bonding-curve", mint]
 */
export function bondingCurvePda(mint: Address | string): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("bonding-curve"), getAddress(mint)],
  })[0];
}

/**
 * Derives the ATA (Associated Token Account) for the bonding curve.
 * This is where the bonding curve holds its tokens.
 * Owner: bondingCurve, Mint: mint, TokenProgram: TOKEN_PROGRAM_ID
 */
export function associatedBondingCurveAta(bondingCurve: Address | string, mint: Address | string): Address {
  return findAssociatedTokenPda({
    owner: getAddress(bondingCurve),
    mint: getAddress(mint),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  })[0];
}

/**
 * Derives the creator vault PDA.
 * Seed: ["creator-vault", creator]
 */
export function creatorVaultPda(creator: Address | string): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("creator-vault"), getAddress(creator)],
  })[0];
}

/**
 * Derives the global volume accumulator PDA.
 * Seed: ["global_volume_accumulator"]
 */
export function globalVolumeAccumulatorPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("global_volume_accumulator")],
  })[0];
}

/**
 * Derives the user volume accumulator PDA.
 * Seed: ["user_volume_accumulator", user]
 */
export function userVolumeAccumulatorPda(user: Address | string): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("user_volume_accumulator"), getAddress(user)],
  })[0];
}

/**
 * Derives the event authority PDA.
 * Seed: ["__event_authority"]
 */
export function eventAuthorityPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("__event_authority")],
  })[0];
}
