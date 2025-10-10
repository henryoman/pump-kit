# Repository Findings & Recommendations

## Overview
- Pump Kit exposes a high-level TypeScript SDK built on Solana Kit 4.0, with generated clients for the Pump bonding curve and AMM programs plus recipe-style wrappers (`src/index.ts`).
- Core swap flows (`buyWithSlippage`/`sellWithSlippage`) are wired, the SDK adds high-level conveniences (`createAndBuy`, wrap helpers, event manager) and AMM-backed liquidity functions.
- Latest Solana Kit v4.0.0 release (2025-10-08) renames the upstream repo to `anza-xyz/kit` and brings signing/rpc API shifts to stay aware of while finishing the remaining surfaces.

## Critical Issues
- ✅ **Resolved** — Buy/sell builders now derive the fee config PDA explicitly (`feeConfigPda()` in `src/pda/pump.ts`) and pass it through `src/clients/pump.ts`.
- ✅ **Resolved** — `creatorVaultPda` now receives the actual creator address. Callers can supply `bondingCurveCreator`; otherwise the client fetches the bonding-curve account via the configured RPC.

- Liquidity helpers rely on the AMM client (`src/clients/amm.ts`) to derive pool PDAs and user ATAs; callers can specify `poolAddress` or `poolCreator` when they need to target specific pools.- Transaction utilities in `src/utils/transaction.ts` accept a `priorityFees` object, auto-generate compute-budget instructions, and pair with the new wrap helpers so callers can prepare WSOL inside the same transaction.

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
1. Document how to discover pool creators/addresses (CLI snippet or RPC helper) so liquidity providers can target the correct AMM PDA without guesswork.
2. Layer in an end-to-end example or CLI that uses `createAndBuy`, wrap helpers, and liquidity ops in one flow.
3. Add event subscription helpers (create/trade/complete logs) comparable to the legacy SDK.
4. Add end-to-end examples (or bots) that showcase Jito bundle construction using the SDK's prepend/append and liquidity helpers.
5. Continue rounding out AMM buy/sell support if those instructions become part of the public surface.
