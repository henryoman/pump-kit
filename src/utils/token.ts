import type { Pubkey } from "../types";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./ata";

/**
 * Determines if a mint uses Token-2022 or legacy Token Program.
 * In production, this would query the mint account to check its owner.
 */
export async function getTokenProgramId(mint: Pubkey): Promise<Pubkey> {
  // Placeholder - would need to query RPC to check mint's owner program
  // For now, default to legacy token program
  return TOKEN_PROGRAM_ID;
}

/**
 * Gets token account balance.
 */
export async function getTokenBalance(account: Pubkey): Promise<bigint> {
  // Would use RPC to fetch token account and parse amount
  throw new Error("getTokenBalance needs RPC implementation");
}

/**
 * Parse token amount with decimals.
 */
export function parseTokenAmount(amount: string | number, decimals: number): bigint {
  const amountStr = typeof amount === "number" ? amount.toString() : amount;
  const [whole, fraction = ""] = amountStr.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

/**
 * Format token amount from raw amount.
 */
export function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const str = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals) || "0";
  const fraction = str.slice(-decimals);
  return `${whole}.${fraction}`;
}
