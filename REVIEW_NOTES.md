# Repository Findings & Recommendations

## Overview
- Pump Kit exposes a high-level TypeScript SDK built on Solana Kit 4.0, with generated clients for the Pump bonding curve and AMM programs plus recipe-style wrappers (`src/index.ts`).
- Core swap flows (`buyWithSlippage`/`sellWithSlippage`) are mostly wired, but liquidity, AMM, and transaction utilities remain stubs while still exported.
- Latest Solana Kit v4.0.0 release (2025-10-08) renames the upstream repo to `anza-xyz/kit` and brings signing/rpc API shifts that the unfinished transaction helpers will need to respect.

## Critical Issues
- ✅ **Resolved** — Buy/sell builders now derive the fee config PDA explicitly (`feeConfigPda()` in `src/pda/pump.ts`) and pass it through `src/clients/pump.ts`.
- ✅ **Resolved** — `creatorVaultPda` now receives the actual creator address. Callers can supply `bondingCurveCreator`; otherwise the client fetches the bonding-curve account via the configured RPC.

- Liquidity and transaction utilities remain intentionally hidden from the public surface; keep them internal until AMM support ships (`src/liquidity.ts`, `src/utils/transaction.ts`).
- The liquidity example now communicates its WIP status (`examples/liquidity.ts`). Revisit once AMM builders are validated.
- The AMM client wrappers remain TODO-heavy (`src/clients/amm.ts`). No public exports reference them after the latest cleanup.
- `WSOL` constant in `src/liquidity.ts:9` is still unused; wire it into the eventual implementation or drop it when AMM support arrives.

- Swap APIs now use explicit lamport-based naming (`tokenAmount`, `estimatedSolCostLamports`, `slippageBps`) and enforce one of two input modes (explicit max cost or estimated cost with slippage).
- `mintWithFirstBuy` aligns with swap defaults by accepting an optional fee recipient and defaulting to `DEFAULT_FEE_RECIPIENT` when omitted.
- RPC configuration defaults to devnet to match the non-production guidance (`src/config/rpc.ts`).

- Integration tests assert account ordering and no longer require RPC access by injecting deterministic bonding-curve creators (`tests/integration/buy.test.ts`, `tests/integration/sell.test.ts`).
- `createTestWallet()` now returns a signer with an address (`@solana/signers`), keeping tests deterministic without external infrastructure.
- Future Codama visitors can inject typed helpers (e.g. `feeConfigPda`) to centralize PDA construction when the AMM client matures.

## Solana Kit 4.0 Impact
- Release notes (v4.0.0, 2025-10-08) highlight that `TransactionModifyingSigner` implementations must now return `Transaction & TransactionWithLifetime & TransactionWithinSizeLimit`, and helpers like `sendAndConfirmTransactionFactory` expect lifetime checks. The current `buildTransaction`/`sendAndConfirmTransaction` stubs need to adopt these types once implemented.
- `rentEpoch` disappeared from `AccountInfoBase`; generated account codecs already omit it, but ensure any consumer code or tests don’t rely on it.
- RPC additions such as `loadedAccountsDataSize` in simulation responses can underpin richer validation when you finish the `simulateTransaction` helper.

## Recommended Next Steps
1. Implement correct PDA derivations for fee config and creator vault, add regression tests, and regenerate code as needed.
2. Hide or finish all exported stubs (liquidity, AMM, transaction utilities) before the next release, and align docs/examples accordingly.
3. Tighten the public API ergonomics: clarify slippage units, supply consistent defaults, and default RPC to devnet.
4. Expand integration tests to assert account ordering and args, and configure CI so tests fail when RPC context is missing.
5. When completing transaction helpers, conform to the Solana Kit 4.0 transaction lifetime and signer requirements to stay forward-compatible.
