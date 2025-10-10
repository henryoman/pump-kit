import { SystemProgram, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";
import { AccountRole } from "@solana/instructions";

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

export function buildWrapSolInstructions(params: WrapSolParams): WrapSolInstructions {
  const {
    owner,
    amount,
    payer = owner,
    associatedTokenAddress,
    createAta = true,
    autoClose = false,
  } = params;

  if (amount <= 0n) {
    throw new Error("Amount must be positive when wrapping SOL");
  }

  const ownerAddress = resolveAddress(owner);
  const payerAddress = resolveAddress(payer);

  const ataPubkey = associatedTokenAddress
    ? new PublicKey(associatedTokenAddress)
    : getAssociatedTokenAddressSync(
        new PublicKey(WSOL_ADDRESS),
        ownerAddress,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

  const prepend: Instruction[] = [];
  const append: Instruction[] = [];

  if (createAta) {
    prepend.push(
      convertInstruction(
        createAssociatedTokenAccountInstruction(
          payerAddress,
          ataPubkey,
          ownerAddress,
          new PublicKey(WSOL_ADDRESS)
        )
      )
    );
  }

  prepend.push(
    convertInstruction(
      SystemProgram.transfer({
        fromPubkey: payerAddress,
        toPubkey: ataPubkey,
        lamports: Number(amount),
      })
    )
  );

  prepend.push(convertInstruction(createSyncNativeInstruction(ataPubkey)));

  if (autoClose) {
    append.push(
      convertInstruction(
        createCloseAccountInstruction(
          ataPubkey,
          payerAddress,
          ownerAddress
        )
      )
    );
  }

  return {
    prepend,
    append,
    associatedTokenAddress: toAddress(ataPubkey.toBase58()),
  };
}

export function buildUnwrapSolInstructions(owner: TransactionSigner | Address | string, associatedTokenAddress?: Address | string) {
  const ownerAddress = resolveAddress(owner);
  const ataPubkey = associatedTokenAddress
    ? new PublicKey(associatedTokenAddress)
    : getAssociatedTokenAddressSync(
        new PublicKey(WSOL_ADDRESS),
        ownerAddress,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

  return [
    convertInstruction(
      createCloseAccountInstruction(ataPubkey, ownerAddress, ownerAddress)
    ),
  ];
}

function resolveAddress(value: TransactionSigner | Address | string): PublicKey {
  if (typeof value === "string") {
    return new PublicKey(value);
  }
  if (typeof value === "object" && "address" in value) {
    return new PublicKey(value.address);
  }
  return new PublicKey(value as Address);
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

export const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
export const WSOL = WSOL_ADDRESS;
