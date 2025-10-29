![Pump Kit](@pump-kit.png)

# Pump Kit

<p align="center">
  <a href="https://www.npmjs.com/package/pump-kit">
    <img src="https://img.shields.io/npm/v/pump-kit.svg?logo=npm&label=npm" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/pump-kit">
    <img src="https://img.shields.io/npm/dm/pump-kit.svg?logo=npm&label=downloads" alt="npm downloads" />
  </a>
  <a href="https://bun.sh">
    <img src="https://img.shields.io/badge/bun-%3E%3D1.1.0-000000?logo=bun&logoColor=fff" alt="Bun >= 1.1.0" />
  </a>
  <a href="https://nodejs.org/en">
    <img src="https://img.shields.io/badge/node-%3E%3D18-43853d?logo=node.js&logoColor=fff" alt="Node.js >= 18" />
  </a>
</p>

> Social card metadata lives in [`metadata/social.json`](metadata/social.json) and points to the same `@pump-kit.png` preview used here.

Pump Kit is a lightweight TypeScript helper for Pump.fun. It keeps all the lamport math under the hood so you work with SOL amounts, token counts, and wallet percentages.

What you get:

- Buy/sell helpers with automatic slippage guards
- Quick token launch via `mintWithFirstBuy`
- Liquidity, wrapping, and transaction utilities
- Full TypeScript coverage and Bun-friendly builds

---

## Quick Start

### Buy Tokens (Simple SOL Budget)

```ts
import { buy } from "pump-kit";
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://your-mainnet-rpc");

await buy({
  user: myWallet,
  mint: "TokenMintAddress",
  solAmount: 0.5,      // Half a SOL budget
  slippageBps: 75,     // Optional (defaults to 50)
  rpc,
});
```

### Sell Tokens (Amount or Wallet %)

```ts
import { sell } from "pump-kit";

// Sell a fixed amount
await sell({
  user: myWallet,
  mint: "TokenMintAddress",
  tokenAmount: 125_000,    // Human-readable units
  rpc,
});

// Sell 40% of the wallet balance
await sell({
  user: myWallet,
  mint: "TokenMintAddress",
  useWalletPercentage: true,
  walletPercentage: 40,
  rpc,
});
```

### Quick Helpers

```ts
import { quickBuy, quickSell } from "pump-kit";

const buyInstruction = await quickBuy(myWallet, "TokenMint", 0.25, { rpc });
const sellInstruction = await quickSell(myWallet, "TokenMint", 100_000, { rpc });
```

> **Note:** The quick helpers require an RPC client. Always pass `{ rpc }` (and any optional overrides) as the final argument.

### Mint New Token

```ts
import { mintWithFirstBuy } from "pump-kit";
import { generateKeyPair } from "@solana/kit";

const mintKeypair = await generateKeyPair();

const { createInstruction, buyInstruction } = await mintWithFirstBuy({
  user: myWallet,
  mint: mintKeypair,
  mintAuthority: myWallet.address,
  name: "My Token",
  symbol: "MTK",
  uri: "https://arweave.net/metadata.json",
  firstBuyTokenAmount: 1_000_000,  // tokens
  firstBuySolBudget: 1.2,          // SOL
  rpc,
});
```

---

## Features

- **Human inputs** – Specify SOL budgets or wallet percentages instead of lamports
- **Simple API** – Buy, sell, mint, and provide liquidity with one call
- **Type-safe** – Every helper ships with strong TypeScript types
- **Composable** – Works alongside your existing transaction flow; no global configuration

### Simple API (Recommended)

```ts
quickBuy(wallet, mint, solAmount, { rpc, ...options })
quickSell(wallet, mint, tokenAmount, { rpc, ...options })

buy({ user, mint, solAmount, slippageBps?, ... })
sell({ user, mint, tokenAmount?, useWalletPercentage?, walletPercentage?, ... })

buildTransaction({ instructions, payer, prependInstructions?, appendInstructions?, rpc })
sendAndConfirmTransaction({ instructions, payer, rpc, rpcSubscriptions, ... })
simulateTransaction({ instructions, payer, rpc, options? })

addLiquidity({ user, baseMint, quoteMint?, maxBaseAmountIn, maxQuoteAmountIn, ... })
removeLiquidity({ user, baseMint, quoteMint?, lpAmountIn, ... })

mintWithFirstBuy({ user, mint, firstBuyTokenAmount, firstBuySolBudget, ... })
```
