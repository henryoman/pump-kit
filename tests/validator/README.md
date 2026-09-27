# Signed local validator verification

Use Bun and the Solana CLI. No test transaction is sent to devnet or mainnet.
Fixture preparation reads public programs and configuration accounts from devnet.

1. Run `bun run validator:prepare`. It prints the validator startup command and
   writes program hashes and the download timestamp to `.validator/fixtures/manifest.txt`.
2. Run the printed command with a fresh ledger, then wait for startup to finish.
3. Run `bun run test:validator` in another terminal. The RPC defaults to
   `http://127.0.0.1:19899` and the WebSocket endpoint to port `19900`.
4. Verify the installed package and CLI against that validator:
   `PUMP_PACKAGE_VALIDATOR_RPC=http://127.0.0.1:19899 bun run test:package`.
   This generates a disposable wallet and exercises installed preview, dry-run,
   run, durable confirmation records, and status reconciliation. The verifier
   rejects remote RPC hosts when this option is supplied.

The script generates disposable wallets, funds them and the configured fee
recipients using the local faucet, creates an address lookup table, and sends
signed create-only, atomic first-buy, subsequent buy, partial sell, and full sell
transactions. It verifies token balances and refuses duplicate launch submission.
It also simulates and submits a deliberately impossible token-output floor and
checks that failure leaves the token balance unchanged.

Atomic create plus the unified v2 buy exceeds Solana's 1232-byte transaction
limit without a lookup table. `PrepareLaunchOptions.addressLookupTables` accepts
active table addresses mapped to their on-chain address lists. The session provisions its table locally through `launch.setup()`; CLI `run`
also performs this setup before its signed preflight simulation. Create-only transactions do not require a lookup table.

The devnet snapshot used in development enables create_v2 but disables holder
reward creation. It does not prove holder-reward launches on another deployment.
The script also buys the curve's remaining supply, migrates it using `migrate_v2`,
and checks a subsequent public `buy` and `sell` route to the Token-2022 AMM pool.
It then deposits liquidity and withdraws the resulting LP tokens, verifying
independent base/quote token-account derivation and the LP balance round trip.
Migration uses an explicit 600,000-unit compute limit. AMM SOL trades wrap and
unwrap WSOL inline; callers can select `wsolStrategy: "persistent"` instead.
