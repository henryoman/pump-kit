![Pump Kit](pump-kit.jpeg)

# Pump Kit

**A production-grade TypeScript SDK for Pump.fun**  
Built with Bun + TypeScript + Solana Kit 4.0

A minimal, type-safe SDK for Pump.fun bonding curves and AMM pools with automatic slippage protection and zero legacy dependencies.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.1+-black)](https://bun.sh)
[![Solana Kit 4.0](https://img.shields.io/badge/Solana%20Kit-4.0-purple)](https://github.com/anza-xyz/solana-web3.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Bring Your Own RPC

Pump Kit no longer ships opinionated RPC defaults. You **must** supply your own Solana Kit client when using the SDK:

```ts
import { createSolanaRpc } from "@solana/kit";
import { quickBuy } from "pump-kit";

const rpc = createSolanaRpc("https://your-mainnet-rpc");

await quickBuy(
  wallet,
  mint,
  solBudgetLamports,
  { rpc }
);
```

Pass the same `rpc` client through any helper or recipe that touches on-chain state (buy/sell flows, mint recipes, liquidity, transaction utilities). This keeps production deployments in full control of endpoints, rate limits, and auth headers.

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
import { generateKeyPair, createSolanaRpc } from "@solana/kit";

const wallet = await generateKeyPair();
const rpc = createSolanaRpc("https://your-mainnet-rpc");

const instruction = await quickBuy(
  wallet,
  "TokenMintAddress",
  5_000_000n,
  { rpc }
);
```

---

## Usage

### Buy Tokens

```typescript
import { buy } from "pump-kit";
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://your-mainnet-rpc");

const instruction = await buy({
  user: myWallet,
  mint: "TokenMintAddress",
  solAmountLamports: 5_000_000n,
  rpc,
});

// Pump Kit fetches the bonding curve, quotes the token amount, and applies your slippage guard automatically.

// Auto slippage protection included (0.5% default)
```

### Sell Tokens

```typescript
import { sell } from "pump-kit";
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://your-mainnet-rpc");

const instruction = await sell({
  user: myWallet,
  mint: "TokenMintAddress",
  tokenAmount: 250_000n,
  slippageBps: 75,
  rpc,
});

// The SDK computes the expected SOL output and derives a min-out guard from your slippage.
```

### Even Simpler

```typescript
import { quickBuy, quickSell } from "pump-kit";

// Buy with SOL budget (lamports)
const buyIx = await quickBuy(myWallet, "TokenMint", 5_000_000n, { rpc });

// Sell with token amount (tokens in)
const sellIx = await quickSell(myWallet, "TokenMint", 250_000n, { rpc });
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
  rpc,
});
```

### One-Line Create + Buy

```typescript
import { createAndBuy } from "pump-kit";

const { signature, mint } = await createAndBuy({
  creator: myWallet,
  metadata: { name: "My Token", symbol: "MTK", uri: "https://arweave.net/meta.json" },
  firstBuyTokenAmount: 10_000_000n,
  estimatedFirstBuyCost: 100_000_000n,
  priorityFees: { computeUnitLimit: 400_000, computeUnitPriceMicroLamports: 10_000n },
  rpc,
});
```

> `createAndBuy` generates the mint keypair (returning it as `mint`), builds the create + buy instructions, applies optional priority fees, and submits the transaction in one call.


### Build & Send Transactions

```typescript
import {
  buildTransaction,
  sendAndConfirmTransaction,
  simulateTransaction,
} from "pump-kit";

const { transactionMessage } = await buildTransaction({
  instructions: [buyIx],
  payer: myWallet,
  rpc,
});

const { signature, slot } = await sendAndConfirmTransaction({
  instructions: [buyIx],
  payer: myWallet,
  rpc,
  rpcSubscriptions,
});

const simulation = await simulateTransaction({
  instructions: [buyIx],
  payer: myWallet,
  rpc,
});
```

> Tip: Use `prependInstructions` / `appendInstructions` to inject compute-budget or Jito tip instructions ahead of your core SDK flows.

### Priority Fees

```typescript
import { buildPriorityFeeInstructions, sendAndConfirmTransaction } from "pump-kit";

const priority = buildPriorityFeeInstructions({
  computeUnitLimit: 400_000,
  computeUnitPriceMicroLamports: 10_000n,
});

await sendAndConfirmTransaction({
  instructions: [tradeIx],
  payer: myWallet,
  prependInstructions: priority,
  rpc,
  rpcSubscriptions,
});
```

> `priorityFees` is also accepted directly by `buildTransaction`, `sendAndConfirmTransaction`, and `simulateTransaction` to auto-prepend these instructions.

### Wrap & Unwrap SOL

```typescript
import { buildWrapSolInstructions, buildUnwrapSolInstructions } from "pump-kit";

const wrap = buildWrapSolInstructions({ owner: myWallet, amount: 1_000_000n, autoClose: true });

await sendAndConfirmTransaction({
  instructions: [tradeIx],
  payer: myWallet,
  prependInstructions: wrap.prepend,
  appendInstructions: wrap.append,
});
```

> Use `buildUnwrapSolInstructions` later if you keep a persistent WSOL balance, and check `WRAPPING.md` for detailed patterns.

### Provide & Withdraw Liquidity

```typescript
import { addLiquidity, removeLiquidity, WSOL } from "pump-kit";

const depositIx = await addLiquidity({
  user: myWallet,
  baseMint: "TokenMintAddress",
  quoteMint: WSOL,
  poolIndex: 0,
  maxBaseAmountIn: 1_000_000n,
  maxQuoteAmountIn: 5_000_000n,
  minLpTokensOut: 0n,
  rpc,
});

const withdrawIx = await removeLiquidity({
  user: myWallet,
  baseMint: "TokenMintAddress",
  quoteMint: WSOL,
  lpAmountIn: 500_000n,
  minBaseAmountOut: 0n,
  minQuoteAmountOut: 0n,
  rpc,
});
```

> Set `poolAddress` or `poolCreator` if you need to target a specific AMM pool derivation; both helpers default to pool index 0 and quote mint `WSOL`. Remember to prepend wrapping instructions or ATA creations if your wallet lacks the necessary accounts.

### Pump.fun Event Feed

```typescript
import { createPumpEventManager } from "pump-kit";
import { Connection } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!);
const events = createPumpEventManager(connection);

const id = events.addEventListener("trade", (event) => {
  console.log(event.type, event.signature, event.parsed ?? event.rawLog);
});

// later
events.removeEventListener(id);
```

> Events are dispatched per log line. The `parsed` field will attempt to decode any JSON payload; inspect `rawLog` for custom handling.



---

## API Reference

### Simple API (Recommended)

```typescript
// Super simple - token amount + estimated lamports
quickBuy(wallet, mint, solAmountLamports, options?)
quickSell(wallet, mint, tokenAmount, options?)

// With options (slippage expressed in basis points)
buy({ user, mint, solAmountLamports, slippageBps?, feeRecipient?, bondingCurveCreator?, trackVolume? })
sell({ user, mint, tokenAmount, slippageBps?, feeRecipient?, bondingCurveCreator? })

// Transaction helpers
buildTransaction({ instructions, payer, prependInstructions?, appendInstructions? })
sendAndConfirmTransaction({ instructions, payer, sendOptions? })
simulateTransaction({ instructions, payer, options? })

// Liquidity helpers
quickAddLiquidity(wallet, baseMint, maxBaseAmountIn, maxQuoteAmountIn)
quickRemoveLiquidity(wallet, baseMint, lpAmountIn)
addLiquidity({ user, baseMint, quoteMint?, maxBaseAmountIn, maxQuoteAmountIn, ... })
removeLiquidity({ user, baseMint, quoteMint?, lpAmountIn, minBaseAmountOut?, ... })

// Token launch helper
mintWithFirstBuy({ user, mint, name, symbol, uri, ... })
```
> Slippage defaults to 50 bps (0.5%). Override by providing `slippageBps` when calling `buy`/`sell` or pass basis-point values into the quick helpers.

### Global Commitment Defaults

Pump Kit exposes helpers for setting a global default commitment:

```ts
import { setDefaultCommitment } from "pump-kit";

setDefaultCommitment("finalized");
```

Every recipe and transaction helper will now default to `"finalized"` unless you override the `commitment` field for that call. Supported values are `"processed"`, `"confirmed"`, and `"finalized"`.

You can still override `commitment` per call on recipes and transaction helpers.

### Core Functions

- `buy()` / `quickBuy()` - Buy tokens with automatic slippage protection
- `sell()` / `quickSell()` - Sell tokens with minimum output protection
- `mintWithFirstBuy()` - Create and launch a new token
- `addLiquidity()` / `removeLiquidity()` - Provide or withdraw AMM liquidity (defaults target WSOL quote)
- `buildTransaction()` / `sendAndConfirmTransaction()` / `simulateTransaction()` - Assemble, send, and test Solana transactions using Kit defaults
- `buildPriorityFeeInstructions()` - Generate compute-budget instructions for priority fees (Jito tips, CU limits)

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

Configure your test environment by pointing the SDK to **your own** Solana RPC endpoint. Export the URL that your tests should hit:

```bash
export SOLANA_RPC=https://your-dev-or-mainnet-endpoint
bun test
```

For local development you can still target devnet or a private validator, but we no longer ship defaults—tests will skip if `SOLANA_RPC` is missing.

### Test Philosophy

- **Unit tests** - Fast, deterministic, no network access required
- **Integration tests** - Build instructions and verify correctness without sending transactions
- **Configure RPC explicitly** - Provide a dedicated devnet/mainnet endpoint for integration tests
- **Skip when unreachable** - Use environment guards if your CI cannot access the RPC

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

This SDK is community-built and not officially affiliated with Pump.fun. Use at your own risk. Always supply your own RPC endpoint and validate flows in a staging environment before executing on mainnet.
