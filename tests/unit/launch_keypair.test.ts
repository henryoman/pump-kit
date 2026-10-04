import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder } from "@solana/kit";
import { readLaunchKeypair } from "../../src/launch/keypair";

test("loads a Solana mint keypair and rejects malformed key files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pump-keypair-"));
  const path = join(directory, "mint.json");
  try {
    const seed = new Uint8Array(32).fill(7);
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const bytes = new Uint8Array(64);
    bytes.set(seed);
    bytes.set(getAddressEncoder().encode(signer.address), 32);
    await writeFile(path, JSON.stringify(Array.from(bytes)), { mode: 0o600 });
    expect((await readLaunchKeypair(path)).address).toBe(signer.address);
    for (const value of [{}, [], Array(32).fill(7), Array(64).fill(256), Array(64).fill(-1), Array(64).fill("7"), Array(64).fill(0.5)]) {
      await writeFile(path, JSON.stringify(value), { mode: 0o600 });
      await expect(readLaunchKeypair(path)).rejects.toThrow("Invalid Solana keypair file");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
