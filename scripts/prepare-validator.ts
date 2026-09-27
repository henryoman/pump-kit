import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { address, getProgramDerivedAddress } from "@solana/kit";
import { globalPda, feeConfigPda, globalVolumeAccumulatorPda } from "../src/pda/pump";
import { globalConfigPda, ammFeeConfigPda, globalVolumeAccumulatorPda as ammVolume } from "../src/pda/pumpAmm";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, FEE_PROGRAM_ID } from "../src/config/addresses";
import { MAYHEM_PROGRAM_ID } from "../src/clients/create_v2";

const directory = resolve(process.argv[2] ?? ".validator/fixtures");
await mkdir(directory, { recursive: true });
const programs = [["pump", PUMP_PROGRAM_ID], ["amm", PUMP_AMM_PROGRAM_ID], ["fees", FEE_PROGRAM_ID], ["mayhem", MAYHEM_PROGRAM_ID]] as const;
async function run(args: string[]) {
  const child = Bun.spawn(["solana", ...args], { stdout: "ignore", stderr: "inherit" });
  if (await child.exited) throw new Error(`Fixture download failed: ${args[0]}`);
}
for (const [name, key] of programs) {
  await run(["program", "dump", "--url", "devnet", key, join(directory, `${name}.so`)]);
}
const accounts = [
  ["global", await globalPda()], ["fees", await feeConfigPda()], ["amm-global", await globalConfigPda()],
  ["amm-fees", await ammFeeConfigPda()], ["global-volume", await globalVolumeAccumulatorPda()],
  ["amm-global-volume", await ammVolume()], ["wsol", address("So11111111111111111111111111111111111111112")],
];
for (const seed of ["global-params", "sol-vault"]) {
  accounts.push([seed, (await getProgramDerivedAddress({ programAddress: MAYHEM_PROGRAM_ID, seeds: [new TextEncoder().encode(seed)] }))[0]]);
}
for (const [name, key] of accounts) {
  // CLI writes u64 fields exactly; parsing through JS numbers would lose precision.
  await run(["account", "--url", "devnet", key!, "--output", "json", "--output-file", join(directory, `${name}.json`)]);
}
const manifest = { source: "devnet", downloadedAt: new Date().toISOString(), programs: await Promise.all(programs.map(async ([name, program]) => ({ program, filename: `${name}.so`, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(join(directory, `${name}.so`)).arrayBuffer()).digest("hex") }))) };
await Bun.write(join(directory, "manifest.txt"), JSON.stringify(manifest, null, 2));
console.log(`Downloaded devnet programs and configuration accounts to ${directory}`);
console.log(["solana-test-validator", "--ledger", resolve(".validator/ledger"), "--rpc-port", "19899", "--bind-address", "127.0.0.1", "--dynamic-port-range", "19910-19940", ...programs.flatMap(([name, key]) => ["--bpf-program", key, join(directory, `${name}.so`)]), "--account-dir", directory, "--quiet"].join(" "));
