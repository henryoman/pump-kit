#!/usr/bin/env bun
/**
 * Live AMM swap test script for Pump Kit
 *
 * Performs:
 * 1. AMM buy using SOL budget
 * 2. AMM sell of 100% wallet balance
 *
 * Usage:
 *   TOKEN_MINT=<amm-mint> RPC_URL=<url> bun test-swap/test-amm.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { TransactionSigner } from "@solana/kit";

import { ammBuy, ammSell } from "../src/swap";
import { buildTransaction, sendAndConfirmTransaction } from "../src/utils/transaction";

const TOKEN_MINT = process.env.TOKEN_MINT;
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const RPC_WS_URL = process.env.RPC_WS_URL || RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
const KEYPAIR_PATH = join(import.meta.dir, "keypair.json");
const BUY_AMOUNT_SOL = Number(process.env.BUY_AMOUNT_SOL ?? "0.01");
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? "100");

if (!TOKEN_MINT) {
  console.error("❌ TOKEN_MINT environment variable is required for AMM swaps");
  process.exit(1);
}

async function loadKeypair(): Promise<TransactionSigner> {
  try {
    const keypairData = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8"));
    const secretKey = new Uint8Array(keypairData);

    if (secretKey.length !== 64) {
      throw new Error(`Invalid keypair: expected 64 bytes, got ${secretKey.length}`);
    }

    return await createKeyPairSignerFromBytes(secretKey);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Keypair file not found at: ${KEYPAIR_PATH}\n` +
          `Please create a keypair.json file in the test-swap/ folder.\n` +
          `Format: [123, 45, 67, ...] (64 byte array)`
      );
    }
    throw error;
  }
}

async function checkBalance(rpc: ReturnType<typeof createSolanaRpc>, address: string): Promise<number> {
  const account = await rpc.getBalance(address).send();
  const lamports = typeof account.value === "bigint" ? Number(account.value) : account.value;
  return lamports / 1_000_000_000;
}

async function main() {
  console.log("🚀 Pump Kit AMM Swap Test\n");

  const wallet = await loadKeypair();
  console.log(`📁 Loading keypair from: ${KEYPAIR_PATH}`);
  console.log(`✅ Wallet address: ${wallet.address}\n`);

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  console.log(`🌐 Connecting to RPC: ${RPC_URL}`);
  console.log("✅ RPC connected\n");

  const initialBalance = await checkBalance(rpc, wallet.address);
  console.log(`💰 Initial SOL balance: ${initialBalance.toFixed(4)} SOL`);

  if (initialBalance < BUY_AMOUNT_SOL + 0.002) {
    throw new Error(
      `Insufficient balance. Need at least ${(BUY_AMOUNT_SOL + 0.002).toFixed(4)} SOL (swap + fees), ` +
        `but have ${initialBalance.toFixed(4)} SOL`
    );
  }

  console.log(`\n📊 Token mint: ${TOKEN_MINT}`);
  console.log(`💵 AMM buy amount: ${BUY_AMOUNT_SOL} SOL`);
  console.log(`🎯 Slippage: ${(SLIPPAGE_BPS / 100).toFixed(2)}%\n`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: AMM Buy");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const buyInstruction = await ammBuy({
    user: wallet,
    mint: TOKEN_MINT,
    solAmount: BUY_AMOUNT_SOL,
    rpc,
    slippageBps: SLIPPAGE_BPS,
  });

  console.log("✅ AMM buy instruction created");
  console.log("📝 Building transaction...");

  await buildTransaction({
    instructions: [buyInstruction],
    payer: wallet,
    rpc,
  });

  console.log("📤 Sending AMM buy transaction...");
  const buyResult = await sendAndConfirmTransaction({
    instructions: [buyInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
  }).catch((error: any) => {
    console.error("❌ AMM buy failed");
    if (error?.logs) {
      console.error("Logs:\n" + error.logs.join("\n"));
    }
    console.error("Raw error:");
    console.dir(error, { depth: 6 });
    throw error;
  });

  console.log("✅ AMM buy transaction confirmed!");
  console.log(`🔗 Signature: https://solscan.io/tx/${buyResult.signature}`);
  console.log(`📦 Slot: ${buyResult.slot}\n`);

  console.log("⏳ Waiting 3 seconds for balances to settle...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: AMM Sell (100%)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const sellInstruction = await ammSell({
    user: wallet,
    mint: TOKEN_MINT,
    useWalletPercentage: true,
    walletPercentage: 100,
    rpc,
    slippageBps: SLIPPAGE_BPS,
  });

  console.log("✅ AMM sell instruction created");
  console.log("📝 Building transaction...");

  await buildTransaction({
    instructions: [sellInstruction],
    payer: wallet,
    rpc,
  });

  console.log("📤 Sending AMM sell transaction...");
  const sellResult = await sendAndConfirmTransaction({
    instructions: [sellInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
  }).catch((error: any) => {
    console.error("❌ AMM sell failed");
    if (error?.logs) {
      console.error("Logs:\n" + error.logs.join("\n"));
    }
    console.error("Raw error:");
    console.dir(error, { depth: 6 });
    throw error;
  });

  console.log("✅ AMM sell transaction confirmed!");
  console.log(`🔗 Signature: https://solscan.io/tx/${sellResult.signature}`);
  console.log(`📦 Slot: ${sellResult.slot}\n`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Final Results");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const finalBalance = await checkBalance(rpc, wallet.address);
  const netChange = finalBalance - initialBalance;

  console.log(`💰 Initial balance: ${initialBalance.toFixed(4)} SOL`);
  console.log(`💰 Final balance:   ${finalBalance.toFixed(4)} SOL`);
  console.log(`📊 Net change:      ${netChange >= 0 ? "+" : ""}${netChange.toFixed(4)} SOL`);
  console.log("\n✅ AMM swap test completed successfully!");
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
