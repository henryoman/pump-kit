import type { MaybeEncodedAccount } from "@solana/kit";

/** Only whole appended fields may be absent. Core fields and partial fields are required. */
export function normalizeProtocolAccount<TAddress extends string>(
  account: MaybeEncodedAccount<TAddress>,
  discriminator: Uint8Array,
  historicalSizes: readonly number[],
  currentSize: number,
): MaybeEncodedAccount<TAddress> {
  if (!account.exists) return account;
  const bytes = account.data;
  if (bytes.length < 8 || !discriminator.every((byte, index) => bytes[index] === byte)) {
    throw new Error("Invalid protocol account discriminator");
  }
  if (bytes.length >= currentSize) return account;
  if (!historicalSizes.includes(bytes.length)) {
    throw new Error(`Truncated protocol account: unsupported length ${bytes.length}`);
  }
  const data = new Uint8Array(currentSize);
  data.set(bytes);
  return { ...account, data };
}
