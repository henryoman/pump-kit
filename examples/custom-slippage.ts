/**
 * Example with custom slippage settings
 */

import { buy, sell } from "pump-kit";
import { generateKeyPair } from "@solana/kit";

async function main() {
  const wallet = await generateKeyPair();

  // Buy with custom slippage (1% instead of default 0.5%)
  const buyIx = await buy({
    user: wallet,
    mint: "TokenMintAddress",
    tokenAmount: 1_000_000n,
    estimatedSolCostLamports: 5_000_000n,
    slippageBps: 100,  // 100 bps = 1%
  });

  console.log("Buy with 1% slippage:", buyIx);

  // Sell with tighter slippage (0.25%)
  const sellIx = await sell({
    user: wallet,
    mint: "TokenMintAddress",
    tokenAmount: 500_000n,
    estimatedSolOutputLamports: 2_000_000n,
    slippageBps: 25,  // 25 bps = 0.25%
  });

  console.log("Sell with 0.25% slippage:", sellIx);
}

main().catch(console.error);
