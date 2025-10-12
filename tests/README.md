# Pump Kit Tests

This directory contains tests for the Pump Kit SDK.

## Test Structure

- `setup.ts` - Common test utilities and configuration
- `unit/` - Unit tests that don't require network access
  - `slippage.test.ts` - Slippage calculation tests
  - `pda.test.ts` - PDA derivation tests
- `integration/` - Integration tests that build instructions
  - `buy.test.ts` - Buy instruction building tests
  - `sell.test.ts` - Sell instruction building tests

## Running Tests

### All Tests

```bash
bun test
```

### Unit Tests Only

```bash
bun test tests/unit
```

### Integration Tests

```bash
bun test tests/integration
```

### Watch Mode

```bash
bun test --watch
```

## Configuration

Tests use environment variables for configuration. Provide the RPC endpoint you want to exercise:

```bash
SOLANA_RPC=https://your-dev-or-mainnet-endpoint
```

## Test Philosophy

### Unit Tests
- No network access required
- Fast and deterministic
- Test pure functions and logic
- Run on every commit

### Integration Tests
- Build instructions but don't send transactions
- Verify correct account derivation
- Can run without funded wallets
- Skip if no RPC configured

### E2E Tests (Future)
- Actually send transactions to devnet
- Require funded test wallets
- Run manually or in CI with secrets
- Test complete user flows

## Best Practices

1. **Keep tests fast** - Unit tests should run in milliseconds
2. **Mock network calls** - Don't hit RPC endpoints in unit tests
3. **Use devnet** - Never test on mainnet
4. **Skip when needed** - Use `skipIfNoRpc()` for tests that need RPC
5. **Clean up** - Close connections and clean up resources
6. **Descriptive names** - Test names should describe what they verify

## Coverage

Run tests with coverage:

```bash
bun test --coverage
```

## CI/CD

Tests run automatically on:
- Every push to main
- Every pull request
- Scheduled daily runs

Integration tests run with a devnet RPC endpoint configured in GitHub secrets.

