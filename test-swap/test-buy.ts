#!/usr/bin/env bun
/**
 * Buy Test Script for Pump Kit
 * 
 * Buys 0.01 SOL worth of tokens with 1% slippage
 * 
 * Usage:
 *   bun test-swap/test-buy.ts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";
import type { TransactionSigner } from "@solana/kit";
import { buy } from "../src/swap";
import { buildTransaction, sendAndConfirmTransaction, simulateTransaction } from "../src/utils/transaction";

// Configuration
const TOKEN_MINT = "NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump";
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const RPC_WS_URL = process.env.RPC_WS_URL || RPC_URL.replace("https://", "wss://").replace("http://", "ws://");
const KEYPAIR_PATH = join(import.meta.dir, "keypair.json");
const BUY_AMOUNT_SOL = 0.01;
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
  console.log("🚀 Pump Kit Buy Test\n");
  
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
  console.log(`💵 Buy amount: ${BUY_AMOUNT_SOL} SOL`);
  console.log(`📉 Slippage: ${SLIPPAGE_BPS / 100}%\n`);
  
  // Buy tokens
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Buying tokens");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  const buyInstruction = await buy({
    user: wallet,
    mint: TOKEN_MINT,
    solAmount: BUY_AMOUNT_SOL,
    rpc,
    slippageBps: SLIPPAGE_BPS,
  });
  
  console.log("✅ Buy instruction created");
  console.log(`📋 Instruction accounts: ${buyInstruction.accounts.length}`);
  console.log(`📋 Program: ${buyInstruction.programAddress}`);
  console.log(`📋 Data length: ${buyInstruction.data.length} bytes`);
  
  // Debug: Print all account addresses
  console.log(`\n📋 Account addresses:`);
  for (let i = 0; i < buyInstruction.accounts.length; i++) {
    const acc = buyInstruction.accounts[i];
    console.log(`  ${i}: ${acc.address} (${acc.role})`);
  }
  console.log(`📝 Building transaction...`);
  
  // Try simulation with better error handling
  console.log(`🔍 Simulating transaction to get detailed error...`);
  try {
    const { buildTransaction } = await import("../src/utils/transaction");
    const { getBase64EncodedWireTransaction, signTransactionMessageWithSigners } = await import("@solana/kit");
    
    const built = await buildTransaction({
      instructions: [buyInstruction],
      payer: wallet,
      rpc,
    });
    
    const signed = await signTransactionMessageWithSigners(built.transactionMessage as any);
    const encoded = getBase64EncodedWireTransaction(signed);
    
    // Try to simulate manually to get logs
    const simResult = await rpc.simulateTransaction(encoded, {
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: true,
    }).send();
    
    if (simResult.value.err) {
      console.error(`❌ Simulation error:`, JSON.stringify(simResult.value.err, null, 2));
      if (simResult.value.logs) {
        console.error(`\n📋 Program logs:`);
        simResult.value.logs.forEach((log: string, i: number) => {
          console.error(`  ${i + 1}: ${log}`);
        });
      }
      throw new Error(`Simulation failed: ${JSON.stringify(simResult.value.err, null, 2)}`);
    }
    
    console.log(`✅ Simulation successful`);
  } catch (simError: any) {
    console.error(`❌ Simulation failed:`, simError.message);
    if (simError.cause) {
      console.error(`Cause:`, JSON.stringify(simError.cause, null, 2));
    }
    throw simError;
  }
  
  console.log(`📤 Sending buy transaction...`);
  const buyResult = await sendAndConfirmTransaction({
    instructions: [buyInstruction],
    payer: wallet,
    rpc,
    rpcSubscriptions,
    sendOptions: {
      skipPreflight: false, // Run preflight to catch errors
    },
  });
  
  console.log(`\n✅ Buy transaction confirmed!`);
  console.log(`🔗 Signature: https://solscan.io/tx/${buyResult.signature}`);
  console.log(`📦 Slot: ${buyResult.slot}`);
  
  // Check final balance
  const finalBalance = await checkBalance(rpc, wallet.address);
  const spent = initialBalance - finalBalance;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💰 Initial balance: ${initialBalance.toFixed(4)} SOL`);
  console.log(`💰 Final balance:   ${finalBalance.toFixed(4)} SOL`);
  console.log(`💸 Amount spent:    ${spent.toFixed(4)} SOL`);
  console.log(`\n✅ Buy test completed successfully!`);
}

main().catch((error: any) => {
  console.error("\n❌ Error:", error.message);
  if (error.cause) {
    console.error("Cause:", error.cause);
  }
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

