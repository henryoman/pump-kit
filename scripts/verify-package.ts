import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyLaunchDryRuns } from "./verify-launch";

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
  await writeFile(join(consumer, "verify.mjs"), `
import { curveBuy, decimalToRaw, createPump, resolveAmmTradingContext } from "pump-kit";
import { curveSell, createPump as simpleCreatePump } from "pump-kit/simple";
import { createPump as launchCreatePump, createV2, buyV2, sellV2 } from "pump-kit/launch";
import { createFileLaunchStore, readLaunchKeypair } from "pump-kit/launch/store";
import { generateKeyPairSigner } from "@solana/kit";
if ([launchCreatePump, createV2, buyV2, sellV2, createFileLaunchStore, readLaunchKeypair].some(value => typeof value !== "function")) throw new Error("Missing focused launch exports");
if (typeof createPump !== "function" || typeof simpleCreatePump !== "function") throw new Error("Missing session exports");
if (typeof resolveAmmTradingContext !== "function") throw new Error("Missing retained AMM context resolver");
if (typeof curveBuy !== "function" || typeof curveSell !== "function") throw new Error("Missing exports");
if (decimalToRaw("0.25", 9) !== 250000000n) throw new Error("Incorrect exact amount parser");
const user = await generateKeyPairSigner();
const mint = await generateKeyPairSigner();
const instruction = await createV2({ user, mint, name: "Example", symbol: "EX", uri: "ipfs://example" });
if (instruction.accounts[0].address !== mint.address) throw new Error("Packed SDK mint passthrough failed");
for (const legacy of ["@solana/web3.js", "@solana/spl-token"]) {
  let installed = false;
  try { await import(legacy); installed = true; } catch {}
  if (installed) throw new Error("Legacy runtime dependency installed: " + legacy);
}
console.log("Packed package imports passed without legacy Solana dependencies");
`);
  await run(["bun", "run", "verify.mjs"], consumer);
  const node = Bun.which("node");
  if (node) await run([node, "verify.mjs"], consumer);
  await writeFile(join(consumer, "verify-types.ts"), `
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { createPump, type LaunchConfig } from "pump-kit/launch";
import { createFileLaunchStore, readLaunchKeypair } from "pump-kit/launch/store";
const rpc = createSolanaRpc("https://api.devnet.solana.com");
const config: LaunchConfig = { schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" } };
async function prepare(signer: TransactionSigner, mint: TransactionSigner) {
  return createPump({ rpc }).launch.prepare(config, { signer, mint, expectedMint: mint.address,
    priorityFees: { computeUnitLimit: 300000, computeUnitPriceMicroLamports: 5000n },
    saveRecord: createFileLaunchStore("launch.json").save });
}
void prepare;
void readLaunchKeypair;
import { curveBuy } from "pump-kit";
import { curveSell } from "pump-kit/simple";
void curveBuy;
void curveSell;
`);
  await run([join(root, "node_modules/.bin/tsc"), "--noEmit", "--strict", "--skipLibCheck",
    "--moduleResolution", "bundler", "--module", "esnext", "--target", "es2022", "verify-types.ts"], consumer);
  await writeFile(join(consumer, "launch.json"), JSON.stringify({
    schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" },
  }));
  await run(["bun", "node_modules/.bin/pump-kit", "validate", "launch.json"], consumer);
  await run(["bun", "node_modules/.bin/pump-kit", "--version"], consumer);
  const validatorUrl = process.env.PUMP_PACKAGE_VALIDATOR_RPC;
  if (validatorUrl) {
    const { createPump: packedCreatePump } = await import(join(consumer, "node_modules/pump-kit/dist/launch.js"));
    await verifyLaunchDryRuns({ rpcUrl: validatorUrl, cliCommand: ["bun", "node_modules/.bin/pump-kit"],
      cwd: consumer, createPump: packedCreatePump });
    console.log("Installed SDK and CLI dry-runs, exact mint passthrough, failure guards, and signed launches passed");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
