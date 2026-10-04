import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder } from "@solana/kit";

async function cli(args: string[]) {
  const child = Bun.spawn(["bun", "src/bin/pump-kit.ts", ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { output, error, code };
}

test("CLI validates portable configs and fails invalid commands before contacting RPC", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pump-cli-"));
  try {
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" }, firstBuy: { amount: "0.25" } }));
    const valid = await cli(["validate", path]);
    expect(valid.code).toBe(0);
    expect(JSON.parse(valid.output).config.firstBuy.amount).toBe("0.25");
    const run = await cli(["run", path]);
    expect(run.code).toBe(1);
    expect(run.error).toContain("requires --keypair");
    const invalid = await cli(["validate", path, "--unknown", "x"]);
    expect(invalid.code).toBe(1);
    expect(invalid.error).toContain("Invalid or duplicate option");
    expect((await cli(["--help"])).output).toContain("dry-run");
    const missingTable = await cli(["dry-run", path, "--keypair", "/missing-wallet.json", "--mint-keypair", "/missing-mint.json", "--rpc-url", "http://127.0.0.1:1"]);
    expect(missingTable.code).toBe(1);
    expect(missingTable.error).toContain("requires --lookup-table");
    const addressOnly = await cli(["dry-run", path, "--keypair", "/missing-wallet.json", "--mint-address", "So11111111111111111111111111111111111111112"]);
    expect(addressOnly.code).toBe(1);
    expect(addressOnly.error).toContain("requires --mint-keypair");
    const missingMint = await cli(["preview", path, "--signer-address", "So11111111111111111111111111111111111111112", "--rpc-url", "http://127.0.0.1:1"]);
    expect(missingMint.code).toBe(1);
    expect(missingMint.error).toContain("token addresses are never generated automatically");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI rejects a mint keypair that does not match the expected contract before RPC", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pump-cli-mint-"));
  try {
    const config = join(directory, "config.json");
    await writeFile(config, JSON.stringify({ schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" } }));
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const bytes = new Uint8Array(64);
    bytes.set(seed);
    bytes.set(getAddressEncoder().encode(signer.address), 32);
    const keypair = join(directory, "mint.json");
    await writeFile(keypair, JSON.stringify(Array.from(bytes)), { mode: 0o600 });
    const result = await cli(["preview", config, "--signer-address", signer.address,
      "--mint-keypair", keypair, "--mint-address", "So11111111111111111111111111111111111111112", "--rpc-url", "http://127.0.0.1:1"]);
    expect(result.code).toBe(1);
    expect(result.error).toContain("Mint keypair does not match --mint-address");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
