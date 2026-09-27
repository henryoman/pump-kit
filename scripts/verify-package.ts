import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSolanaRpc, createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder } from "@solana/kit";

const root = process.cwd();
const temporary = await mkdtemp(join(tmpdir(), "pump-kit-package-"));
async function run(command: string[], cwd: string) {
  const result = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await result.exited !== 0) throw new Error(`Command failed: ${command.join(" ")}`);
}

try {
  const tarball = join(temporary, "pump-kit.tgz");
  await run(["bun", "pm", "pack", "--ignore-scripts", "--filename", tarball, "--quiet"], root);
  const consumer = join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: { "pump-kit": `file:${tarball}` },
  }));
  await run(["bun", "install", "--ignore-scripts"], consumer);
  await writeFile(join(consumer, "verify.ts"), `
import { curveBuy, decimalToRaw, createPump, resolveAmmTradingContext } from "pump-kit";
import { curveSell, createPump as simpleCreatePump } from "pump-kit/simple";
if (typeof createPump !== "function" || typeof simpleCreatePump !== "function") throw new Error("Missing session exports");
if (typeof resolveAmmTradingContext !== "function") throw new Error("Missing retained AMM context resolver");
if (typeof curveBuy !== "function" || typeof curveSell !== "function") throw new Error("Missing exports");
if (decimalToRaw("0.25", 9) !== 250000000n) throw new Error("Incorrect exact amount parser");
for (const legacy of ["@solana/web3.js", "@solana/spl-token"]) {
  let installed = false;
  try { await import(legacy); installed = true; } catch {}
  if (installed) throw new Error("Legacy runtime dependency installed: " + legacy);
}
console.log("Packed package imports passed without legacy Solana dependencies");
`);
  await run(["bun", "run", "verify.ts"], consumer);
  await writeFile(join(consumer, "launch.json"), JSON.stringify({
    schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" },
  }));
  await run(["bun", "node_modules/.bin/pump-kit", "validate", "launch.json"], consumer);
  await run(["bun", "node_modules/.bin/pump-kit", "--version"], consumer);
  const validatorUrl = process.env.PUMP_PACKAGE_VALIDATOR_RPC;
  if (validatorUrl) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(validatorUrl).hostname)) {
      throw new Error("Installed CLI transaction verification requires a local validator");
    }
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const wallet = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const secretKey = new Uint8Array(64);
    secretKey.set(seed);
    secretKey.set(getAddressEncoder().encode(wallet.address), 32);
    const keypairPath = join(temporary, "wallet.json");
    await writeFile(keypairPath, JSON.stringify(Array.from(secretKey)), { mode: 0o600 });
    const rpc = createSolanaRpc(validatorUrl);
    const airdrop = await rpc.requestAirdrop(wallet.address, 1000000000n as any).send();
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = (await rpc.getSignatureStatuses([airdrop]).send()).value[0];
      if (status?.err) throw new Error("Installed CLI wallet funding failed");
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
      if (attempt === 99) throw new Error("Installed CLI wallet funding did not confirm");
      await Bun.sleep(200);
    }
    const flags = ["--rpc-url", validatorUrl, "--keypair", keypairPath];
    await run(["bun", "node_modules/.bin/pump-kit", "preview", "launch.json", ...flags], consumer);
    await run(["bun", "node_modules/.bin/pump-kit", "dry-run", "launch.json", ...flags], consumer);
    const recordPath = join(temporary, "launch-record.json");
    await run(["bun", "node_modules/.bin/pump-kit", "run", "launch.json", ...flags, "--record", recordPath], consumer);
    const record = await Bun.file(recordPath).json();
    if (record.status !== "confirmed" || !record.mint || !record.signature) throw new Error("Installed CLI failed to persist confirmation");
    await run(["bun", "node_modules/.bin/pump-kit", "status", "--rpc-url", validatorUrl, "--record", recordPath], consumer);
    console.log("Installed CLI signed local launch and persistence passed");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
