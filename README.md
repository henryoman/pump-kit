![Pump Kit](pump-kit.jpeg)

# Pump Kit

**A modern TypeScript SDK for Pump.fun**  
Built with Bun + TypeScript + Solana Kit 4.0

A minimal, type-safe SDK for Pump.fun bonding curves and AMM pools with automatic slippage protection and zero legacy dependencies.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-black)](https://bun.sh)
[![Solana Kit 4.0](https://img.shields.io/badge/Solana%20Kit-4.0-purple)](https://github.com/anza-xyz/solana-web3.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## ⚠️ Not Ready for Production

**This SDK is currently in active development and is NOT ready for production use.**

- Core functionality is being tested
- APIs may change without notice
- Use at your own risk on devnet only
- Do not use with real funds on mainnet

We'll remove this notice once the SDK has been thoroughly tested and audited.

---

## Why Solana Kit 4.0?

Pump Kit is built on Solana Kit 4.0, the next generation of Solana development tools that dramatically outperforms legacy `@solana/web3.js`:

### Performance Benefits

- **Up to 70% smaller bundles** - Tree-shakable architecture means you only bundle what you use
- **3-5x faster runtime** - Modern JavaScript with native BigInt instead of legacy BN.js
- **Zero legacy bloat** - No deprecated dependencies or polyfills required
- **Optimized for modern tooling** - Works seamlessly with Vite, Webpack 5, and Bun

### Key Advantages

| Feature | Legacy @solana/web3.js | Solana Kit 4.0 |
|---------|------------------------|----------------|
| **Bundle Size** | 300-500 KB | 50-150 KB |
| **Tree Shaking** | Limited | Full support |
| **TypeScript** | Partial types | 100% type-safe |
| **BigInt Support** | BN.js (legacy) | Native BigInt |
| **Modular** | Monolithic | Fully modular |
| **Build Speed** | Slow | 3-5x faster |

### Developer Experience

- **Modern APIs** - Clean, intuitive interfaces designed for 2025+
- **Better IDE support** - Full IntelliSense and autocomplete
- **Faster iteration** - Hot module replacement works perfectly
- **Future-proof** - Active development by the Solana Foundation

---

## Features

- **Simple API** - Clean interface with automatic slippage protection
- **Type-Safe** - Full TypeScript support with compile-time validation
- **Modern Stack** - Built on Solana Kit 4.0, no legacy dependencies
- **Fast** - Powered by Bun for optimal performance
- **Well-Tested** - Comprehensive test suite with unit and integration tests

---

## Installation

```bash
bun add pump-kit
```

---

## Quick Start

```typescript
import { quickBuy } from "pump-kit";
import { generateKeyPair } from "@solana/kit";

// 1. Create wallet
const wallet = await generateKeyPair();

// 2. Buy tokens - 4 parameters, done!
const instruction = await quickBuy(
  wallet,
  "TokenMintAddress",
  1_000_000n,      // amount
  5_000_000n       // max SOL (lamports)
);

// That's it! Auto slippage, auto PDAs, zero complexity.
```

---

## Usage

### Buy Tokens

```typescript
import { buy } from "pump-kit";

const instruction = await buy({
  user: myWallet,
  mint: "TokenMintAddress",
  amount: 1_000_000n,
  maxCost: 5_000_000n, // Max SOL in lamports
});

// Auto slippage protection included (0.5% default)
```

### Sell Tokens

```typescript
import { sell } from "pump-kit";

const instruction = await sell({
  user: myWallet,
  mint: "TokenMintAddress",
  amount: 250_000n,
  minReceive: 1_000_000n, // Min SOL in lamports
});
```

### Even Simpler

```typescript
import { quickBuy, quickSell } from "pump-kit";

// Buy with 4 parameters
const buyIx = await quickBuy(myWallet, "TokenMint", 1_000_000n, 5_000_000n);

// Sell with 4 parameters
const sellIx = await quickSell(myWallet, "TokenMint", 250_000n, 1_000_000n);
```

### Mint New Token

```typescript
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
  firstBuyTokenAmount: 10_000_000n,
  estimatedFirstBuyCost: 100_000_000n,
  slippageBps: 50,
  feeRecipient: "FeeRecipientAddress",
});
```

### Add Liquidity

```typescript
import { addLiquidity } from "pump-kit";

const depositIx = await addLiquidity({
  user: myWallet,
  mint: "TokenMintAddress",
  tokenAmount: 100_000_000n,  // tokens to add
  solAmount: 50_000_000n,     // SOL to add (lamports)
  slippage: 50,               // optional
});

// Or use the quick version
import { quickAddLiquidity } from "pump-kit";
const ix = await quickAddLiquidity(myWallet, "TokenMint", 100_000_000n, 50_000_000n);
```

### Remove Liquidity

```typescript
import { removeLiquidity } from "pump-kit";

const withdrawIx = await removeLiquidity({
  user: myWallet,
  mint: "TokenMintAddress",
  lpAmount: 50_000_000n,  // LP tokens to burn
  slippage: 50,           // optional
});

// Or use the quick version
import { quickRemoveLiquidity } from "pump-kit";
const ix = await quickRemoveLiquidity(myWallet, "TokenMint", 50_000_000n);
```

---

## API Reference

### Simple API (Recommended)

```typescript
// Super simple - just 4 parameters
quickBuy(wallet, mint, amount, maxCost)
quickSell(wallet, mint, amount, minReceive)

// With options
buy({ user, mint, amount, maxCost, slippage? })
sell({ user, mint, amount, minReceive, slippage? })

// Token & Liquidity
mintWithFirstBuy({ user, mint, name, symbol, uri, ... })
addLiquidity({ user, mint, tokenAmount, solAmount })
removeLiquidity({ user, mint, lpAmount })
```

### Core Functions

- `buy()` / `quickBuy()` - Buy tokens with automatic slippage protection
- `sell()` / `quickSell()` - Sell tokens with minimum output protection
- `mintWithFirstBuy()` - Create and launch a new token
- `addLiquidity()` / `quickAddLiquidity()` - Add liquidity to pools
- `removeLiquidity()` / `quickRemoveLiquidity()` - Withdraw liquidity from pools

### Utilities

- `validateMintParams()` - Validate token metadata before minting

---

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run only unit tests (fast, no network)
bun test:unit

# Run integration tests (requires RPC)
bun test:integration

# Watch mode for development
bun test:watch
```

### Test Configuration

Configure your test environment by setting the `SOLANA_CLUSTER` environment variable:

```bash
# Use devnet for testing (recommended)
export SOLANA_CLUSTER=devnet
bun test

# Or use a custom RPC endpoint
export SOLANA_RPC=https://api.devnet.solana.com
bun test
```

### Test Philosophy

- **Unit tests** - Fast, deterministic, no network access required
- **Integration tests** - Build instructions and verify correctness without sending transactions
- **Always use devnet** - Never test on mainnet to avoid costs

For more details, see the [test documentation](./tests/README.md).

---

## Development

### Build from Source

```bash
git clone https://github.com/yourusername/pump-kit.git
cd pump-kit
bun install
bun run build
```

### Available Scripts

```bash
bun run dev:typecheck  # Type-check without emitting
bun run build:js       # Bundle JavaScript
bun run build:types    # Generate type definitions
bun run build          # Full build
bun run codegen        # Regenerate from IDLs
bun test               # Run all tests
```

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Disclaimer

This SDK is community-built and not officially affiliated with Pump.fun. Use at your own risk. Always test on devnet first.


