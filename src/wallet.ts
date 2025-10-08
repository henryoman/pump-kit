import type { Transaction } from "@solana/kit";

/**
 * Minimal signer interface for signing transactions.
 * Compatible with Keypair, wallet adapters, etc.
 */
export interface Signer {
  publicKey: Uint8Array; // 32 bytes
  sign(tx: Transaction): Promise<Transaction>;
}

export type SendFn = (raw: Uint8Array) => Promise<string>; // signature
