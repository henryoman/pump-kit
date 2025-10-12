# Testing Guide for Pump Kit

This guide explains how to test Pump Kit during development and integration into your application.

## Table of Contents

- [Quick Start](#quick-start)
- [Running Tests](#running-tests)
- [Test Configuration](#test-configuration)
- [Testing Your Integration](#testing-your-integration)
- [Best Practices](#best-practices)
- [CI/CD](#cicd)

## Quick Start

```bash
# Install dependencies
bun install

# Run all tests
bun test

# Run only unit tests (fast, no network)
bun test:unit

# Watch mode for development
bun test:watch
```

## Running Tests

### Unit Tests

Unit tests are fast, deterministic, and don't require network access.

```bash
bun test tests/unit
```

These tests cover:
- Slippage calculations
- PDA derivation logic
- Utility functions
- Type conversions

### Integration Tests

Integration tests verify instruction building works correctly but don't send transactions.

```bash
# Set your RPC endpoint first
export SOLANA_RPC=https://your-dev-or-mainnet-endpoint

# Run integration tests
bun test tests/integration
```

These tests cover:
- Buy instruction building
- Sell instruction building
- Mint instruction building
- Liquidity instruction building

### All Tests

```bash
bun test
```

### Watch Mode

For development, use watch mode to automatically rerun tests on file changes:

```bash
bun test:watch
```

### Coverage

Generate test coverage reports:

```bash
bun test:coverage
```

## Test Configuration

### Environment Variables

Configure tests using the following environment variables:

```bash
# RPC endpoint to use during integration tests
export SOLANA_RPC=https://your-dev-or-mainnet-endpoint

# Commitment level (optional, defaults to "confirmed")
export SOLANA_COMMITMENT=confirmed
```

### Using .env File

Create a `.env` file in the project root:

```env
SOLANA_CLUSTER=devnet
SOLANA_COMMITMENT=confirmed
```

## Testing Your Integration

### 1. Instruction Building

Test that instructions build correctly without sending transactions:

```typescript
import { buyWithSlippage } from "pump-kit";
import { generateKeyPair } from "@solana/kit";

const testWallet = await generateKeyPair();

// This builds the instruction but doesn't send it
const instruction = await buyWithSlippage({
  user: testWallet,
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  tokenAmount: 1_000_000n,
  estimatedSolCost: 5_000_000n,
  feeRecipient: "11111111111111111111111111111111",
});

// Verify the instruction is valid
console.log("Instruction built:", instruction);
```

### 2. Simulating Transactions

Use Solana's transaction simulation to test without spending SOL:

```typescript
import { rpc } from "pump-kit";
import { createSolanaRpc } from "@solana/kit";

const devnetRpc = createSolanaRpc("https://api.devnet.solana.com");

// Build your transaction...
// Then simulate it
const simulation = await devnetRpc
  .simulateTransaction(transaction, { commitment: "confirmed" })
  .send();

console.log("Simulation result:", simulation);
```

### 3. Devnet Testing

Before going to mainnet, always test on devnet:

```bash
# Get devnet SOL from the faucet
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet

# Set your environment to devnet
export SOLANA_CLUSTER=devnet

# Run your app or tests
bun run your-script.ts
```

### 4. Testing Slippage Protection

Verify slippage calculations work as expected:

```typescript
import { addSlippage, subSlippage } from "pump-kit";

// Expand a SOL budget by 0.5% to cover price movement
const maxBudget = addSlippage(5_000_000n, 50); // 5.025M lamports
console.log("Max budget with slippage:", maxBudget);

// Tighten a SOL output floor by 0.5%
const minOut = subSlippage(1_000_000n, 50); // 995k lamports
console.log("Min output with slippage:", minOut);
```

## Best Practices

### 1. Always Use Devnet First

Never test on mainnet. Use devnet to verify your integration:

```typescript
// Good ✅
export SOLANA_CLUSTER=devnet

// Bad ❌ - Don't test on mainnet!
export SOLANA_CLUSTER=mainnet
```

### 2. Test Edge Cases

Test boundary conditions and error cases:

```typescript
import { validateSlippage } from "pump-kit";

// Test valid slippage
validateSlippage(50); // ✅

// Test edge cases
try {
  validateSlippage(-1); // Should throw
} catch (error) {
  console.log("Caught invalid slippage");
}

try {
  validateSlippage(10001); // Over 100%, should throw
} catch (error) {
  console.log("Caught excessive slippage");
}
```

### 3. Mock Network Calls in Unit Tests

Don't hit RPC endpoints in unit tests:

```typescript
// Good ✅ - Pure function test
import { addSlippage } from "pump-kit";
const result = addSlippage(1_000_000n, 50);
expect(result).toBe(1_005_000n);

// Bad ❌ - Don't call RPC in unit tests
// const account = await rpc.getAccountInfo(address).send();
```

### 4. Use Descriptive Test Names

```typescript
// Good ✅
test("buyWithSlippage builds valid instruction with default slippage", async () => {
  // ...
});

// Bad ❌
test("buy works", async () => {
  // ...
});
```

### 5. Clean Up Resources

Close connections and clean up after tests:

```typescript
import { afterAll } from "bun:test";

afterAll(() => {
  // Clean up resources, close connections, etc.
});
```

## CI/CD

### GitHub Actions

Tests run automatically on every push and pull request. See `.github/workflows/test.yml` for configuration.

### Local CI Simulation

Run the same checks that CI runs:

```bash
# Type-check
bun run dev:typecheck

# Run all tests
bun test

# Build
bun run build
```

### Coverage in CI

Coverage reports are generated automatically and uploaded to Codecov (if configured).

## Troubleshooting

### "RPC endpoint not configured"

Set your environment variables:

```bash
export SOLANA_CLUSTER=devnet
```

### "Tests timing out"

Increase the timeout or use a faster RPC endpoint:

```bash
export SOLANA_RPC=https://your-fast-rpc.com
```

### "Instruction building fails"

Check that all required accounts are derived correctly. Enable debug logging:

```typescript
console.log("User:", user.address);
console.log("Mint:", mint);
console.log("Bonding Curve PDA:", bondingCurve);
```

## Additional Resources

- [Solana CLI](https://docs.solana.com/cli) - Command-line tools for Solana
- [Solana Devnet Faucet](https://faucet.solana.com/) - Get test SOL
- [Bun Test Docs](https://bun.sh/docs/cli/test) - Bun's test runner documentation

## Support

If you encounter issues while testing:

1. Check the [test README](./tests/README.md)
2. Review example tests in `tests/` directory
3. Open an issue on GitHub with:
   - Test output
   - Environment details
   - Minimal reproduction code
