import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { getSyncNativeInstruction, getCloseAccountInstruction } from "@solana-program/token";
import { accountAddress, accountSigner, buildCreateAtaInstruction } from "./ata";
import { findAssociatedTokenPda } from "../pda/ata";

export interface WrapSolParams {
  owner: TransactionSigner | Address | string;
  amount: bigint;
  payer?: TransactionSigner | Address | string;
  associatedTokenAddress?: Address | string;
  createAta?: boolean;
  autoClose?: boolean;
}

export interface WrapSolInstructions {
  prepend: Instruction[];
  append: Instruction[];
  associatedTokenAddress: Address;
}

export const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
export const WSOL = WSOL_ADDRESS;

async function wsolAccount(owner: TransactionSigner | Address | string, supplied?: Address | string) {
  return supplied ? address(supplied) : (await findAssociatedTokenPda({ owner: accountAddress(owner), mint: WSOL_ADDRESS }))[0];
}

export async function buildWrapSolInstructions(params: WrapSolParams): Promise<WrapSolInstructions> {
  if (typeof params.amount !== "bigint" || params.amount <= 0n || params.amount > 18446744073709551615n) {
    throw new Error("Amount must be a positive u64 bigint when wrapping SOL");
  }
  const payer = params.payer ?? params.owner;
  const associatedTokenAddress = await wsolAccount(params.owner, params.associatedTokenAddress);
  const prepend: Instruction[] = [];
  if (params.createAta !== false) {
    const creation = await buildCreateAtaInstruction({ payer, owner: params.owner, mint: WSOL_ADDRESS });
    if (creation.accounts?.[1]?.address !== associatedTokenAddress) throw new Error("Supplied WSOL account is not the owner's ATA; set createAta: false for an existing custom account");
    prepend.push(creation);
  }
  prepend.push(getTransferSolInstruction({ source: accountSigner(payer), destination: associatedTokenAddress, amount: params.amount }));
  prepend.push(getSyncNativeInstruction({ account: associatedTokenAddress }));
  const append = params.autoClose ? [getCloseAccountInstruction({ account: associatedTokenAddress,
    destination: accountAddress(payer), owner: accountSigner(params.owner) })] : [];
  return { prepend, append, associatedTokenAddress };
}

export async function buildUnwrapSolInstructions(owner: TransactionSigner | Address | string, associatedTokenAddress?: Address | string): Promise<Instruction[]> {
  return [getCloseAccountInstruction({ account: await wsolAccount(owner, associatedTokenAddress),
    destination: accountAddress(owner), owner: accountSigner(owner) })];
}
