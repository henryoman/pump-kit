#!/usr/bin/env bun
/**
 * Live swap test script for Pump Kit
 * 
 * This script performs a real swap on Solana:
 * 1. Buys 0.01 SOL worth of tokens
 * 2. Sells all tokens back
 * 
 * Usage:
 *   1. Place your keypair JSON file in the `test-swap/` folder as `keypair.json`
 *   2. Set RPC_URL environment variable (or edit below)
 *   3. Set TOKEN_MINT environment variable (the token you want to swap)
 *   4. Run: bun test-swap/test-swap.ts
 * 
 * Keypair format (standard Solana keypair JSON):
 *   [123, 45, 67, ...]  // 64 byte array
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { TransactionSigner } from "@solana/kit";
import { buy, sell } from "../src/swap";
import { buildTransaction, sendAndConfirmTransaction } from "../src/utils/transaction";

// Configuration
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const RPC_WS_URL = process.env.RPC_WS_URL || RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
const TOKEN_MINT = process.env.TOKEN_MINT;
const KEYPAIR_PATH = join(import.meta.dir, "keypair.json");
const BUY_AMOUNT_SOL = 0.01;

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
  const response = await rpc.getBalance(address as any).send();
  return Number(response.value) / 1e9; // Convert lamports to SOL
}

async function main() {
  console.log("🚀 Pump Kit Live Swap Test\n");
  
  // Validate environment
  if (!TOKEN_MINT) {
    throw new Error(
      "TOKEN_MINT environment variable is required.\n" +
      "Example: TOKEN_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v bun test-swap/test-swap.ts"
    );
  }
  
  // Load keypair
  console.log(`📁 Loading keypair from: ${KEYPAIR_PATH}`);
  const wallet = await loadKeypair();
  console.log(`✅ Wallet address: ${wallet.address}\n`);
  
  // Setup RPC
  console.log(`🌐 Connecting to RPC: ${RPC_URL}`);
  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  console.log("✅ RPC connected\n");
  
  // Check initial balance
  const initialBalance = await checkBalance(rpc, wallet.address);
  console.log(`💰 Initial SOL balance: ${initialBalance.toFixed(4)} SOL`);
  
  if (initialBalance < BUY_AMOUNT_SOL + 0.001) {
    throw new Error(
      `Insufficient balance. Need at least ${BUY_AMOUNT_SOL + 0.001} SOL ` +
      `(for swap + fees), but have ${initialBalance.toFixed(4)} SOL`
    );
  }
  
  console.log(`\n📊 Token mint: ${TOKEN_MINT}`);
  console.log(`💵 Buy amount: ${BUY_AMOUNT_SOL} SOL\n`);
  
  // Step 1: Buy tokens
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: Buying tokens");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const buyInstruction = await buy({
    user: wallet,
    mint: TOKEN_MINT,
    solAmount: BUY_AMOUNT_SOL,
    rpc,
    slippageBps: 100, // 1% slippage
  });
  
  console.log("✅ Buy instruction created");
  console.log(`📝 Building transaction...`);
  
  const buyTx = await buildTransaction({
    instructions: [buyInstruction],
    payer: wallet,
    rpc,
  });
  
  console.log(`📤 Sending buy transaction...`);
  const buyResult = await sendAndConfirmTransaction({
    instructions: [buyInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
  });
  
  console.log(`✅ Buy transaction confirmed!`);
  console.log(`🔗 Signature: https://solscan.io/tx/${buyResult.signature}`);
  console.log(`📦 Slot: ${buyResult.slot}\n`);
  
  // Wait a bit for the transaction to settle
  console.log("⏳ Waiting 2 seconds for transaction to settle...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 2: Sell all tokens
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: Selling all tokens");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const sellInstruction = await sell({
    user: wallet,
    mint: TOKEN_MINT,
    useWalletPercentage: true,
    walletPercentage: 100, // Sell 100% of wallet balance
    rpc,
    slippageBps: 100, // 1% slippage
  });
  
  console.log("✅ Sell instruction created");
  console.log(`📝 Building transaction...`);
  
  console.log(`📤 Sending sell transaction...`);
  const sellResult = await sendAndConfirmTransaction({
    instructions: [sellInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
  });
  
  console.log(`✅ Sell transaction confirmed!`);
  console.log(`🔗 Signature: https://solscan.io/tx/${sellResult.signature}`);
  console.log(`📦 Slot: ${sellResult.slot}\n`);
  
  // Check final balance
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Final Results");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const finalBalance = await checkBalance(rpc, wallet.address);
  const netChange = finalBalance - initialBalance;
  
  console.log(`💰 Initial balance: ${initialBalance.toFixed(4)} SOL`);
  console.log(`💰 Final balance:   ${finalBalance.toFixed(4)} SOL`);
  console.log(`📊 Net change:      ${netChange >= 0 ? "+" : ""}${netChange.toFixed(4)} SOL`);
  console.log(`\n✅ Swap test completed successfully!`);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

