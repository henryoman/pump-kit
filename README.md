# Pump Kit

![Pump Kit - Solana Kit 6](https://amaranth-manual-buzzard-640.mypinata.cloud/ipfs/bafkreif6akiu636nsc53bkexhuxoy3ddscyjepsbjdzldf3wxyl6rl4tqm)

[![npm version](https://img.shields.io/npm/v/pump-kit.svg?logo=npm&label=npm)](https://www.npmjs.com/package/pump-kit)
![Bun >= 1.3.0](https://img.shields.io/badge/bun-%3E%3D1.3.0-000000?logo=bun&logoColor=fff)
![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-43853d?logo=node.js&logoColor=fff)

A TypeScript SDK for Pump.fun built on **Solana Kit 6**. Designed for high-performance applications including launch bots, bundlers, and low-latency trading systems using latest Solana best practices.

## Features

- **Solana Kit 6** – Built on the latest Solana development framework
- **Modern transaction patterns** – Optimized for speed and reliability
- **Unified swaps** – `buy`/`sell` auto-route between bonding curves and AMM pools
- **Curve helpers** – Direct access to bonding-curve instructions when you need them (`curveBuy`, `curveSell`)
- **AMM helpers** – Deterministic AMM operations with percentage-aware selling (`ammBuy`, `ammSell`)
- **Automatic slippage protection** – Built-in guards for buy/sell operations
- **Full TypeScript support** – Strongly typed throughout with complete type coverage

## Separate launch and liquidity APIs

Swap plans trade existing coins. Launch helpers have their own preparation and
submission workflow described below. Custom AMM pool creation remains
unimplemented. Liquidity helpers are separate from swap planning; their deposit
deposit contract requests an exact `lpTokenAmountOut`, subject to maximum base
and quote inputs. Custom pool creation is not needed to trade existing pools.

---

## Installation

```bash
bun add pump-kit
```

---

## Quick Start

### Setup

```ts
import { createSolanaRpc } from "@solana/kit";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
```

Swap helpers return a `SwapPlan` with `venue`, `contextSlot`, `quote`, and one
ordered `instructions` array. They prepare instructions without broadcasting.
Pass the complete array to Kit or the transaction executor:

```ts
const plan = await curveBuy({ user: myWallet, mint, amountIn: 500_000_000n, rpc });
await sendAndConfirmTransaction({
  instructions: plan.instructions, payer: myWallet, rpc, rpcSubscriptions,
});
```

`amountIn` uses lamports for buys and token base units for sells. Decimal input
boundaries may use `solAmount: "0.5"` or `tokenAmount: "125000"` instead; do not
combine raw and decimal modes. Percentage sells that round below one raw unit
are rejected. Buys default to exact-input mode: the supplied budget is encoded unchanged and
slippage reduces the token-output floor (`quote.kind === "exactIn"`). An explicit
`minAmountOut` may replace `slippageBps`; do not supply both. `kind: "exactOut", amountOut: 750000n, maxAmountIn: 1000000n` buys the exact
token base-unit target with a hard lamport cap. Omit `maxAmountIn` to estimate
the cap using `slippageBps`; do not supply both. Do not combine `amountOut`
with an input budget. Sells
also enforce a minimum quote output (`exactIn`). Curve plans retain the RPC context slot of one account snapshot containing
curve reserves, configuration, fee tiers, and both mints. Complete curve and fee
overrides require their own `contextSlot`. AMM plans likewise snapshot the pool, vault balances, configuration, fee tiers,
and both mints together. For repeated AMM trading, call `resolveAmmTradingContext`
once and pass its result as `tradingContext` to `ammBuy` / `ammSell`; the plan
builder refreshes mutable state without rediscovering the pool.

### Buy Tokens (Curve)

```ts
import { curveBuy } from "pump-kit";

await curveBuy({
  user: myWallet,
  mint: "TokenMintAddress",
  amountIn: 500_000_000n, // Lamport budget
  slippageBps: 50,       // 0.5% slippage (optional)
  rpc,
});
```

### Sell Tokens (Curve)

```ts
import { curveSell } from "pump-kit";

// Sell specific amount
await curveSell({
  user: myWallet,
  mint: "TokenMintAddress",
  amountIn: 125_000_000_000n, // Token base units
  rpc,
});

// Sell percentage of wallet
await curveSell({
  user: myWallet,
  mint: "TokenMintAddress",
  useWalletPercentage: true,
  walletPercentage: 40,  // Sell 40% of holdings
  rpc,
});
```

### Buy Tokens (AMM)

```ts
import { ammBuy } from "pump-kit";

await ammBuy({
  user: myWallet,
  mint: "TokenMintAddress",
  amountIn: 500_000_000n,
  poolAddress: "PoolAddress", // optional; canonical index 0 is the default
  rpc,
});
```

### Sell Tokens (AMM)

```ts
import { ammSell } from "pump-kit";

await ammSell({
  user: myWallet,
  mint: "TokenMintAddress",
  useWalletPercentage: true,
  walletPercentage: 100,
  poolCreator: "CreatorAddress",
  rpc,
});
```

---

## API Reference

### Curve Swap Helpers

```ts
// Buy tokens on the bonding curve
curveBuy({ user, mint, solAmount, slippageBps?, rpc, ... })

// Sell tokens on the bonding curve
curveSell({ user, mint, tokenAmount?, useWalletPercentage?, walletPercentage?, rpc, ... })
```

### AMM Swap Helpers

```ts
// Buy tokens from the AMM pool using a SOL budget
ammBuy({ user, mint, solAmount, rpc, quoteMint?, poolCreator?, poolAddress? })

// Sell tokens into the AMM pool (supports percentage-based selling)
ammSell({
  user,
  mint,
  tokenAmount?,
  useWalletPercentage?,
  walletPercentage?,
  rpc,
  quoteMint?,
  poolCreator?,
  poolAddress?,
})
```

### Transaction Utilities

```ts
// Build transaction
buildTransaction({ instructions, payer, prependInstructions?, appendInstructions?, rpc })

// Send and confirm
sendAndConfirmTransaction({ instructions, payer, rpc, rpcSubscriptions, ... })

// Simulate transaction
simulateTransaction({ instructions, payer, rpc, options? })
```

---

## Agent Integration

- `llms.txt` provides an LLM-oriented index of the SDK and usage constraints.
- `metadata/actions-registry.json` provides a machine-readable action map for tool/agent wrappers.

---

## License

MIT

### Prepare a Token-2022 launch

Regular `buy`, `sell`, `curveBuy`, `curveSell`, `ammBuy`, and `ammSell` accept
decimal strings for `solAmount` and `tokenAmount`. Strings preserve exact base
units, reject excess decimal precision, and enforce positive u64 trade inputs.
Existing number inputs remain supported when their base-unit values are safe.

Liquidity helpers accept `baseTokenProgram` and `quoteTokenProgram` independently.
Pass `rpc` to `addLiquidity` / `removeLiquidity` to resolve each mint's owner, or
pass both program hints to build without RPC. This supports Token-2022 tokens
paired with legacy WSOL. Liquidity instructions still require funded token
accounts and an LP ATA; use the exported ATA and WSOL builders when assembling
the transaction. The required `lpTokenAmountOut` field is the exact LP quantity
requested by the deposit instruction.

The session API builds `create_v2` and, when requested, an atomic first buy from
an exact decimal SOL budget. The budget covers the swap input including protocol
and creator fees; account rent and transaction fees are additional.

```ts
import { createPump } from "pump-kit";

const pump = createPump({ rpcUrl }); // defaults to devnet when omitted
const launch = await pump.launch.prepare({
  schemaVersion: 1,
  token: { name: "Example", symbol: "EX", metadataUri: "ipfs://..." },
  quote: "SOL",
  firstBuy: { amount: "0.25", slippageBps: 100 }, // optional
}, {
  signer: wallet,
  saveRecord: async (record) => {
    // Persist durably in your application's store before broadcast.
    await launchStore.save(record);
  },
});
console.log(launch.addresses, launch.preview);
await launch.setup(); // sends lookup-table setup transactions when needed
const simulation = await launch.simulate();
if (simulation.value.err) throw new Error("Launch simulation failed");
await launch.send();
```

`creatorFees.recipient` defaults to the signer. Set
`creatorFees: { holderReward: true }` to permanently direct creator fees to
holders instead; this cannot be combined with a creator fee recipient. Mayhem
and cashback creation are disabled in this session API. Cashback creation is
deprecated by the program.

The persistence callback receives the mint, signed transaction signature,
blockhash lifetime, and submission/confirmation state. A failed persistence
write prevents broadcast. After submission begins, the session refuses another
send: reconcile the saved signature before taking further action. Without a
persistence callback this protection lasts only for the session's lifetime;
applications performing repeated launches must supply a durable store.

Signed local validator verification covers create-only, atomic first buy,
subsequent trading, curve completion, migration, and AMM trading. See
[the validator instructions](tests/validator/README.md). A separately authorized
live launch remains required before calling the package launch-ready.

### Bun launch CLI

The package includes a Bun CLI. Keep your wallet keypair and RPC credentials
outside the portable JSON config.

```sh
bunx pump-kit validate launch.json
bunx pump-kit preview launch.json --signer-address YOUR_ADDRESS
bunx pump-kit setup launch.json --keypair /path/to/wallet.json
# Use the table address printed by setup for a read-only atomic dry-run.
bunx pump-kit dry-run launch.json --keypair /path/to/wallet.json --lookup-table TABLE_ADDRESS
bunx pump-kit run launch.json --keypair /path/to/wallet.json --record launch-record.json
bunx pump-kit status --record launch-record.json
```

Use `--rpc-url` (or `SOLANA_RPC`) and `--websocket-url` to supply endpoint
credentials separately. Defaults target devnet. `run` performs a signed
simulation and stops on simulation failure. Each run requires a fresh record
path; records are written with owner-only permissions and flushed to disk before
submission. Reusing a record path fails before broadcast. `status` reads the
saved signature from transaction history without submitting anything. An unknown
signature remains uncertain and does not authorize another launch.

`mintWithFirstBuy` now builds `create_v2`, Token-2022 ATA setup, and a unified v2
buy. Prefer `firstBuyAmountSol: "0.25"` to derive the first-buy quote internally.
Use the returned `instructions` array in full and in order. The returned
`createInstruction` and `buyInstruction` are convenient references, not a complete
transaction by themselves. `createAndBuy` submits the full instruction array.
Omit `mintAuthority`; a supplied value must match the program's derived PDA.

`launch.setup()` sends lookup-table setup transactions and costs rent; preview
reports whether it is needed. `launch.send()` performs setup automatically if no
active table is supplied. `simulate()` never broadcasts setup transactions.
Existing tables can be passed through `addressLookupTables` or the CLI's
`--lookup-table`. CLI `run` sets up a table before its preflight simulation.

Transaction lifetime overrides use one `lifetime: { blockhash, lastValidBlockHeight }`
object, with a `bigint` expiration height from the same RPC response. Omit it to
fetch a fresh pair. `TransactionExecutionError` exposes `outcome`, `signature`,
and `lifetime`: `failed` means the signature has an execution error; `unknown`
means confirmation was not established. Reconcile that signature before signing
another order. Program logs are retained when diagnostic reads succeed.


ATA and WSOL instruction helpers are asynchronous Kit-native builders; await
`buildCreateAtaInstruction`, `buildWrapSolInstructions`, and
`buildUnwrapSolInstructions`. They keep lamports as `bigint` and retain supplied
signers. ATA creation is idempotent and supports Token-2022 and PDA owners.
AMM plans retain WSOL by default; use `wsolStrategy: "inline"` to close it after
the swap. Rent and transaction fees are separate from the swap budget.


`resolveSwapVenue({ rpc, mint })` returns `curve`, `migrationPending`, or `amm`.
A completed curve with no canonical pool is pending migration; convenience swaps
throw `MigrationPendingError` with its pool address. RPC failures remain errors.
The default AMM is the canonical index-0 pool derived from the mint's Pump pool
authority and WSOL. Explicit pool addresses or creator/index options select other
pools; the owner and mint pair are validated. There is no program-account scan.
For repeated trading, retain the resolved pool address and call the explicit
venue helper, refreshing mutable state for each quote.


Event managers now take a Kit RPC subscriptions client with `logsNotifications`
(for example, `createSolanaRpcSubscriptions(wsUrl)`). Removing the last listener
aborts the subscription; an optional `onError` callback receives subscription
failures. Lookup-table setup also uses Kit builders and keeps slot values as
`bigint`. Legacy web3.js and SPL Token are absent from runtime dependencies.


## Release

Use one entry point: `bun run release patch` (or `minor`, `major`, or an explicit
`x.y.z`). It requires a clean worktree, runs CI, bumps the package version,
creates a release commit and tag, and pushes them to trigger the GitHub release
workflow. That workflow publishes npm and release assets. `--no-push` prepares
the commit and tag locally. Release commands are for publication; ordinary
verification uses `bun run ci` and `bun run test:package`.
