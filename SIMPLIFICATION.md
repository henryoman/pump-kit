# API Simplification - Liquidity Functions

> **Status:** Liquidity helpers are still under development and intentionally not exported in the current SDK build. This document captures the planned ergonomics once the AMM client ships.

## What We Changed

### Before (Too Complicated)
```typescript
await provideLiquidity({
  user: myWallet,
  baseMint: "TokenMintAddress",
  quoteMint: "So11111111111111111111111111111111111111112",
  baseIn: 100_000_000n,
  quoteIn: 50_000_000n,
  estimatedLpOut: 70_000_000n,  // User had to calculate this!
  slippageBps: 50,
  poolIndex: 0,  // What is this?!
});
```

### After (Super Simple)
```typescript
await addLiquidity({
  user: myWallet,
  mint: "TokenMintAddress",
  tokenAmount: 100_000_000n,
  solAmount: 50_000_000n,
  slippage: 50,  // Optional!
});
```

## What is Pool Index?

**Pool Index** is for supporting multiple liquidity pools per token pair.

### Real World Example:
- Token "ABC" might have multiple pools with SOL:
  - Pool 0: ABC/SOL (main pool, highest liquidity)
  - Pool 1: ABC/SOL (alternative pool, different fee tier)
  - Pool 2: ABC/SOL (private pool, special conditions)

### For 99% of Users:
- **You only use the main pool (index 0)**
- We now handle this automatically
- You never need to think about it

### For Advanced Users:
- If you create multiple pools for the same token
- You would need to specify which pool index
- This is rare and not needed for normal use

## What We Removed

### Removed Complexity:
1. ❌ `poolIndex` - Now automatically uses index 0 (main pool)
2. ❌ `baseMint` / `quoteMint` - Now just `mint` (SOL is implied)
3. ❌ `estimatedLpOut` - Pool calculates this automatically
4. ❌ `estimatedBaseOut` / `estimatedQuoteOut` - Pool calculates automatically
5. ❌ `calculateOptimalDeposit()` - Pool handles ratios automatically
6. ❌ `calculateWithdrawal()` - Pool handles calculations automatically

### What Remains (Essential Only):
1. ✅ `user` - Your wallet
2. ✅ `mint` - Token address
3. ✅ `tokenAmount` - How many tokens
4. ✅ `solAmount` - How much SOL
5. ✅ `slippage` - Optional protection (default 0.5%)

## Quick Functions

Even simpler for when you don't need options:

```typescript
// Add liquidity - 4 parameters
quickAddLiquidity(wallet, mint, tokenAmount, solAmount)

// Remove liquidity - 3 parameters
quickRemoveLiquidity(wallet, mint, lpAmount)
```

## Priority Fees

Priority fees are handled at the transaction level, not instruction level.

When you build your transaction:
```typescript
// You'll set priority fee when building the transaction
// (Coming soon in transaction utilities)
const tx = await buildTransaction({
  instructions: [addLiquidityIx],
  priorityFee: 1000,  // microlamports
});
```

## Bundle Size Impact

- Before: 46.36 KB
- After: 45.68 KB
- **Saved: 0.68 KB** by removing unused calculation functions

## Summary

We removed all the complexity that users don't need to think about:
- ✅ No pool index confusion
- ✅ No complex ratio calculations
- ✅ No manual output estimation
- ✅ Just: wallet + mint + amounts + optional slippage

The pool contract handles all the complex math internally!
