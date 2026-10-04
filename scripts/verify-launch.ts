import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { address, createSolanaRpc, createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder } from "@solana/kit";
import { createPump } from "../src/launch/session";
import { fetchGlobal } from "../src/pumpsdk/generated/accounts/global";
import { fetchBondingCurve } from "../src/pumpsdk/generated/accounts/bondingCurve";
import { globalPda } from "../src/pda/pump";
import { TOKEN_2022_PROGRAM_ID, PUMP_PROGRAM_ID } from "../src/config/addresses";
import { getCreateV2InstructionDataDecoder } from "../src/pumpsdk/generated/instructions/createV2";

/** Exercise real signed simulations and CLI passthrough exclusively on a local validator. */
export async function verifyLaunchDryRuns(options: {
  rpcUrl: string; cliCommand: string[]; cwd: string; createPump?: typeof createPump; exampleCommand?: string[];
}) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(options.rpcUrl).hostname)) {
    throw new Error("Launch verification requires a local validator");
  }
  const directory = await mkdtemp(join(tmpdir(), "pump-kit-dry-run-"));
  const rpc = createSolanaRpc(options.rpcUrl);
  const pump = (options.createPump ?? createPump)({ rpcUrl: options.rpcUrl });
  async function keypair(filename: string) {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const bytes = new Uint8Array(64);
    bytes.set(seed);
    bytes.set(getAddressEncoder().encode(signer.address), 32);
    const path = join(directory, filename);
    await writeFile(path, JSON.stringify(Array.from(bytes)), { mode: 0o600 });
    return { signer, path };
  }
  async function fund(recipient: string, lamports: bigint) {
    const signature = await rpc.requestAirdrop(address(recipient), lamports as never).send();
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
      if (status?.err) throw new Error("Local funding failed");
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
      await Bun.sleep(200);
    }
    throw new Error("Local funding did not confirm");
  }
  async function cli(args: string[], expectedCode = 0, command = options.cliCommand) {
    const child = Bun.spawn([...command, ...args], {
      cwd: options.cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, SOLANA_RPC: options.rpcUrl },
    });
    const timeout = setTimeout(() => child.kill(), 60_000);
    try {
      const [output, error, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
      ]);
      assert.equal(code, expectedCode, error || output);
      return { value: output.trim() ? JSON.parse(output) : undefined, error };
    } finally { clearTimeout(timeout); }
  }
  async function snapshot(addresses: { mint: string; bondingCurve: string; userAta: string }, wallet: string) {
    return (await rpc.getMultipleAccounts([wallet, addresses.mint, addresses.bondingCurve, addresses.userAta].map(address),
      { encoding: "base64", commitment: "confirmed" }).send()).value;
  }
  async function createdMint(mint: string, curve: string, creator: string) {
    const account = (await rpc.getAccountInfo(address(mint), { encoding: "base64", commitment: "confirmed" }).send()).value;
    assert(account);
    assert.equal(account.owner, TOKEN_2022_PROGRAM_ID);
    const data = Buffer.from(account.data[0], "base64");
    assert.equal(data[44], 6); // SPL mint decimals.
    assert.equal(data.readBigUInt64LE(36), 1000000000000000n);
    const state = (await fetchBondingCurve(rpc, address(curve), { commitment: "confirmed" })).data;
    assert.equal(state.creator, creator);
  }
  try {
    const wallet = await keypair("wallet.json");
    const creator = await keypair("creator.json");
    const global = (await fetchGlobal(rpc, await globalPda())).data;
    await fund(wallet.signer.address, 2_000_000_000n);
    for (const recipient of [global.feeRecipient, global.buybackFeeRecipients[0]!]) await fund(recipient, 1_000_000_000n);
    const config = { schemaVersion: 1, quote: "SOL", token: { name: "Dry Run Example", symbol: "DRY", metadataUri: "ipfs://dry-run-example" },
      creatorFees: { recipient: creator.signer.address } };
    const sdkMint = await keypair("sdk-mint.json");
    const session = await pump.launch.prepare(config, { signer: wallet.signer, mint: sdkMint.signer,
      expectedMint: sdkMint.signer.address, priorityFees: { computeUnitLimit: 300000 } });
    assert.equal(session.addresses.mint, sdkMint.signer.address);
    const creation = session.instructions.find(ix => ix.programAddress === PUMP_PROGRAM_ID)!;
    assert.equal(creation.accounts![0]!.address, sdkMint.signer.address);
    const args = getCreateV2InstructionDataDecoder().decode(creation.data!);
    assert.equal(args.name, config.token.name);
    assert.equal(args.symbol, config.token.symbol);
    assert.equal(args.uri, config.token.metadataUri);
    assert.equal(args.creator, creator.signer.address);
    const before = await snapshot(session.addresses, wallet.signer.address);
    const simulation = await session.simulate();
    assert.equal(simulation.value.err, null);
    assert(simulation.value.logs?.some(log => log.includes("Instruction: CreateV2")));
    assert.deepEqual(await snapshot(session.addresses, wallet.signer.address), before);
    assert.equal(session.record.status, "prepared");
    await session.send({ abortSignal: AbortSignal.timeout(45_000) });
    await createdMint(sdkMint.signer.address, session.addresses.bondingCurve, creator.signer.address);
    console.log("SDK dry-run preserved chain state; send created the exact supplied mint and creator");

    const configPath = join(directory, "launch.json");
    await writeFile(configPath, JSON.stringify(config));
    const cliMint = await keypair("cli-mint.json");
    const flags = ["--rpc-url", options.rpcUrl, "--keypair", wallet.path, "--mint-keypair", cliMint.path, "--mint-address", cliMint.signer.address];
    const preview = (await cli(["preview", configPath, ...flags])).value;
    assert.equal(preview.addresses.mint, cliMint.signer.address);
    const cliBefore = await snapshot(preview.addresses, wallet.signer.address);
    const dryRun = (await cli(["dry-run", configPath, ...flags])).value;
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.addresses.mint, cliMint.signer.address);
    assert.equal(dryRun.simulation.value.err, null);
    assert.equal(dryRun.result, undefined);
    assert.deepEqual(await snapshot(preview.addresses, wallet.signer.address), cliBefore);
    if (options.exampleCommand) {
      const example = (await cli([configPath, wallet.path, cliMint.path, cliMint.signer.address, options.rpcUrl], 0,
        options.exampleCommand)).value;
      assert.equal(example.addresses.mint, cliMint.signer.address);
      assert.equal(example.simulation.value.err, null);
      assert.deepEqual(await snapshot(preview.addresses, wallet.signer.address), cliBefore);
      console.log("Executable bot SDK example dry-ran the supplied CA without changing chain state");
    }
    const recordPath = join(directory, "launch-record.json");
    const launched = (await cli(["run", configPath, ...flags, "--record", recordPath])).value;
    assert.equal(launched.addresses.mint, cliMint.signer.address);
    assert.equal(launched.record.status, "confirmed");
    assert.equal((await Bun.file(recordPath).json()).mint, cliMint.signer.address);
    await createdMint(cliMint.signer.address, preview.addresses.bondingCurve, creator.signer.address);
    const existing = await snapshot(preview.addresses, wallet.signer.address);
    const rejected = await cli(["dry-run", configPath, ...flags], 1);
    assert.notEqual(rejected.value.simulation.value.err, null);
    assert.match(rejected.error, /simulation failed/);
    assert.deepEqual(await snapshot(preview.addresses, wallet.signer.address), existing);
    const failedRun = await cli(["run", configPath, ...flags, "--record", join(directory, "failed.json")], 1);
    assert.notEqual(failedRun.value.simulation.value.err, null);
    assert.equal(failedRun.value.record.status, "prepared");
    assert.equal(failedRun.value.record.signature, undefined);
    assert.deepEqual(await snapshot(preview.addresses, wallet.signer.address), existing);
    console.log("CLI create-only dry-run and simulation failure preserved state; exact CA persisted after run");

    const atomicMint = await keypair("atomic-mint.json");
    await writeFile(configPath, JSON.stringify({ ...config, firstBuy: { amount: "0.01", slippageBps: 100 } }));
    const atomicFlags = ["--rpc-url", options.rpcUrl, "--keypair", wallet.path, "--mint-keypair", atomicMint.path, "--mint-address", atomicMint.signer.address];
    const noTableBalance = (await rpc.getBalance(wallet.signer.address).send()).value;
    const noTable = await cli(["dry-run", configPath, ...atomicFlags], 1);
    assert.match(noTable.error, /requires --lookup-table/);
    assert.equal((await rpc.getBalance(wallet.signer.address).send()).value, noTableBalance);
    const setup = (await cli(["setup", configPath, ...atomicFlags])).value;
    const table = Object.keys(setup.addressLookupTables)[0];
    assert(table);
    assert.equal(setup.addresses.mint, atomicMint.signer.address);
    assert.equal((await rpc.getAccountInfo(atomicMint.signer.address).send()).value, null);
    const atomicBefore = await snapshot(setup.addresses, wallet.signer.address);
    const atomicArgs = [...atomicFlags, "--lookup-table", table];
    const atomicDryRun = (await cli(["dry-run", configPath, ...atomicArgs])).value;
    assert.equal(atomicDryRun.addresses.mint, atomicMint.signer.address);
    assert.equal(atomicDryRun.simulation.value.err, null);
    assert.deepEqual(await snapshot(setup.addresses, wallet.signer.address), atomicBefore);
    const atomicRun = (await cli(["run", configPath, ...atomicArgs, "--record", join(directory, "atomic-record.json")])).value;
    assert.equal(atomicRun.record.status, "confirmed");
    assert.equal(atomicRun.record.mint, atomicMint.signer.address);
    await createdMint(atomicMint.signer.address, setup.addresses.bondingCurve, creator.signer.address);
    const balance = (await rpc.getTokenAccountBalance(address(setup.addresses.userAta)).send()).value.amount;
    assert(BigInt(balance) >= BigInt(atomicRun.preview.firstBuy.minTokenOutputRaw));
    console.log("CLI atomic setup, dry-run, and run used the same CA; dry-run changed no accounts or SOL");
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (import.meta.main) {
  await verifyLaunchDryRuns({ rpcUrl: process.env.PUMP_VALIDATOR_RPC ?? "http://127.0.0.1:19899",
    cliCommand: ["bun", "src/bin/pump-kit.ts"], exampleCommand: ["bun", "examples/launch-dry-run.ts"], cwd: process.cwd() });
}
