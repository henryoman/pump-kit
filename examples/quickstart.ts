/**
 * Quickstart example showing basic usage of pump-kit SDK
 * 
 * Run with:
 * SOLANA_RPC=https://api.mainnet-beta.solana.com bun run examples/quickstart.ts
 */

import {
  buy,
  sell,
  sellPercent,
  mintWithFirstBuy,
  provideLiquidity,
  removeLiquidity,
  type Signer,
  type Pubkey,
} from "../src/index";

// Example: Create a simple signer from a keypair (you'd use your own wallet)
const exampleSigner: Signer = {
  publicKey: new Uint8Array(32), // Your wallet's public key
  async sign(tx) {
    // Sign the transaction with your private key
    // In production, use proper keypair or wallet adapter
    throw new Error("Implement signing with your wallet");
  },
};

// Example mint address (replace with actual mint)
const exampleMint: Pubkey = new Uint8Array(32);

async function main() {
  console.log("🚀 Pump Kit SDK Quickstart\n");

  // Example 1: Mint a new token with first buy
  console.log("1️⃣ Minting new token with first buy...");
  try {
    const result = await mintWithFirstBuy({
      signer: exampleSigner,
      mint: exampleMint,
      name: "My Token",
      symbol: "MTK",
      uri: "https://example.com/metadata.json",
      tokenAmountOut: 1_000_000n, // 1M tokens
      maxSolIn: 5_000_000n, // 0.005 SOL max
    });
    console.log(`✅ Created! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  // Example 2: Buy tokens
  console.log("2️⃣ Buying tokens...");
  try {
    const result = await buy({
      signer: exampleSigner,
      mint: exampleMint,
      tokenAmountOut: 100_000n, // 100k tokens
      maxSolIn: 1_000_000n, // 0.001 SOL max
    });
    console.log(`✅ Bought! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  // Example 3: Sell 25% of holdings
  console.log("3️⃣ Selling 25% of holdings...");
  try {
    const result = await sellPercent({
      signer: exampleSigner,
      mint: exampleMint,
      percent: 25,
      minSolOut: 0n, // Accept any amount (no slippage protection)
    });
    console.log(`✅ Sold 25%! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  // Example 4: Sell specific amount
  console.log("4️⃣ Selling specific amount...");
  try {
    const result = await sell({
      signer: exampleSigner,
      mint: exampleMint,
      tokenAmountIn: 50_000n, // 50k tokens
      minSolOut: 500_000n, // Expect at least 0.0005 SOL
    });
    console.log(`✅ Sold! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  // Example 5: Provide liquidity to AMM pool
  console.log("5️⃣ Providing liquidity...");
  const quoteMint: Pubkey = new Uint8Array(32); // e.g., SOL or USDC mint
  try {
    const result = await provideLiquidity({
      signer: exampleSigner,
      baseMint: exampleMint,
      quoteMint: quoteMint,
      maxBaseIn: 1_000_000n, // 1M base tokens
      maxQuoteIn: 10_000_000n, // 0.01 quote tokens
      minLpOut: 0n, // Accept any LP tokens (no slippage protection)
    });
    console.log(`✅ Liquidity provided! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  // Example 6: Remove liquidity
  console.log("6️⃣ Removing liquidity...");
  try {
    const result = await removeLiquidity({
      signer: exampleSigner,
      baseMint: exampleMint,
      quoteMint: quoteMint,
      lpAmountIn: 500_000n, // Burn 500k LP tokens
      minBaseOut: 0n,
      minQuoteOut: 0n,
    });
    console.log(`✅ Liquidity removed! Signature: ${result.signature}\n`);
  } catch (err) {
    console.log(`⚠️  Not implemented yet: ${err}\n`);
  }

  console.log("✨ Quickstart complete!");
}

main().catch(console.error);
