import { strict as assert } from "node:assert";
import { address, createSolanaRpc, generateKeyPairSigner, signature } from "@solana/kit";
import { createPump } from "../src/launch/session";
import { buy, sell } from "../src/swap";
import { sendAndConfirmTransaction, simulateTransaction } from "../src/utils/transaction";
import { findAssociatedTokenPda } from "../src/pda/ata";
import { TOKEN_2022_PROGRAM_ID } from "../src/config/addresses";

const rpcUrl = process.env.PUMP_VALIDATOR_RPC ?? "http://127.0.0.1:19899";
const endpoint = new URL(rpcUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) throw new Error("Validator verification requires a local RPC");
const rpc = createSolanaRpc(rpcUrl);
const subscriptionUrl = new URL(rpcUrl);
subscriptionUrl.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
subscriptionUrl.port = String(Number(endpoint.port || 80) + 1);
const subscriptions = (await import("@solana/kit")).createSolanaRpcSubscriptions(subscriptionUrl.toString());
const pump = createPump({ rpcUrl, rpc });
const signer = await generateKeyPairSigner();
const airdrop = await rpc.requestAirdrop(signer.address, 100000000000n as any).send();
for (let attempt = 0; attempt < 60; attempt++) {
  const status = (await rpc.getSignatureStatuses([airdrop]).send()).value[0];
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
  if (attempt === 59) throw new Error("Local airdrop did not confirm");
  await Bun.sleep(200);
}
const global = (await (await import("../src/pumpsdk/generated/accounts/global")).fetchGlobal(rpc, await (await import("../src/pda/pump")).globalPda())).data;
for (const recipient of [global.feeRecipient, global.buybackFeeRecipients[0]!]) {
  await rpc.requestAirdrop(recipient, 1000000000n as any).send();
}
await Bun.sleep(600);
const baseConfig = { schemaVersion: 1, quote: "SOL", token: { name: "Validator Example", symbol: "TEST", metadataUri: "ipfs://validator-example" } };
const createOnly = await pump.launch.prepare(baseConfig, { signer });
const simulation = await createOnly.simulate();
assert.equal(simulation.value.err, null, JSON.stringify(simulation.value, (_k, v) => typeof v === "bigint" ? String(v) : v));
const created = await createOnly.send({ abortSignal: AbortSignal.timeout(45000) });
console.log("Create-only confirmed", created.signature);
const launch = await pump.launch.prepare({ ...baseConfig, firstBuy: { amount: "0.01", slippageBps: 100 } }, { signer, saveRecord: async record => { if (record.signature) { await Bun.write("/tmp/pump-kit-validator-last-record.json", JSON.stringify(record)); console.log(record.status, record.signature); } } });
await launch.setup();
console.log("SDK lookup-table setup confirmed");
const firstSimulation = await launch.simulate();
assert.equal(firstSimulation.value.err, null, JSON.stringify(firstSimulation.value, (_k, v) => typeof v === "bigint" ? String(v) : v));
const first = await launch.send({ abortSignal: AbortSignal.timeout(45000) });
console.log("Atomic first buy confirmed", first.signature);
const [ata] = await findAssociatedTokenPda({ owner: signer.address, mint: launch.addresses.mint, tokenProgram: address(TOKEN_2022_PROGRAM_ID) });
const balance = async () => BigInt((await rpc.getTokenAccountBalance(ata, { commitment: "confirmed" }).send()).value.amount);
assert((await balance()) >= launch.preview.firstBuy!.minTokenOutputRaw);
const tradeParams = { user: signer, mint: launch.addresses.mint, rpc };
const submit = (instruction: any) => sendAndConfirmTransaction({ instructions: instruction.instructions ?? [instruction], payer: signer, rpc, rpcSubscriptions: subscriptions, priorityFees: { computeUnitLimit: 600000 }, sendOptions: { abortSignal: AbortSignal.timeout(45000) } });
const before = await balance();
await submit(await buy({ ...tradeParams, solAmount: "0.005" }));
assert((await balance()) > before);
console.log("Subsequent buy confirmed");
await submit(await (await import("../src/recipes/buy")).buySimple({ ...tradeParams,
  tokenAmount: 1000000000n, maxSolCostLamports: 1000000n, bondingCurveCreator: signer.address,
  feeRecipient: global.feeRecipient }));
await submit(await (await import("../src/recipes/sell")).sellSimple({ ...tradeParams,
  tokenAmountRaw: 1000000000n, minSolOutputLamports: 1n, bondingCurveCreator: signer.address,
  feeRecipient: global.feeRecipient }));
console.log("Compatibility buy/sell recipes confirmed using v2");
await submit(await sell({ ...tradeParams, useWalletPercentage: true, walletPercentage: 50 }));
assert((await balance()) > 0n && (await balance()) < before);
console.log("Partial sell confirmed");
await submit(await sell({ ...tradeParams, useWalletPercentage: true, walletPercentage: 100 }));
assert.equal(await balance(), 0n);
console.log("Full sell confirmed");
await assert.rejects(() => launch.send(), /already submitted/);
const status = (await rpc.getSignatureStatuses([signature(first.signature)]).send()).value[0];
assert.equal(status?.err, null);
console.log("Duplicate send refused");
const rejected = await (await import("../src/clients/trade_v2")).buyExactQuoteInV2({
  user: signer, mint: launch.addresses.mint, rpc, bondingCurveCreator: signer.address,
  feeRecipient: global.feeRecipient, buybackFeeRecipient: global.buybackFeeRecipients[0]!,
  quoteAmountRaw: 1000000n, minTokenOutputRaw: 1000000000000000n,
});
const failed = await simulateTransaction({ instructions: [rejected], payer: signer, rpc, options: { sigVerify: true } });
assert.notEqual(failed.value.err, null);
await assert.rejects(() => submit(rejected));
assert.equal(await balance(), 0n);
console.log("Output-limit failure preserved token balance");
const curve = (await (await import("../src/pumpsdk/generated/accounts/bondingCurve")).fetchBondingCurve(rpc, launch.addresses.bondingCurve, { commitment: "confirmed" })).data;
await submit(await (await import("../src/clients/trade_v2")).buyV2({
  user: signer, mint: launch.addresses.mint, rpc, bondingCurveCreator: signer.address,
  feeRecipient: global.feeRecipient, buybackFeeRecipient: global.buybackFeeRecipients[0]!,
  tokenAmountRaw: curve.realTokenReserves, maxQuoteInputRaw: 10000000000n,
}));
const complete = (await (await import("../src/pumpsdk/generated/accounts/bondingCurve")).fetchBondingCurve(rpc, launch.addresses.bondingCurve, { commitment: "confirmed" })).data;
assert.equal(complete.complete, true);
console.log("Curve completion confirmed");
await submit(await (await import("../src/clients/migrate_v2")).migrateV2({ user: signer, mint: launch.addresses.mint, rpc }));
console.log("Migration confirmed");
const beforeAmm = await balance();
await submit(await buy({ ...tradeParams, solAmount: "0.005" }));
assert((await balance()) > beforeAmm);
console.log("Migrated AMM buy confirmed");
await submit(await sell({ ...tradeParams, useWalletPercentage: true, walletPercentage: 1 }));
assert((await balance()) < beforeAmm);
console.log("Migrated AMM sell confirmed");
const { poolPda } = await import("../src/pda/pumpAmm");
const { getProgramDerivedAddress, getAddressEncoder } = await import("@solana/kit");
const { PUMP_PROGRAM_ID } = await import("../src/config/addresses");
const { WSOL_ADDRESS, buildWrapSolInstructions, buildUnwrapSolInstructions } = await import("../src/utils/wsol");
const { buildCreateAtaInstruction } = await import("../src/utils/ata");
const [poolAuthority] = await getProgramDerivedAddress({ programAddress: address(PUMP_PROGRAM_ID),
  seeds: [new TextEncoder().encode("pool-authority"), getAddressEncoder().encode(launch.addresses.mint)] });
const poolAddress = await poolPda(0, poolAuthority, launch.addresses.mint, WSOL_ADDRESS);
const pool = (await (await import("../src/ammsdk/generated/accounts/pool")).fetchPool(rpc, poolAddress, { commitment: "confirmed" })).data;
const [lpAta] = await findAssociatedTokenPda({ owner: signer.address, mint: pool.lpMint, tokenProgram: address(TOKEN_2022_PROGRAM_ID) });
const baseReserve = BigInt((await rpc.getTokenAccountBalance(pool.poolBaseTokenAccount, { commitment: "confirmed" }).send()).value.amount);
const quoteReserve = BigInt((await rpc.getTokenAccountBalance(pool.poolQuoteTokenAccount, { commitment: "confirmed" }).send()).value.amount);
const lpAmount = 1000000n;
const maxBase = (baseReserve * lpAmount + pool.lpSupply - 1n) / pool.lpSupply + 1n;
const maxQuote = (quoteReserve * lpAmount + pool.lpSupply - 1n) / pool.lpSupply + 1n;
const liquidityParams = { user: signer, baseMint: launch.addresses.mint, quoteMint: WSOL_ADDRESS, poolAddress, rpc };
const wrapping = await buildWrapSolInstructions({ owner: signer, amount: maxQuote, autoClose: true });
const deposit = await (await import("../src/liquidity")).addLiquidity({ ...liquidityParams,
  maxBaseAmountIn: maxBase, maxQuoteAmountIn: maxQuote, lpTokenAmountOut: lpAmount });
await submit({ instructions: [
  await buildCreateAtaInstruction({ payer: signer, owner: signer, mint: pool.lpMint, tokenProgram: TOKEN_2022_PROGRAM_ID }),
  ...wrapping.prepend, deposit, ...wrapping.append] });
const lpBalance = async () => BigInt((await rpc.getTokenAccountBalance(lpAta, { commitment: "confirmed" }).send()).value.amount);
assert.equal(await lpBalance(), lpAmount);
console.log("Mixed-program liquidity deposit confirmed");
const withdrawal = await (await import("../src/liquidity")).removeLiquidity({ ...liquidityParams, lpAmountIn: lpAmount });
await submit({ instructions: [await buildCreateAtaInstruction({ payer: signer, owner: signer, mint: WSOL_ADDRESS }), withdrawal,
  ...(await buildUnwrapSolInstructions(signer))] });
assert.equal(await lpBalance(), 0n);
console.log("Mixed-program liquidity withdrawal confirmed");
