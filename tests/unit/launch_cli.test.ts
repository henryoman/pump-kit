import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  } finally { await rm(directory, { recursive: true, force: true }); }
});
