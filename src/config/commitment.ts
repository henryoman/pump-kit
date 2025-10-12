import type { Commitment } from "@solana/rpc-types";

export type CommitmentLevel = Extract<Commitment, "processed" | "confirmed" | "finalized">;

let defaultCommitment: CommitmentLevel = "confirmed";

export function setDefaultCommitment(level: CommitmentLevel): void {
  defaultCommitment = level;
}

export function getDefaultCommitment(): CommitmentLevel {
  return defaultCommitment;
}
