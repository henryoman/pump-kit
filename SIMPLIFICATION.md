# Liquidity API Overview

The AMM helpers are now live and exposed via `addLiquidity`, `removeLiquidity`, and the quick wrappers exported from `pump-kit`.

Key points:

- Pools are derived from the tuple `(index, poolCreator, baseMint, quoteMint)`. If you already know the pool address, pass it directly via `poolAddress`; otherwise provide `poolCreator` (defaults to the caller) and `poolIndex` (defaults to `0`).
- Quote mint defaults to wrapped SOL (`WSOL`), but you can target any SPL/token-2022 mint by supplying `quoteMint` and, if needed, custom `tokenProgram`/`token2022Program` overrides.
- The helpers return instructions only. Funding accounts (wrapping SOL, creating ATAs, etc.) must be handled by the caller or by prepending additional instructions when building the transaction.

```typescript
import { addLiquidity, removeLiquidity, WSOL } from "pump-kit";

const depositIx = await addLiquidity({
  user: wallet,
  baseMint: "CoinMint",
  quoteMint: WSOL,
  poolIndex: 0,
  poolCreator: coinCreator,
  maxBaseAmountIn: 1_000_000n,
  maxQuoteAmountIn: 5_000_000n,
  minLpTokensOut: 0n,
});

const withdrawIx = await removeLiquidity({
  user: wallet,
  baseMint: "CoinMint",
  quoteMint: WSOL,
  lpAmountIn: 500_000n,
  minBaseAmountOut: 0n,
  minQuoteAmountOut: 0n,
});
```

For bots or priority-fee flows, pair these helpers with the transaction utilities' `prependInstructions`/`appendInstructions` options to insert compute-budget tweaks or Jito tips ahead of submission.
