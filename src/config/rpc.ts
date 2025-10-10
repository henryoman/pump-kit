/**
 * Solana Kit RPC configuration with sensible defaults.
 * Uses environment variables for flexibility.
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  devnet,
  mainnet,
  testnet,
} from "@solana/kit";

// Determine cluster from environment
const CLUSTER = process.env.SOLANA_CLUSTER || "devnet";
const CUSTOM_RPC = process.env.SOLANA_RPC;
const CUSTOM_RPC_WS = process.env.SOLANA_RPC_WS;

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

function getWebsocketUrl() {
  if (CUSTOM_RPC_WS) {
    return CUSTOM_RPC_WS;
  }

  switch (CLUSTER) {
    case "devnet":
      return devnet("wss://api.devnet.solana.com");
    case "testnet":
      return testnet("wss://api.testnet.solana.com");
    case "mainnet":
    default:
      return mainnet("wss://api.mainnet-beta.solana.com");
  }
}

export const rpc = createSolanaRpc(getClusterUrl());
export const rpcSubscriptions = createSolanaRpcSubscriptions(getWebsocketUrl());
export const defaultCommitment = "confirmed" as const;
