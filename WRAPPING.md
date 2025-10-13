# SOL Wrapping Guide

Most Pump Kit workflows operate on SPL tokens. Because native SOL is **not** an SPL token, AMM pools and swap flows expect lamport liquidity to arrive as **wrapped SOL (WSOL)** held in an SPL associated token account (ATA). This guide explains when and how to wrap or unwrap SOL using the SDK.

## Quick rules of thumb

- **Add or remove liquidity:** Provide WSOL as the quote side. Helpers default to the exported `WSOL` address.
- **Swaps (buy/sell):** Bonding-curve instructions also expect WSOL in the relevant ATA.
- **Bots:** Maintain a funded WSOL ATA to avoid opening/closing each time. Unwrap only when draining balances.

## Using the helper

```typescript
import {
  buildWrapSolInstructions,
  buildUnwrapSolInstructions,
  sendAndConfirmTransaction,
} from "pump-kit";

const wrap = buildWrapSolInstructions({
  owner: myWallet,
  amount: 1_000_000n, // lamports
  autoClose: true,
});

await sendAndConfirmTransaction({
  instructions: [tradeIx],
  payer: myWallet,
  prependInstructions: wrap.prepend,
  appendInstructions: wrap.append,
  rpc,
  rpcSubscriptions,
});
```

- `buildWrapSolInstructions` returns the WSOL ATA plus the wrap instructions (create ATA, transfer lamports, sync native).
- If you omit `autoClose`, the helper will not append the close instruction. You can close later with `buildUnwrapSolInstructions(myWallet)`.
- Pass an existing ATA via `associatedTokenAddress` if you manage WSOL balances manually.

## Persistent WSOL balances

For automated strategies:

1. Call `buildWrapSolInstructions` once (with `autoClose: false`) to fund a WSOL ATA.
2. Reuse that ATA across swaps and liquidity operations.
3. When you want native SOL back, submit the instructions from `buildUnwrapSolInstructions` in a cleanup transaction.

## Notes

- `WSOL` and `WSOL_ADDRESS` are exported from `pump-kit` for convenience.
- Liquidity helpers accept `poolAddress` or `poolCreator` for targeting specific pools; defaults are `poolIndex = 0` and quote mint `WSOL`.
- Combine the wrap helpers with `priorityFees`, `prependInstructions`, and `appendInstructions` to keep everything in a single transaction when needed.
