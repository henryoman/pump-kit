# Swap repair verification

PumpKit retains local quote math, Solana Kit transaction construction, and a
single transaction executor. Swap helpers now return explicit plans; this is a
breaking API change for callers that previously expected one instruction.

| Brief requirement | Implementation and evidence |
| --- | --- |
| Transaction correctness | Official compute-budget builders, explicit base64 simulation, true/true boolean conflict validation, paired lifetime, preserved confirmed-failure logs, and typed unknown outcomes. `tests/unit/transaction.test.ts` checks bytes and RPC options. |
| Current protocol accounts | Official IDLs pinned in `idl/UPSTREAM.md`; Codama generation customizes account decoding for documented historical trailing defaults. Layout tests reject partial fields and wrong discriminators. Mint owners and decimals are resolved independently. |
| Local pricing and limits | Curve pricing uses virtual reserves alone with real liquidity guards. Shared fee selection covers canonical tiers, stable/exotic schedules, and creator overrides. Exact-input buys retain the budget; exact-output buys accept a token target and a hard spending cap. Official SDK parity fixtures include large integers and rounding boundaries. |
| Explicit plans and lifecycle | Plans contain an ordered instruction array and quote. The resolver distinguishes active curves, pending migration, and available AMM pools. Integration tests cover all three states and RPC failures. No instruction carries hidden setup properties. |
| Reused state and Kit account setup | `resolveAmmTradingContext` retains pool/vault addresses. Each AMM plan refreshes pool, configuration, fees, mint headers, and vault balances in one RPC snapshot; curve plans likewise retain one snapshot slot. Builders reuse that state. Kit idempotent ATA, transfer, sync-native, and close builders replace legacy conversions. Persistent WSOL is the default. Raw bigint inputs and exact decimal strings are supported; tiny percentage sells reject zero units. |
| Package and documentation | Both advertised JS entry points are built and checked from an installed tarball. Legacy Solana packages are absent from the consumer runtime. Tracked cache files and unused Codama configuration are removed; `bun run release` is the single documented release command. Liquidity deposits request exact LP output. Custom pool creation remains explicitly unimplemented. |

Verification commands:

- `bun run ci` — typecheck, lint, deterministic unit/integration tests, and build.
- `bun run test:coverage` — includes success and failure paths for repaired behavior.
- `bun run test:package` — installs and imports the packed primary/simple entry points.
- `bun run codegen` — generated output checked for reproducibility.

Quote fixture provenance is recorded in `tests/fixtures/README.md`.
These checks do not submit trades. Launch preparation and liquidity remain
separate APIs; the swap repair does not certify a live launch workflow.
