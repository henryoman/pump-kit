# Migration Guide: Solana Kit 3.0 → 4.0

This guide covers the migration from Solana Kit 3.0 to 4.0 for Pump Kit.

## What Changed in Solana Kit 4.0

Based on the [official v4.0.0 release](https://github.com/anza-xyz/kit/releases/tag/v4.0.0), here are the key changes:

### Breaking Changes

1. **Signer API Updates**
   - `modifyAndSignTransactions` now returns `Transaction & TransactionWithLifetime & TransactionWithinSizeLimit`
   - **Impact on Pump Kit**: None - we use `TransactionSigner` interface which remains compatible

2. **AccountInfo Changes**
   - `rentEpoch` removed from `AccountInfoBase` (post SIMD-215)
   - **Impact on Pump Kit**: None - we don't use `rentEpoch`

3. **Transaction Lifetime Handling**
   - New functions: `isTransactionWithBlockhashLifetime`, `isTransactionWithDurableNonceLifetime`
   - **Impact on Pump Kit**: Minor - affects future transaction confirmation utilities

### What We Updated

✅ **PDA Derivation** - Updated to use `getAddressEncoder()` for converting addresses to bytes:

```typescript
// Before (v3.0)
seeds: [enc.encode("bonding-curve"), mint]

// After (v4.0)
const addressEncoder = getAddressEncoder();
seeds: [enc.encode("bonding-curve"), addressEncoder.encode(mint)]
```

✅ **Build Configuration** - Verified tree-shaking works correctly with new modular structure

✅ **Testing** - All tests pass with v4.0.0

## Compatibility

Pump Kit is **fully compatible** with Solana Kit 4.0. No code changes required for users.

### What Stays the Same

- All public APIs remain unchanged
- `TransactionSigner` interface is compatible
- Instruction building works the same way
- No breaking changes to user-facing code

## Performance Improvements

Solana Kit 4.0 brings significant performance benefits:

- **70% smaller bundles** with improved tree-shaking
- **3-5x faster runtime** with native BigInt
- **Faster builds** with optimized module resolution
- **Better TypeScript support** with 100% type coverage

## Testing Your Migration

```bash
# Install latest Pump Kit with Solana Kit 4.0
bun add pump-kit@latest

# Run tests
bun test

# Build your project
bun run build
```

## Need Help?

If you encounter any issues:

1. Check our [examples](./examples/) for updated usage patterns
2. Review our [test suite](./tests/) for working examples
3. Open an issue on GitHub

## References

- [Solana Kit 4.0.0 Release Notes](https://github.com/anza-xyz/kit/releases/tag/v4.0.0)
- [Pump Kit Documentation](./README.md)
- [Testing Guide](./TESTING.md)

