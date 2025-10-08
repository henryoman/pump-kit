/**
 * Slippage and amount calculation helpers.
 * All calculations use basis points (bps) where 100 bps = 1%.
 */

/**
 * Convert percentage to basis points.
 * @param p Percentage (0-100)
 * @returns Basis points (0-10000)
 */
export function pctToBps(p: number): number {
  if (p < 0 || p > 100) throw new Error("percent out of range");
  return Math.round(p * 100);
}

/**
 * Add slippage to an amount (for max input scenarios).
 * @param amount Base amount
 * @param slippageBps Slippage in basis points (e.g., 50 = 0.5%)
 * @returns Amount increased by slippage
 */
export function addSlippage(amount: bigint, slippageBps: number): bigint {
  return amount + (amount * BigInt(slippageBps)) / 10_000n;
}

/**
 * Subtract slippage from an amount (for min output scenarios).
 * @param amount Base amount
 * @param slippageBps Slippage in basis points (e.g., 50 = 0.5%)
 * @returns Amount decreased by slippage
 */
export function subSlippage(amount: bigint, slippageBps: number): bigint {
  return amount - (amount * BigInt(slippageBps)) / 10_000n;
}

// Legacy aliases for compatibility
export const computeSlippageOut = subSlippage;
export const computeSlippageIn = addSlippage;
