import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address, createNoopSigner } from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { findAssociatedTokenPda } from "../pda/ata";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../config/addresses";

export function accountAddress(value: TransactionSigner | Address | string): Address {
  return typeof value === "string" ? address(value) : value.address;
}

export function accountSigner(value: TransactionSigner | Address | string): TransactionSigner {
  return typeof value === "string" ? createNoopSigner(address(value)) : value;
}

export interface CreateAtaParams {
  payer: TransactionSigner | Address | string;
  owner: TransactionSigner | Address | string;
  mint: Address | string;
  tokenProgram?: Address | string;
  associatedTokenProgram?: Address | string;
}

/** Kit-native idempotent creation, including Token-2022 and PDA owners. */
export async function buildCreateAtaInstruction(params: CreateAtaParams): Promise<Instruction> {
  const owner = accountAddress(params.owner);
  const mint = address(params.mint);
  const tokenProgram = address(params.tokenProgram ?? TOKEN_PROGRAM_ID);
  const programAddress = address(params.associatedTokenProgram ?? ASSOCIATED_TOKEN_PROGRAM_ID);
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram, associatedTokenProgram: programAddress });
  return getCreateAssociatedTokenIdempotentInstruction({ payer: accountSigner(params.payer), owner, mint, ata, tokenProgram }, { programAddress });
}
