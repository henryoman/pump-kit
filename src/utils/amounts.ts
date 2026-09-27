const LAMPORTS_PER_SOL = 1_000_000_000n;

function validateDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Token decimals must be an integer between 0 and 255");
  }
}

/** Parse an unsigned decimal string exactly, rejecting sub-unit precision. */
export function decimalToRaw(amount: string, decimals: number): bigint {
  validateDecimals(decimals);
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error("Amount must be an unsigned decimal string");
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
    throw new Error("Amount exceeds token precision");
  }
  return BigInt(whole!) * 10n ** BigInt(decimals)
    + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
}

export function solToLamports(sol: number | string): bigint {
  if (typeof sol === "string") return decimalToRaw(sol, 9);
  if (!Number.isFinite(sol) || sol < 0) {
    throw new Error("SOL value must be a non-negative finite number");
  }
  const raw = Math.round(sol * Number(LAMPORTS_PER_SOL));
  if (!Number.isSafeInteger(raw)) throw new Error("Use a decimal string for large SOL amounts");
  return BigInt(raw);
}

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

export function tokensToRaw(amount: number | string, decimals: number): bigint {
  validateDecimals(decimals);
  if (typeof amount === "string") return decimalToRaw(amount, decimals);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Token amount must be a non-negative finite number");
  }
  const raw = Math.round(amount * 10 ** decimals);
  if (!Number.isSafeInteger(raw)) throw new Error("Use a decimal string for large token amounts");
  return BigInt(raw);
}

/** Parse a trade input and ensure it fits the protocol's unsigned 64-bit amount. */
export function positiveAmountToRaw(amount: number | string, decimals: number, field: string): bigint {
  const raw = tokensToRaw(amount, decimals);
  if (raw <= 0n || raw > 18446744073709551615n) {
    throw new Error(`${field} must be a positive u64 amount`);
  }
  return raw;
}

export function rawToTokens(raw: bigint, decimals: number): number {
  validateDecimals(decimals);
  return Number(raw) / 10 ** decimals;
}
