/**
 * Solana Kit RPC configuration with sensible defaults.
 * Uses environment variables for flexibility.
 */

import { createSolanaRpc, devnet, mainnet, testnet } from "@solana/kit";

// Determine cluster from environment
const CLUSTER = process.env.SOLANA_CLUSTER || "devnet";
const CUSTOM_RPC = process.env.SOLANA_RPC;

// Create appropriate cluster URL or use custom RPC
function getClusterUrl() {
  if (CUSTOM_RPC) {
    return CUSTOM_RPC;
  }
  
  switch (CLUSTER) {
    case "devnet":
      return devnet("https://api.devnet.solana.com");
    case "testnet":
      return testnet("https://api.testnet.solana.com");
    case "mainnet":
    default:
      return mainnet("https://api.mainnet-beta.solana.com");
  }
}

export const rpc = createSolanaRpc(getClusterUrl());
export const defaultCommitment = "confirmed" as const;
