#!/usr/bin/env bun
import { loadLookupTable } from "../launch/lookup_table";
import { readFile } from "node:fs/promises";
import { address, createNoopSigner, createSolanaRpc } from "@solana/kit";
import { readLaunchKeypair } from "../launch/keypair";
import { createPump } from "../launch/session";
import { validateLaunchConfig } from "../launch/config";
import { createFileLaunchStore, readLaunchRecord } from "../launch/file_store";
import { reconcileLaunchRecord } from "../launch/reconcile";
import type { LaunchRecord } from "../launch/session";
import type { SimulationResponse, TransactionResult } from "../utils/transaction";

function print(value: unknown) {
  console.log(JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? nested.toString() : nested, 2));
}

async function main(args: string[]) {
  if (args.includes("--version") || args.includes("-v")) {
    const version = process.env.PUMP_KIT_VERSION ?? (await import("../../package.json")).version;
    console.log(version);
    return;
  }
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(`pump-kit validate|preview|dry-run|run|setup <config.json> [options]
pump-kit status --record <launch.json> [--rpc-url <url>]

--rpc-url <url>       RPC endpoint; defaults to devnet
--websocket-url <url> Optional subscription endpoint
--keypair <file>      Solana JSON keypair; required for dry-run and run
--signer-address <a>  Address only; sufficient for preview
--mint-keypair <file> Required mint keypair for setup, dry-run, and run
--mint-address <a>   Expected mint address; address-only mint is allowed for preview
--record <file>       Fresh durable record path; required for run
--lookup-table <a>    Existing active table; required for atomic dry-run

dry-run only simulates; it never submits or creates a lookup table.
run simulates before submission. Existing record paths are never overwritten.
Config files contain token choices and amounts, never RPC credentials or keys.`);
    return;
  }
  const command = args.shift();
  if (!["validate", "preview", "dry-run", "run", "setup", "status"].includes(command!)) throw new Error("Unknown command");
  let configPath: string | undefined;
  const flags: Record<string, string> = {};
  const allowed = ["--rpc-url", "--websocket-url", "--keypair", "--signer-address", "--mint-keypair", "--mint-address", "--record", "--lookup-table"];
  while (args.length) {
    const item = args.shift()!;
    if (item.startsWith("--")) {
      if (!allowed.includes(item) || flags[item] !== undefined) throw new Error(`Invalid or duplicate option: ${item}`);
      const value = args.shift();
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
      flags[item] = value;
    } else {
      if (configPath) throw new Error("Unexpected positional argument");
      configPath = item;
    }
  }
  const rpcUrl = flags["--rpc-url"] ?? process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
  if (command === "status") {
    if (!flags["--record"] || configPath) throw new Error("status requires --record and no config");
    const record = await readLaunchRecord(flags["--record"]);
    print(await reconcileLaunchRecord(createSolanaRpc(rpcUrl), record));
    return;
  }
  if (!configPath) throw new Error("A JSON config path is required");
  const config = validateLaunchConfig(JSON.parse(await readFile(configPath, "utf8")));
  if (command === "validate") { print({ valid: true, config }); return; }
  if (flags["--keypair"] && flags["--signer-address"]) throw new Error("Choose either --keypair or --signer-address");
  if (command !== "preview" && !flags["--keypair"]) throw new Error(`${command} requires --keypair`);
  if (command === "run" && !flags["--record"]) throw new Error("run requires a fresh --record path");
  if (!flags["--mint-keypair"] && command !== "preview") {
    throw new Error("A launch mint requires --mint-keypair to sign; --mint-address alone is only valid for preview");
  }
  if (command === "preview" && !flags["--mint-keypair"] && !flags["--mint-address"]) {
    throw new Error("preview requires --mint-keypair or --mint-address; token addresses are never generated automatically");
  }
  if (command === "dry-run" && config.firstBuy && !flags["--lookup-table"]) {
    throw new Error("Atomic dry-run requires --lookup-table; perform setup separately with the same --mint-keypair");
  }
  let signer;
  if (flags["--keypair"]) {
    signer = await readLaunchKeypair(flags["--keypair"]);
  } else {
    if (!flags["--signer-address"]) throw new Error("preview requires --signer-address or --keypair");
    signer = createNoopSigner(address(flags["--signer-address"]));
  }
  const expectedMint = flags["--mint-address"] ? address(flags["--mint-address"]) : undefined;
  const mint = flags["--mint-keypair"] ? await readLaunchKeypair(flags["--mint-keypair"])
    : createNoopSigner(expectedMint!);
  if (expectedMint && mint?.address !== expectedMint) throw new Error("Mint keypair does not match --mint-address");
  const store = command === "run" ? createFileLaunchStore(flags["--record"]!) : undefined;
  const pump = createPump({ rpcUrl, websocketUrl: flags["--websocket-url"] });
  const tables = flags["--lookup-table"] ? { [flags["--lookup-table"]]: await loadLookupTable(createSolanaRpc(rpcUrl), flags["--lookup-table"]) } : undefined;
  const launch = await pump.launch.prepare(config, { signer, mint, expectedMint, addressLookupTables: tables, saveRecord: store ? record => store.save(record) : undefined });
  const output: {
    addresses: typeof launch.addresses;
    preview: typeof launch.preview;
    dryRun: boolean;
    addressLookupTables?: typeof launch.addressLookupTables;
    simulation?: SimulationResponse;
    result?: TransactionResult;
    record?: LaunchRecord;
  } = { addresses: launch.addresses, preview: launch.preview, dryRun: command === "dry-run" };
  // One JSON result per command makes the mint and simulation machine-readable,
  // including program failures. Only the run branch can submit a launch.
  try {
    if (command === "preview") return;
    if (command === "run" || command === "setup") {
      await launch.setup();
      output.addressLookupTables = launch.addressLookupTables;
      if (command === "setup") return;
    }
    output.simulation = await launch.simulate();
    if (output.simulation.value.err) throw new Error("Launch simulation failed; no launch transaction submitted");
    if (command === "run") output.result = await launch.send();
  } finally {
    if (command === "run") output.record = launch.record;
    print(output);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
});
