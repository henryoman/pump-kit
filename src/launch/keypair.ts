import { readFile } from "node:fs/promises";
import { createKeyPairSignerFromBytes } from "@solana/kit";

/** Load a standard Solana 64-byte JSON keypair without logging its contents. */
export async function readLaunchKeypair(path: string) {
  const bytes: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("Invalid Solana keypair file");
  }
  return createKeyPairSignerFromBytes(new Uint8Array(bytes));
}
