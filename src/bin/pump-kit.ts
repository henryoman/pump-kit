#!/usr/bin/env bun
import { loadLookupTable } from "../launch/lookup_table";
import { readFile } from "node:fs/promises";
import { address, createKeyPairSignerFromBytes, createNoopSigner, createSolanaRpc } from "@solana/kit";
import { createPump } from "../launch/session";
import { validateLaunchConfig } from "../launch/config";
import { createFileLaunchStore, readLaunchRecord } from "../launch/file_store";
import { reconcileLaunchRecord } from "../launch/reconcile";

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
--record <file>       Fresh durable record path; required for run
--lookup-table <a>    Existing active table; required for atomic dry-run

run simulates before submission. Existing record paths are never overwritten.
Config files contain token choices and amounts, never RPC credentials or keys.`);
    return;
  }
  const command = args.shift();
  if (!["validate", "preview", "dry-run", "run", "setup", "status"].includes(command!)) throw new Error("Unknown command");
  let configPath: string | undefined;
  const flags: Record<string, string> = {};
  const allowed = ["--rpc-url", "--websocket-url", "--keypair", "--signer-address", "--record", "--lookup-table"];
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
  let signer;
  if (flags["--keypair"]) {
    const bytes: unknown = JSON.parse(await readFile(flags["--keypair"], "utf8"));
    if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error("Invalid Solana keypair file");
    signer = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
  } else {
    if (!flags["--signer-address"]) throw new Error("preview requires --signer-address or --keypair");
    signer = createNoopSigner(address(flags["--signer-address"]));
  }
  const store = command === "run" ? createFileLaunchStore(flags["--record"]!) : undefined;
  const pump = createPump({ rpcUrl, websocketUrl: flags["--websocket-url"] });
  const tables = flags["--lookup-table"] ? { [flags["--lookup-table"]]: await loadLookupTable(createSolanaRpc(rpcUrl), flags["--lookup-table"]) } : undefined;
  const launch = await pump.launch.prepare(config, { signer, addressLookupTables: tables, saveRecord: store ? record => store.save(record) : undefined });
  print({ addresses: launch.addresses, preview: launch.preview });
  if (command === "preview") return;
  if (command === "run" || command === "setup") {
    await launch.setup();
    print({ addressLookupTables: launch.addressLookupTables });
    if (command === "setup") return;
  }
  const simulation = await launch.simulate();
  print({ simulation });
  if (simulation.value.err) throw new Error("Launch simulation failed; no transaction submitted");
  if (command === "run") print({ result: await launch.send(), record: launch.record });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
});
