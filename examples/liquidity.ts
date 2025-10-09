/**
 * Simple liquidity examples - no complexity!
 */

import {
  addLiquidity,
  removeLiquidity,
  quickAddLiquidity,
  quickRemoveLiquidity,
} from "pump-kit";
import { generateKeyPair } from "@solana/kit";

async function main() {
  const wallet = await generateKeyPair();

  // Add liquidity - ultra simple
  const addIx = await addLiquidity({
    user: wallet,
    mint: "TokenMintAddress",
    tokenAmount: 100_000_000n,  // 100M tokens
    solAmount: 50_000_000n,     // 0.05 SOL
  });

  console.log("Add liquidity instruction:", addIx);

  // Remove liquidity - equally simple
  const removeIx = await removeLiquidity({
    user: wallet,
    mint: "TokenMintAddress",
    lpAmount: 50_000_000n,  // Burn 50M LP tokens
  });

  console.log("Remove liquidity instruction:", removeIx);

  // Quick versions (even simpler)
  const quickAdd = await quickAddLiquidity(
    wallet,
    "TokenMint",
    100_000_000n,  // tokens
    50_000_000n    // SOL
  );

  const quickRemove = await quickRemoveLiquidity(
    wallet,
    "TokenMint",
    50_000_000n  // LP tokens
  );

  // That's it! No pool index, no complex ratios, no estimated outputs.
  // The pool contract handles all the math automatically.
}

main().catch(console.error);

