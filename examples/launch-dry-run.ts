import { readFile } from "node:fs/promises";
import { createPump, loadLookupTable } from "../src/launch";
import { readLaunchKeypair } from "../src/launch/keypair";
import { address, createSolanaRpc } from "@solana/kit";

const [configPath, walletPath, mintPath, expectedMint, rpcUrl = "https://api.devnet.solana.com", table] = process.argv.slice(2);
if (!configPath || !walletPath || !mintPath || !expectedMint) {
  throw new Error("Usage: bun examples/launch-dry-run.ts <launch.json> <wallet.json> <mint.json> <expected-CA> [rpc-url] [lookup-table]");
}
const pump = createPump({ rpcUrl });
const config = pump.launch.validate(JSON.parse(await readFile(configPath, "utf8")));
if (config.firstBuy && !table) throw new Error("Atomic dry-run needs an existing lookup table; run CLI setup separately with the same mint keypair");
const [signer, mint] = await Promise.all([readLaunchKeypair(walletPath), readLaunchKeypair(mintPath)]);
if (mint.address !== address(expectedMint)) throw new Error("Mint keypair does not match the expected CA");
const tables = table ? { [table]: await loadLookupTable(createSolanaRpc(rpcUrl), table) } : undefined;
const launch = await pump.launch.prepare(config, { signer, mint, expectedMint, addressLookupTables: tables,
  priorityFees: { computeUnitLimit: 300000 } });
const simulation = await launch.simulate();
console.log(JSON.stringify({ dryRun: true, addresses: launch.addresses, preview: launch.preview, simulation },
  (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
if (simulation.value.err) process.exitCode = 1;
