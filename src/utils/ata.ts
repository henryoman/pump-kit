import type { Pubkey } from "../types";

// SPL Token Program IDs
export const TOKEN_PROGRAM_ID = new Uint8Array([
  6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169
]);

export const TOKEN_2022_PROGRAM_ID = new Uint8Array([
  6, 221, 246, 225, 210, 198, 192, 88, 85, 221, 93, 73, 103, 6, 179, 68, 160, 156, 207, 197, 120, 137, 202, 48, 43, 40, 71, 183, 180, 156, 0, 0
]);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new Uint8Array([
  140, 151, 37, 143, 78, 36, 137, 241, 187, 61, 16, 41, 20, 142, 13, 131, 11, 90, 19, 153, 218, 255, 16, 132, 4, 142, 123, 216, 219, 233, 248, 89
]);

/**
 * Derives the Associated Token Account address for a given wallet and mint.
 * Uses the ATA program's PDA derivation.
 */
export async function findAssociatedTokenAddress(
  walletAddress: Pubkey,
  tokenMintAddress: Pubkey,
  tokenProgramId: Pubkey = TOKEN_PROGRAM_ID
): Promise<Pubkey> {
  const seeds = [
    walletAddress,
    tokenProgramId,
    tokenMintAddress
  ];
  
  // Simple PDA derivation - in production, use proper crypto library
  // This is a placeholder that would need actual implementation with findProgramAddress
  throw new Error("findAssociatedTokenAddress needs proper PDA derivation implementation");
}

/**
 * Gets or creates an Associated Token Account instruction builder.
 */
export function getOrCreateATAInstruction(
  payer: Pubkey,
  owner: Pubkey,
  mint: Pubkey,
  tokenProgramId: Pubkey = TOKEN_PROGRAM_ID
) {
  // This would build the create ATA instruction if it doesn't exist
  // Implementation depends on the specific RPC/program interface used
  throw new Error("getOrCreateATAInstruction needs implementation with proper instruction builders");
}
