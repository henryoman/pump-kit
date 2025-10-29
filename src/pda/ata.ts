/**
 * Associated Token Account (ATA) helpers for Token and Token-2022 programs.
 */

import { getProgramDerivedAddress, address as getAddress, getAddressEncoder } from "@solana/kit";
import type { Address } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";

const addressEncoder = getAddressEncoder();

export type FindAssociatedTokenPdaParams = {
  owner: string | Address;
  mint: string | Address;
  tokenProgram?: string | Address;
  associatedTokenProgram?: string | Address;
};

const DEFAULT_ASSOCIATED_PROGRAM = ASSOCIATED_TOKEN_PROGRAM_ID;

export async function findAssociatedTokenPda({
  owner,
  mint,
  tokenProgram = TOKEN_PROGRAM_ID,
  associatedTokenProgram = DEFAULT_ASSOCIATED_PROGRAM,
}: FindAssociatedTokenPdaParams) {
  return await getProgramDerivedAddress({
    programAddress: getAddress(associatedTokenProgram),
    seeds: [
      addressEncoder.encode(getAddress(owner)),
      addressEncoder.encode(getAddress(tokenProgram)),
      addressEncoder.encode(getAddress(mint)),
    ],
  });
}

export async function findAssociatedTokenPda2022(params: Omit<FindAssociatedTokenPdaParams, "tokenProgram" | "associatedTokenProgram"> & {
  tokenProgram?: string | Address;
  associatedTokenProgram?: string | Address;
}) {
  return await findAssociatedTokenPda({
    ...params,
    tokenProgram: params.tokenProgram ?? TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: params.associatedTokenProgram ?? DEFAULT_ASSOCIATED_PROGRAM,
  });
}

/**
 * Find the Associated Token Account (ATA) for the legacy Token program.
 * @param owner Owner's public key
 * @param mint Token mint address
 * @returns ATA address
 */
export async function ata(owner: string | Address, mint: string | Address): Promise<Address> {
  const [address] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ID,
  });
  return address;
}

/**
 * Find the Associated Token Account (ATA) for the Token-2022 program.
 * @param owner Owner's public key
 * @param mint Token mint address
 * @returns ATA address
 */
export async function ata2022(owner: string | Address, mint: string | Address): Promise<Address> {
  const [address] = await findAssociatedTokenPda2022({
    owner,
    mint,
  });
  return address;
}
