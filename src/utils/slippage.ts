/**
 * Slippage calculation utilities.
 * All calculations use basis points (bps) where 100 bps = 1%.
 */

export const DEFAULT_SLIPPAGE_BPS = 50; // 0.50%

/**
 * Add slippage to an amount (for max input scenarios).
 * @param x Base amount
 * @param bps Slippage in basis points (default: 50 = 0.5%)
 * @returns Amount increased by slippage
 */
export const addSlippage = (x: bigint, bps = DEFAULT_SLIPPAGE_BPS): bigint => 
  x + (x * BigInt(bps)) / 10_000n;

/**
 * Subtract slippage from an amount (for min output scenarios).
 * @param x Base amount
 * @param bps Slippage in basis points (default: 50 = 0.5%)
 * @returns Amount decreased by slippage
 */
export const subSlippage = (x: bigint, bps = DEFAULT_SLIPPAGE_BPS): bigint => 
  x - (x * BigInt(bps)) / 10_000n;

/**
 * Validate slippage basis points.
 * @param bps Basis points to validate
 * @throws Error if bps is negative or > 10000 (100%)
 */
export function validateSlippage(bps: number): void {
  if (bps < 0) throw new Error("Slippage cannot be negative");
  if (bps > 10_000) throw new Error("Slippage cannot exceed 100%");
}

/**
 * Convert percentage to basis points.
 * @param percent Percentage (0-100)
 * @returns Basis points (0-10000)
 */
export function percentToBps(percent: number): number {
  if (percent < 0 || percent > 100) throw new Error("Percent must be between 0 and 100");
  return Math.round(percent * 100);
}

/**
 * Convert basis points to percentage.
 * @param bps Basis points (0-10000)
 * @returns Percentage (0-100)
 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}
