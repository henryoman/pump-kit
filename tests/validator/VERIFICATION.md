# Launch workflow verification — updated 2026-09-26

The current source passed a signed local-validator round trip against public
Pump, PumpSwap, fee, and Mayhem binaries downloaded from devnet. The validator
used local RPC port 19899; no verification transaction was submitted to devnet
or mainnet. Reproduce with the commands in [README.md](README.md).

Verified behavior:

- Create-only and atomic create plus a 0.01 SOL first buy confirm with Token-2022.
- A lookup table allows the atomic transaction to fit Solana's packet limit.
- Subsequent public buys and partial/full sells change balances as expected.
- Compatibility buy/sell recipes use v2 and complete a signed round trip.
- Duplicate launch submission is refused. An impossible output floor fails
  simulation and submission without changing the token balance.
- Buying the remaining curve supply completes the curve. `migrate_v2` confirms.
- Public buy/sell then route to the migrated AMM and complete with independent
  Token-2022 base and legacy WSOL quote programs.

Final local create-only signature:
`63EGKmj47dTMdjBJ7ur6sTgnxXePdbjujWmniYYPPvsUCBCVZT3br4wg4qTcBqdQF63LKqtkeKtUF5U3B7YLWC9D`

Final local atomic launch signature:
`31tGmhDazrUkKpV8LautCzBuDojw8qiwLYDg9iFo7obvGyzRpBbf4Emp6ETENDxLWdnP9ztAjVK3xHkayszJf3oz`

These signatures refer only to the disposable local ledger.

Additional checks passed: Bun typecheck, lint, 61 deterministic unit/integration
tests, coverage execution, distributable build, and a fresh packed installation
with both package entry points and the installed CLI. Independently constructed
binary fixtures verify the current curve and pool account offsets. IDL provenance
and changes are recorded in [UPSTREAM.md](../../idl/UPSTREAM.md).

The installed CLI also passed local `preview`, signed `dry-run`, `run`, and
`status` commands. Its durable record contained the generated mint, submitted
signature, blockhash lifetime, and confirmed state. This checks the packed CLI
launch path, in addition to the source SDK validator flow.

The September 26 rerun additionally confirmed decimal-string curve and AMM buys,
a mixed Token-2022/WSOL liquidity deposit, and withdrawal of all newly minted LP
tokens. Deposit and withdrawal resolve each mint owner independently. The LP
balance increased by exactly 1,000,000 base units and returned to zero after
withdrawal. CI, coverage, the packed install, and the signed installed CLI were
rerun successfully after these changes.

The signed checks exposed and fixed compute-budget encoding, missing migration
boost accounts, missing AMM pool-v2/buyback accounts, and WSOL instruction order.
At the time of this run, AMM trades wrapped/unwrapped SOL inline by default. The current swap API defaults to persistent WSOL and offers inline wrapping explicitly.

Remaining boundary: this is local execution against downloaded devnet programs,
not proof of the mainnet deployment or a live launch. The snapshot disables
holder-reward creation; validation rejects that choice on this deployment.
Non-SOL launch configs and Mayhem/cashback session creation are unsupported.
Atomic simulation requires an active lookup table: call `setup()` first, or
supply an existing table. Setup incurs separate rent and transaction fees.
First-buy budgets exclude rent, fees, and lookup-table setup costs.

A separately authorized live launch is still required before calling this
package launch-ready. Its network, token metadata, recipient/permanent choices,
wallet, and total spend limit must be previewed before submission.

On 2026-09-27, the signed source verifier was rerun against the same locally
loaded devnet program binaries after the swap snapshot and persistent-WSOL
changes. It passed create-only, atomic first buy, curve buy/sell, curve
completion, migration, AMM buy/sell, and mixed-program deposit/withdrawal.
This remains a local-validator check, not a mainnet or unattended-bot run.
