# Pump Kit

<p align="center">
  <img src="@pump-kit.png" alt="Pump Kit" width="600" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pump-kit">
    <img src="https://img.shields.io/npm/v/pump-kit.svg?logo=npm&label=npm" alt="npm version" />
  </a>
  <a href="https://bun.sh">
    <img src="https://img.shields.io/badge/bun-%3E%3D1.3.0-000000?logo=bun&logoColor=fff" alt="Bun >= 1.3.0" />
  </a>
  <a href="https://nodejs.org/en">
    <img src="https://img.shields.io/badge/node-%3E%3D20-43853d?logo=node.js&logoColor=fff" alt="Node.js >= 20" />
  </a>
</p>

A TypeScript SDK for Pump.fun built on **Solana Kit 5.0**. Designed for high-performance applications including launch bots, bundlers, and low-latency trading systems using latest Solana best practices. 

**Production-ready package coming soon.**

## Features

- **Solana Kit 5.0** – Built on the latest Solana development framework
- **Modern transaction patterns** – Optimized for speed and reliability
- **Unified swaps** – `buy`/`sell` auto-route between bonding curves and AMM pools
- **Curve helpers** – Direct access to bonding-curve instructions when you need them (`curveBuy`, `curveSell`)
- **AMM helpers** – Deterministic AMM operations with percentage-aware selling (`ammBuy`, `ammSell`)
- **Automatic slippage protection** – Built-in guards for buy/sell operations
- **Full TypeScript support** – Strongly typed throughout with complete type coverage

### Coming Soon

- **Launch & mint helpers** – Create and seed new Pump.fun tokens once integration is ready
- **Liquidity tooling** – Add/remove liquidity with tested helpers

---

## Installation

```bash
bun add pump-kit
```

---

## Quick Start

### Setup

```ts
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
```

### Buy Tokens (Curve)

```ts
import { curveBuy } from "pump-kit";

await curveBuy({
  user: myWallet,
  mint: "TokenMintAddress",
  solAmount: 0.5,        // 0.5 SOL
  slippageBps: 50,       // 0.5% slippage (optional)
  rpc,
});
```

### Sell Tokens (Curve)

```ts
import { curveSell } from "pump-kit";

// Sell specific amount
await curveSell({
  user: myWallet,
  mint: "TokenMintAddress",
  tokenAmount: 125_000,
  rpc,
});

// Sell percentage of wallet
await curveSell({
  user: myWallet,
  mint: "TokenMintAddress",
  useWalletPercentage: true,
  walletPercentage: 40,  // Sell 40% of holdings
  rpc,
});
```

### Buy Tokens (AMM)

```ts
import { ammBuy } from "pump-kit";

await ammBuy({
  user: myWallet,
  mint: "TokenMintAddress",
  solAmount: 0.5,
  poolCreator: "CreatorAddress", // optional if auto detection works
  rpc,
});
```

### Sell Tokens (AMM)

```ts
import { ammSell } from "pump-kit";

await ammSell({
  user: myWallet,
  mint: "TokenMintAddress",
  useWalletPercentage: true,
  walletPercentage: 100,
  poolCreator: "CreatorAddress",
  rpc,
});
```

---

## API Reference

### Curve Swap Helpers

```ts
// Buy tokens on the bonding curve
curveBuy({ user, mint, solAmount, slippageBps?, rpc, ... })

// Sell tokens on the bonding curve
curveSell({ user, mint, tokenAmount?, useWalletPercentage?, walletPercentage?, rpc, ... })
```

### AMM Swap Helpers

```ts
// Buy tokens from the AMM pool using a SOL budget
ammBuy({ user, mint, solAmount, rpc, quoteMint?, poolCreator?, poolAddress? })

// Sell tokens into the AMM pool (supports percentage-based selling)
ammSell({
  user,
  mint,
  tokenAmount?,
  useWalletPercentage?,
  walletPercentage?,
  rpc,
  quoteMint?,
  poolCreator?,
  poolAddress?,
})
```

### Coming Soon

```ts
// Create token with initial buy
mintWithFirstBuy({ ... })

// Liquidity helpers
addLiquidity({ ... })
removeLiquidity({ ... })
```

### Transaction Utilities

```ts
// Build transaction
buildTransaction({ instructions, payer, prependInstructions?, appendInstructions?, rpc })

// Send and confirm
sendAndConfirmTransaction({ instructions, payer, rpc, rpcSubscriptions, ... })

// Simulate transaction
simulateTransaction({ instructions, payer, rpc, options? })
```

---

## License

MIT
