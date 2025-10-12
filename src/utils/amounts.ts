const LAMPORTS_PER_SOL = 1_000_000_000n;

export function solToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol < 0) {
    throw new Error("SOL value must be a non-negative finite number");
  }
  return BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

export function tokensToRaw(amount: number, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer");
  }
  const factor = BigInt(10) ** BigInt(decimals);
  return BigInt(Math.round(amount * 10 ** decimals));
}

export function rawToTokens(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

