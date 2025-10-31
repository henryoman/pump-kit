# Pump Kit Test Suite

This directory contains comprehensive tests for the Pump Kit SDK.

## Test Scripts

### `test-sdk-comprehensive.ts`
Comprehensive SDK test suite that validates:
- ✅ All PDA derivation functions (13 tests)
- ✅ Slippage utilities (5 tests)
- ✅ Instruction building (4 tests)
- ✅ Transaction building (2 tests)
- ✅ WSOL utilities (3 tests)
- ✅ Liquidity functions (1 test)

**Total: 28 tests** (27 passing, 1 skipped due to network)

**Run:**
```bash
bun test-swap/test-sdk-comprehensive.ts
```

### `test-buy.ts`
Live buy transaction test. Buys 0.01 SOL worth of tokens.

**Run:**
```bash
bun test-swap/test-buy.ts
```

**Requirements:**
- `keypair.json` file in this directory
- Wallet with sufficient SOL balance
- Valid token mint address

### `test-sell.ts`
Live sell transaction test. Sells 100% of wallet's token balance.

**Run:**
```bash
bun test-swap/test-sell.ts
```

**Requirements:**
- `keypair.json` file in this directory
- Wallet with token balance
- Valid token mint address

## Configuration

All test scripts use environment variables for configuration:

- `RPC_URL` - Solana RPC endpoint (default: mainnet-beta)
- `RPC_WS_URL` - WebSocket RPC endpoint (auto-derived from RPC_URL)

## Keypair Setup

Place your test wallet keypair at `test-swap/keypair.json`:

```json
[123, 45, 67, ...]
```

**⚠️ WARNING:** Never commit `keypair.json` to git! It's already in `.gitignore`.

## Test Results

Last run: **27/28 tests passing** ✅

- All PDA derivations working correctly
- All slippage utilities validated
- Instruction building functional
- Transaction utilities working
- WSOL wrapping/unwrapping working
- Liquidity functions functional

The only skipped test is due to network connectivity (expected in CI environments).
