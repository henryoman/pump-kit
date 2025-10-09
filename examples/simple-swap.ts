/**
 * Simple swap example - the cleanest way to use Pump Kit
 */

import { quickBuy, quickSell } from "pump-kit";
import { generateKeyPair } from "@solana/kit";

async function main() {
  // 1. Create your wallet (or use your existing one)
  const wallet = await generateKeyPair();

  // 2. Buy tokens - just 4 parameters!
  const buyInstruction = await quickBuy(
    wallet,
    "TokenMintAddress",
    1_000_000n,      // amount of tokens
    5_000_000n       // max SOL to spend (lamports)
  );

  console.log("Buy instruction created:", buyInstruction);

  // 3. Sell tokens - equally simple!
  const sellInstruction = await quickSell(
    wallet,
    "TokenMintAddress",
    500_000n,        // amount of tokens to sell
    2_000_000n       // min SOL to receive (lamports)
  );

  console.log("Sell instruction created:", sellInstruction);

  // That's it! Auto slippage protection is built-in (0.5% default)
  // Now you just need to send these instructions in a transaction
}

main().catch(console.error);

