export const RPC_URL = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
export const COMMITMENT: "processed" | "confirmed" | "finalized" =
  (process.env.SOLANA_COMMITMENT as any) ?? "confirmed"; // sensible default
export const TX_TIMEOUT_MS = Number(process.env.SOLANA_TX_TIMEOUT_MS ?? 60_000);
