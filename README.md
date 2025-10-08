# pump-kit

> **Minimal, fast SDK for Pump.fun bonding curves and AMM pools**  
> Built with Bun + TypeScript + Solana Kit 3.0 + Codama

A TypeScript SDK exposing the core user flows for Pump.fun:
- **mint (with first buy)** — Create a new token with initial purchase
- **buy** — Purchase tokens from bonding curve
- **sell** — Sell tokens back to bonding curve
- **sell %** — Sell a percentage of holdings
- **provide liquidity** — Add liquidity to AMM pools
- **remove liquidity** — Withdraw liquidity from AMM pools

## Features

- ✨ **Simple API** — Clean, minimal interface with explicit slippage controls
- 🚀 **Fast** — Built with Bun for speed
- 📦 **Type-safe** — Full TypeScript support with generated types
- 🔧 **Solana Kit 3.0** — Modern, transport-agnostic RPC
- 🎯 **Codama-powered** — Generated clients from on-chain IDLs

## Installation

```bash
bun add pump-kit
# or
npm install pump-kit
```

## Quick Start

```typescript
import { buy, sell, sellPercent } from "pump-kit";

// Buy tokens from bonding curve
const result = await buy({
  signer: yourSigner,
  mint: tokenMint,
  tokenAmountOut: 1_000_000n,  // 1M tokens
  maxSolIn: 5_000_000n,         // Max 0.005 SOL (slippage protection)
});

// Sell 25% of holdings
await sellPercent({
  signer: yourSigner,
  mint: tokenMint,
  percent: 25,
  minSolOut: 1_000_000n,        // Min 0.001 SOL expected
});
```

## Configuration

Set environment variables to configure RPC and commitment:

```bash
export SOLANA_RPC="https://api.mainnet-beta.solana.com"
export SOLANA_COMMITMENT="confirmed"  # or "processed" / "finalized"
export SOLANA_TX_TIMEOUT_MS="60000"
```

## API Reference

### Bonding Curve Operations

#### `buy(args)`
Buy tokens from the bonding curve.

```typescript
await buy({
  signer: Signer,
  mint: Pubkey,
  tokenAmountOut: bigint,  // Tokens to receive
  maxSolIn: bigint,        // Max SOL willing to spend
  commitment?: Commitment,
});
```

#### `sell(args)`
Sell tokens back to the bonding curve.

```typescript
await sell({
  signer: Signer,
  mint: Pubkey,
  tokenAmountIn: bigint,   // Tokens to sell
  minSolOut: bigint,       // Min SOL expected
  commitment?: Commitment,
});
```

#### `sellPercent(args)`
Sell a percentage of token holdings (0-100).

```typescript
await sellPercent({
  signer: Signer,
  mint: Pubkey,
  percent: number,         // 0-100
  minSolOut?: bigint,
  commitment?: Commitment,
});
```

#### `mintWithFirstBuy(args)`
Create a new token with initial purchase.

```typescript
await mintWithFirstBuy({
  signer: Signer,
  mint: Pubkey,
  name: string,
  symbol: string,
  uri: string,
  tokenAmountOut: bigint,
  maxSolIn: bigint,
  commitment?: Commitment,
});
```

### AMM Pool Operations

#### `provideLiquidity(args)`
Add liquidity to a Pump AMM pool.

```typescript
await provideLiquidity({
  signer: Signer,
  baseMint: Pubkey,
  quoteMint: Pubkey,
  maxBaseIn: bigint,
  maxQuoteIn: bigint,
  minLpOut: bigint,
  commitment?: Commitment,
});
```

#### `removeLiquidity(args)`
Remove liquidity from a Pump AMM pool.

```typescript
await removeLiquidity({
  signer: Signer,
  baseMint: Pubkey,
  quoteMint: Pubkey,
  lpAmountIn: bigint,
  minBaseOut: bigint,
  minQuoteOut: bigint,
  commitment?: Commitment,
});
```

## Examples

See the `examples/` directory:
- `quickstart.ts` — Basic operations walkthrough
- `sell-percentage.ts` — Selling by percentage
- `liquidity.ts` — Managing AMM liquidity

Run examples:
```bash
SOLANA_RPC=https://api.mainnet-beta.solana.com bun run examples/quickstart.ts
```

## Development

```bash
# Install dependencies
bun install

# Generate TypeScript clients from IDLs
bun run codegen

# Type check
bun run dev:typecheck

# Build for production
bun run build
```

## Program Addresses

- **Pump Bonding Curve**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **Pump AMM**: (check generated code or on-chain for current address)

## Architecture

```
src/
├── index.ts              # Public API surface
├── env.ts                # Configuration
├── rpc.ts                # Solana RPC wrapper
├── wallet.ts             # Signer interface
├── math.ts               # Slippage helpers
├── types.ts              # Core types
├── pumpsdk/
│   ├── generated/        # Codama-generated clients
│   ├── client.ts         # High-level wrappers
│   └── pda.ts            # PDA derivation
├── ammsdk/
│   ├── generated/        # Codama-generated clients
│   ├── client.ts         # High-level wrappers
│   └── pda.ts            # PDA derivation
└── utils/
    ├── ata.ts            # Associated token accounts
    ├── token.ts          # Token helpers
    └── tx.ts             # Transaction pipeline
```

## Status

⚠️ **Work in Progress** — Core structure is in place, but client implementations need:
1. Proper PDA derivation using @solana/kit
2. Account resolution for instructions
3. Transaction building, signing, and sending
4. Real-world testing with live programs

The skeleton provides the foundation. Next steps:
- Implement PDA helpers in `pumpsdk/pda.ts` and `ammsdk/pda.ts`
- Complete transaction building in client methods
- Add comprehensive error handling
- Test against devnet/mainnet

## Contributing

Contributions welcome! This SDK follows the architecture documented in `pump-kit-setup.md`.

## License

MIT

---

**Note**: This SDK is community-built and not officially affiliated with Pump.fun. Use at your own risk.