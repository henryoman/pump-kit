#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, FEE_PROGRAM_ID } from "../src/config/addresses";

const repository = "pump-fun/pump-public-docs";
const sources = [
  { file: "pumpfun.idl.json", upstream: "pump.json", address: PUMP_PROGRAM_ID },
  { file: "pumpswap.idl.json", upstream: "pump_amm.json", address: PUMP_AMM_PROGRAM_ID },
  { file: "pumpfees.idl.json", upstream: "pump_fees.json", address: FEE_PROGRAM_ID },
];

async function download(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--check")) throw new Error("Usage: bun run scripts/update-idls.ts [--check]");
  const check = args.includes("--check");
  const { sha: commit } = JSON.parse(await download(`https://api.github.com/repos/${repository}/commits/main`));
  if (typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid upstream commit");
  // Fetch every program from one immutable revision and validate before writing.
  const snapshots = await Promise.all(sources.map(async source => {
    const url = `https://raw.githubusercontent.com/${repository}/${commit}/idl/${source.upstream}`;
    const content = await download(url);
    const idl = JSON.parse(content);
    if (idl.address !== source.address || !Array.isArray(idl.instructions) || !Array.isArray(idl.types)) {
      throw new Error(`Invalid IDL for ${source.file}`);
    }
    return { ...source, content, url, sha256: createHash("sha256").update(content).digest("hex") };
  }));
  const manifest = JSON.stringify({ repository, commit,
    files: snapshots.map(({ file, url, sha256 }) => ({ file, url, sha256 })),
  }, null, 2) + "\n";
  if (check) {
    for (const snapshot of snapshots) {
      if (await Bun.file(`idl/${snapshot.file}`).text() !== snapshot.content) {
        throw new Error(`${snapshot.file} differs from upstream; run bun run idl:update`);
      }
    }
    if (await Bun.file("idl/manifest.json").text() !== manifest) {
      throw new Error("IDL provenance is stale; run bun run idl:update");
    }
  } else {
    for (const snapshot of snapshots) await Bun.write(`idl/${snapshot.file}`, snapshot.content);
    await Bun.write("idl/manifest.json", manifest);
  }
  console.log(`All three IDLs ${check ? "verified at" : "synced to"} ${repository}@${commit}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
