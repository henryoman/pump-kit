/**
 * Associated Token Account (ATA) helpers for Token and Token-2022 programs.
 */

import { address as getAddress } from "@solana/kit";
import type { Address } from "@solana/kit";
import { findAssociatedTokenPda as findATA } from "@solana-program/token";
import { findAssociatedTokenPda as findATA2022 } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";

/**
 * Find the Associated Token Account (ATA) for the legacy Token program.
 * @param owner Owner's public key
 * @param mint Token mint address
 * @returns ATA address
 */
export function ata(owner: string | Address, mint: string | Address): Address {
  return findATA({
    owner: getAddress(owner),
    mint: getAddress(mint),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  })[0];
}

/**
 * Find the Associated Token Account (ATA) for the Token-2022 program.
 * @param owner Owner's public key
 * @param mint Token mint address
 * @returns ATA address
 */
export function ata2022(owner: string | Address, mint: string | Address): Address {
  return findATA2022({
    owner: getAddress(owner),
    mint: getAddress(mint),
    tokenProgram: getAddress(TOKEN_2022_PROGRAM_ID),
  })[0];
}
