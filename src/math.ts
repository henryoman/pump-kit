export function pctToBps(p: number): number {
  if (p < 0 || p > 100) throw new Error("percent out of range");
  return Math.round(p * 100);
}

// Slippage helpers: compute amounts with slippage tolerance
export const computeSlippageOut = (amountIn: bigint, bps: number) =>
  (amountIn * BigInt(10_000 - bps)) / 10_000n;

export const computeSlippageIn = (amountOut: bigint, bps: number) =>
  (amountOut * 10_000n) / BigInt(10_000 - bps);
