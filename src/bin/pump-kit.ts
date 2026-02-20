#!/usr/bin/env bun

import { readFileSync } from "node:fs";

function readVersion(): string {
  const fromEnv = process.env.PUMP_KIT_VERSION;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  try {
    const pkgUrl = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

const version = readVersion();
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(version);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log("pump-kit CLI");
  console.log("Usage: pump-kit [--version]");
  process.exit(0);
}

console.log(`pump-kit ${version}`);
console.log("Library package installed. Use the SDK from TypeScript/JavaScript imports.");
