#!/usr/bin/env bun
/**
 * Sell Test Script for Pump Kit
 * 
 * Sells 100% of wallet token balance with 1% slippage
 * 
 * Usage:
 *   bun test-swap/test-sell.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { TransactionSigner } from "@solana/kit";
import { sell } from "../src/swap";
import { buildTransaction, sendAndConfirmTransaction } from "../src/utils/transaction";

// Configuration
const TOKEN_MINT = "NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump";
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const RPC_WS_URL = process.env.RPC_WS_URL || RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
const KEYPAIR_PATH = join(import.meta.dir, "keypair.json");
const SLIPPAGE_BPS = 100; // 1%

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
  console.log("🚀 Pump Kit Sell Test\n");
  
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
  
  if (initialBalance < 0.001) {
    throw new Error(
      `Insufficient SOL for fees. Need at least 0.001 SOL, but have ${initialBalance.toFixed(4)} SOL`
    );
  }
  
  console.log(`\n📊 Token mint: ${TOKEN_MINT}`);
  console.log(`📉 Slippage: ${SLIPPAGE_BPS / 100}%`);
  console.log(`💯 Selling: 100% of wallet balance\n`);
  
  // Sell tokens
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Selling all tokens");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const sellInstruction = await sell({
    user: wallet,
    mint: TOKEN_MINT,
    useWalletPercentage: true,
    walletPercentage: 100, // Sell 100% of wallet balance
    rpc,
    slippageBps: SLIPPAGE_BPS,
  });
  
  console.log("✅ Sell instruction created");
  console.log(`📝 Building transaction...`);
  
  const sellTx = await buildTransaction({
    instructions: [sellInstruction],
    payer: wallet,
    rpc,
    // No priority fees - just gas
  });
  
  console.log(`📤 Sending sell transaction...`);
  const sellResult = await sendAndConfirmTransaction({
    instructions: [sellInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
  });
  
  console.log(`\n✅ Sell transaction confirmed!`);
  console.log(`🔗 Signature: https://solscan.io/tx/${sellResult.signature}`);
  console.log(`📦 Slot: ${sellResult.slot}`);
  
  // Check final balance
  const finalBalance = await checkBalance(rpc, wallet.address);
  const received = finalBalance - initialBalance;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💰 Initial balance: ${initialBalance.toFixed(4)} SOL`);
  console.log(`💰 Final balance:   ${finalBalance.toFixed(4)} SOL`);
  console.log(`💵 Amount received: ${received >= 0 ? "+" : ""}${received.toFixed(4)} SOL`);
  console.log(`\n✅ Sell test completed successfully!`);
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

