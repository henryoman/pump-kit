export type Pubkey = Uint8Array; // 32 bytes

export type Commitment = "processed" | "confirmed" | "finalized";

export interface TransactionResult {
  signature: string;
  slot?: number;
}
