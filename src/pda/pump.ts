/**
 * PDA (Program Derived Address) helpers for the Pump bonding curve program.
 * These functions derive all the necessary accounts for interacting with the program.
 */

import { getProgramDerivedAddress, address as getAddress, getAddressEncoder } from "@solana/kit";
import type { Address } from "@solana/kit";
import { FEE_PROGRAM_ID, PUMP_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "./ata";

const enc = new TextEncoder();
const addressEncoder = getAddressEncoder();

/**
 * Derives the global state PDA.
 * Seed: ["global"]
 */
export async function globalPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("global")],
  });
  return address;
}

/**
 * Derives the bonding curve PDA for a given mint.
 * Seed: ["bonding-curve", mint]
 */
export async function bondingCurvePda(mint: Address | string): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("bonding-curve"), addressEncoder.encode(getAddress(mint))],
  });
  return address;
}

/**
 * Derives the ATA (Associated Token Account) for the bonding curve.
 * This is where the bonding curve holds its tokens.
 * Owner: bondingCurve, Mint: mint, TokenProgram: TOKEN_PROGRAM_ID
 */
export async function associatedBondingCurveAta(bondingCurve: Address | string, mint: Address | string): Promise<Address> {
  const [address] = await findAssociatedTokenPda({
    owner: getAddress(bondingCurve),
    mint: getAddress(mint),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });
  return address;
}

/**
 * Derives the creator vault PDA.
 * Seed: ["creator-vault", creator]
 */
export async function creatorVaultPda(creator: Address | string): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("creator-vault"), addressEncoder.encode(getAddress(creator))],
  });
  return address;
}

/**
 * Derives the global volume accumulator PDA.
 * Seed: ["global_volume_accumulator"]
 */
export async function globalVolumeAccumulatorPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
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
    programAddress: getAddress(PUMP_PROGRAM_ID),
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
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("__event_authority")],
  });
  return address;
}

/**
 * Derives the fee config PDA for the pump fee program.
 * Seed: ["fee_config", pump_program_id]
 */
export async function feeConfigPda(): Promise<Address> {
  const [address] = await getProgramDerivedAddress({
    programAddress: getAddress(FEE_PROGRAM_ID),
    seeds: [
      enc.encode("fee_config"),
      addressEncoder.encode(getAddress(PUMP_PROGRAM_ID)),
    ],
  });
  return address;
}
