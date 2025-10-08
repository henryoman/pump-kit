/**
 * Example: Selling token holdings by percentage
 * 
 * Run with:
 * SOLANA_RPC=https://api.mainnet-beta.solana.com bun run examples/sell-percentage.ts
 */

import { sellPercent, type Signer, type Pubkey } from "../src/index";

// Setup your signer (replace with actual wallet implementation)
const signer: Signer = {
  publicKey: new Uint8Array(32),
  async sign(tx) {
    throw new Error("Implement signing with your wallet");
  },
};

const mint: Pubkey = new Uint8Array(32); // Replace with actual mint

async function main() {
  console.log("💰 Selling token holdings by percentage\n");

  // Sell 10%
  console.log("Selling 10%...");
  try {
    const result10 = await sellPercent({
      signer,
      mint,
      percent: 10,
      minSolOut: 0n, // No slippage protection for this example
    });
    console.log(`✅ Sold 10%: ${result10.signature}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  // Sell 25%
  console.log("Selling 25%...");
  try {
    const result25 = await sellPercent({
      signer,
      mint,
      percent: 25,
      minSolOut: 1_000_000n, // Expect at least 0.001 SOL
    });
    console.log(`✅ Sold 25%: ${result25.signature}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  // Sell 50%
  console.log("Selling 50%...");
  try {
    const result50 = await sellPercent({
      signer,
      mint,
      percent: 50,
      minSolOut: 5_000_000n, // Expect at least 0.005 SOL
    });
    console.log(`✅ Sold 50%: ${result50.signature}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  // Sell all (100%)
  console.log("Selling all (100%)...");
  try {
    const result100 = await sellPercent({
      signer,
      mint,
      percent: 100,
      minSolOut: 10_000_000n, // Expect at least 0.01 SOL
      commitment: "finalized", // Wait for finalized commitment
    });
    console.log(`✅ Sold all: ${result100.signature}\n`);
  } catch (err) {
    console.log(`⚠️  ${err}\n`);
  }

  console.log("✨ Complete!");
}

main().catch(console.error);
