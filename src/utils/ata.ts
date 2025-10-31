/**
 * Helper to create Associated Token Account instructions
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";
import { AccountRole } from "@solana/instructions";

function resolveAddress(value: TransactionSigner | Address | string): PublicKey {
  if (typeof value === "string") {
    return new PublicKey(value);
  }
  if (typeof value === "object" && "address" in value) {
    return new PublicKey(value.address);
  }
  return new PublicKey(value as Address);
}

function resolveAddressToPublicKey(value: string | Address | PublicKey): PublicKey {
  if (value instanceof PublicKey) {
    return value;
  }
  return resolveAddress(value);
}

function convertInstruction(ix: TransactionInstruction): Instruction {
  return {
    programAddress: toAddress(ix.programId.toBase58()),
    accounts: ix.keys.map((key) => ({
      address: toAddress(key.pubkey.toBase58()),
      role: key.isSigner
        ? key.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : AccountRole.READONLY_SIGNER
        : key.isWritable
        ? AccountRole.WRITABLE
        : AccountRole.READONLY,
    })),
    data: ix.data,
  };
}

export interface CreateAtaParams {
  payer: TransactionSigner | Address | string;
  owner: TransactionSigner | Address | string;
  mint: Address | string;
  tokenProgram?: Address | string;
  associatedTokenProgram?: Address | string;
}

/**
 * Build an instruction to create an Associated Token Account if it doesn't exist.
 */
export function buildCreateAtaInstruction(params: CreateAtaParams): Instruction {
  const {
    payer,
    owner,
    mint,
    tokenProgram = TOKEN_PROGRAM_ID,
    associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID,
  } = params;

  const payerAddress = resolveAddress(payer);
  const ownerAddress = resolveAddress(owner);
  const mintAddress = resolveAddress(mint);
  const tokenProgramAddress = resolveAddressToPublicKey(tokenProgram);
  const associatedTokenProgramAddress = resolveAddressToPublicKey(associatedTokenProgram);

  const ataPubkey = getAssociatedTokenAddressSync(
    mintAddress,
    ownerAddress,
    false,
    tokenProgramAddress,
    associatedTokenProgramAddress
  );

  return convertInstruction(
    createAssociatedTokenAccountInstruction(
      payerAddress,
      ataPubkey,
      ownerAddress,
      mintAddress,
      tokenProgramAddress,
      associatedTokenProgramAddress
    )
  );
}

