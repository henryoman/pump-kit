# Repository Guidelines

## Project Structure & Modules
The core SDK lives in `src/`, organized by domain: `ammsdk/` for curve math, `clients/` for Solana Kit RPC helpers, `pda/` for account derivations, and `recipes/` for high-level flows. Lightweight entry points are exposed via `src/index.ts` and `src/simple.ts`. Shared constants now live in `src/config/constants.ts`, while Solana RPC defaults sit in `src/config/rpc.ts`. Generated artifacts are emitted to `dist/`; keep commits focused on source and let CI regenerate builds. Tests reside in `tests/unit` and `tests/integration`, while shared fixtures live in `tests/setup.ts`. Utility scripts, including Codama codegen, live in `scripts/`.

## Build, Test, and Development
Use Bun throughout. Install deps with `bun install`. Run fast feedback type checks via `bun run dev:typecheck`. Build distributable ESM and declaration output using `bun run build` (cleans `dist/` first). For codegen updates, execute `bun run codegen` and commit both source and generated files.

## Coding Style & Naming
Write modern TypeScript targeting ES2022 modules. Prefer async/await and native `bigint` math. Follow the existing pattern of snake-case file names inside feature folders and named exports collected in `src/index.ts`. Keep functions small, pure when possible, and document non-obvious logic with concise comments. Two-space indentation is standard (see existing sources). Re-export types alongside functions to preserve the package surface. When working in swap APIs, expose slippage values as basis points (`slippageBps`) and name lamport-denominated fields explicitly (e.g. `estimatedSolCostLamports`).

## Testing Guidelines
Unit tests (`bun test:unit`) should remain deterministic and avoid RPC calls. Integration tests (`bun test:integration`) now exercise PDA wiring without needing live RPC endpoints—use local PDA helpers and provide deterministic inputs. When adding coverage-sensitive logic, run `bun test:coverage` and ensure new scenarios hit both success and failure paths. Name test files with the feature under test, e.g. `swap.test.ts`, and prefer descriptive `it("handles slippage limits")` blocks.

## Commit & Pull Request Practices
Mirror the Git history by using concise, sentence-case, imperative commit subjects ("Add integration helpers", "Fix slippage guard"). Group related changes together and avoid bundling generated `dist/` output unless the release workflow requires it. PRs should include a summary of intent, testing commands executed (`bun run build`, `bun test`), and references to Solana issue links or design docs when applicable. Attach screenshots or RPC transcripts only when they clarify behaviour changes.

## RPC & Security Notes
Never point integration tests at mainnet beta. Defaults now target devnet unless explicitly overridden, and the SDK fetchers accept optional `bondingCurveCreator` hints to avoid RPC calls when possible. If sharing example configs, scrub private RPC URLs and wallet keys, and prefer devnet fixtures.

## Swap & Client Notes
- `src/clients/pump.ts` now resolves the fee config PDA (`feeConfigPda`) and creator vault using either the supplied `bondingCurveCreator` or a fetched bonding-curve account. Always pass a known creator when available to avoid RPC lookups.
- High-level swap helpers (`buy`, `sell`, `quickBuy`, `quickSell`) accept either explicit lamport limits (`maxSolCostLamports` / `minSolOutputLamports`) or estimated values with `slippageBps`. Do not mix the two modes in a single call.
- Liquidity helpers (`src/liquidity.ts`) now leverage the AMM client to build deposit/withdraw instructions; callers may pass `poolAddress` or `poolCreator` when targeting specific pools (default index = 0, quote mint = WSOL).
- SOL wrapping/unwrapping helpers live in `src/utils/wsol.ts` and expose `buildWrapSolInstructions` / `buildUnwrapSolInstructions` for inline wrapping or persistent WSOL strategies.
- Transaction utilities live in `src/utils/transaction.ts` and are re-exported. They build transaction messages, accept prepend/append instruction hooks (or the new `priorityFees` object) for compute-budget/Jito flows, forward to Solana Kit send/confirm helpers, and expose simulation for pre-flight tests.
