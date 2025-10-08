/**
 * Example: Managing liquidity in Pump AMM pools
 * 
 * Run with:
 * SOLANA_RPC=https://api.mainnet-beta.solana.com bun run examples/liquidity.ts
 */

import {
  provideLiquidity,
  removeLiquidity,
  type Signer,
  type Pubkey,
} from "../src/index";

// Setup your signer
const signer: Signer = {
  publicKey: new Uint8Array(32),
  async sign(tx) {
    throw new Error("Implement signing with your wallet");
  },
};

// Example token mints
const baseMint: Pubkey = new Uint8Array(32); // Your token
const quoteMint: Pubkey = new Uint8Array(32); // SOL or USDC

async function main() {
  console.log("💧 Pump AMM Liquidity Management\n");

  // Provide liquidity
  console.log("1️⃣ Providing liquidity to pool...");
  try {
    const addResult = await provideLiquidity({
      signer,
      baseMint,
      quoteMint,
      maxBaseIn: 5_000_000n, // Max 5M base tokens
      maxQuoteIn: 100_000_000n, // Max 0.1 quote tokens
      minLpOut: 1_000_000n, // Expect at least 1M LP tokens
      commitment: "confirmed",
    });
    console.log(`✅ Liquidity added!`);
    console.log(`   Signature: ${addResult.signature}`);
    console.log(`   Slot: ${addResult.slot}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  // Later: Remove liquidity
  console.log("2️⃣ Removing liquidity from pool...");
  try {
    const removeResult = await removeLiquidity({
      signer,
      baseMint,
      quoteMint,
      lpAmountIn: 500_000n, // Burn 500k LP tokens
      minBaseOut: 2_000_000n, // Expect at least 2M base tokens back
      minQuoteOut: 40_000_000n, // Expect at least 0.04 quote tokens back
      commitment: "confirmed",
    });
    console.log(`✅ Liquidity removed!`);
    console.log(`   Signature: ${removeResult.signature}`);
    console.log(`   Slot: ${removeResult.slot}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  console.log("✨ Complete!");
}

main().catch(console.error);
