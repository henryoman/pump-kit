# pump‑kit — **Bun + TypeScript + Solana Kit 3.0 + Codama** Setup

> Goal: ship a **minimal, fast SDK** exposing only the core user controls and flows: **mint (with first buy)**, **buy**, **sell**, **sell %**, **provide liquidity**, **remove liquidity**.  
> Constraints: **Bun** runtime/tooling, **TypeScript-first** (types for users), **bundle to JS** (ESM) with declarations, **Solana Kit 3.0** transport, **Codama** for program clients (IDL→TS).

---

## 0) References (read once)

- Solana Kit (`@solana/kit`) – modern, transport‑agnostic RPC & tooling.  
  <https://github.com/anza-xyz/kit>
- Codama – IDL→TypeScript clients; has a JavaScript renderer compatible with Solana Kit.  
  <https://github.com/codama-idl/codama> (see **renderers-js**)
- Solana commitment levels (processed/confirmed/finalized):  
  <https://solana.com/developers/guides/advanced/confirmation> and <https://solana.com/docs/rpc>

---

## 1) Repository layout (single package, simple & fast)

```
pump-kit/
├─ README.md
├─ LICENSE
├─ package.json
├─ bunfig.toml                   # optional; keeps build flags in one place
├─ tsconfig.json                 # TS compile + declaration emit
├─ tsconfig.build.json           # emit types only (faster)
├─ .editorconfig
├─ .gitignore
├─ .npmrc                        # `engine-strict=true`, ESM only
├─ src/
│  ├─ index.ts                   # public API surface
│  ├─ env.ts                     # RPC URL, default commitment, timeouts
│  ├─ rpc.ts                     # createSolanaRpc wrapper (Solana Kit 3)
│  ├─ wallet.ts                  # minimal signer interface (Keypair/WalletAdapter)
│  ├─ math.ts                    # slippage/math helpers
│  ├─ types.ts                   # exported SDK types
│  ├─ pumpsdk/                   # Pump bonding‑curve program
│  │  ├─ idl/pump.json           # (place IDL here — do not commit if upstream changes frequently)
│  │  ├─ generated/              # Codama output (TS clients & builders)
│  │  ├─ client.ts               # thin wrappers: mintWithFirstBuy, buy, sell, sellPercent
│  │  └─ pda.ts                  # PDA helpers if needed
│  ├─ ammsdk/                    # Pump AMM program
│  │  ├─ idl/pump_amm.json       # (place IDL here)
│  │  ├─ generated/              # Codama output
│  │  ├─ client.ts               # provideLiquidity, removeLiquidity, buy/sell via pool
│  │  └─ pda.ts
│  └─ utils/
│     ├─ ata.ts                  # associated token account helpers
│     ├─ token.ts                # SPL Token helpers (2022/legacy switch)
│     └─ tx.ts                   # build/sign/send/confirm pipeline
├─ scripts/
│  ├─ codama-generate.ts         # Bun script: IDL → TS (renderers-js)
│  └─ prepublish.ts              # cleans dist, builds, type emits
├─ dist/                         # build artifacts (gitignored)
└─ examples/
   ├─ quickstart.ts              # mint+first buy, then buy/sell
   ├─ sell-percentage.ts         # 10%, 25%, 50%, 100%
   └─ liquidity.ts               # provide/remove
```

**Why this shape?** One package keeps install & docs trivial. We isolate **program-specific** code in `pumpsdk/` and `ammsdk/` while exposing a flat **user API** from `src/index.ts`.

---

## 2) Initialize the project (Bun‑only)

```bash
mkdir pump-kit && cd pump-kit

# Initialize
bun init -y

# Runtime deps
bun add @solana/kit

# Dev deps: TypeScript & codegen
bun add -d typescript @types/node \
  codama @codama/renderers-js

# (Optional) lints/format if you want
# bun add -d biome
```

> We intentionally **do not** pull heavy frameworks. `@solana/kit` replaces `@solana/web3.js` v2+ and gives cleaner RPC + transports.

---

## 3) TypeScript config (emit JS + d.ts)

**`tsconfig.json`** (for type‑checking during dev):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "examples"]
}
```

**`tsconfig.build.json`** (fast declarations only):

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist/types"
  },
  "include": ["src"]
}
```

**`bunfig.toml`** (optional, for a single build target):

```toml
[build]
entrypoints = ["./src/index.ts"]
outdir = "dist"
format = "esm"
minify = true
sourcemap = "external"
```
> Bun’s bundler outputs ESM JS. We rely on `tsc` to emit `.d.ts` for consumers.

---

## 4) NPM scripts

**`package.json` (relevant fields):**

```jsonc
{
  "name": "pump-kit",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "src/**/*.ts", "README.md", "LICENSE"],
  "engines": { "node": ">=18", "bun": ">=1.1.0" },
  "scripts": {
    "dev:typecheck": "tsc -p tsconfig.json --noEmit",
    "build:js": "bun build",
    "build:types": "tsc -p tsconfig.build.json",
    "build": "rm -rf dist && bun run build:js && bun run build:types",
    "codegen": "bun run scripts/codama-generate.ts",
    "prepublishOnly": "bun run build"
  }
}
```

---

## 5) Environment (RPC + confirmation)

**`src/env.ts`**
```ts
export const RPC_URL = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
export const COMMITMENT: "processed" | "confirmed" | "finalized" =
  (process.env.SOLANA_COMMITMENT as any) ?? "confirmed"; // sensible default
export const TX_TIMEOUT_MS = Number(process.env.SOLANA_TX_TIMEOUT_MS ?? 60_000);
```

- Default **`confirmed`** for a practical latency/safety balance; override via `SOLANA_COMMITMENT`.  
- See Solana docs for commitment semantics.

---

## 6) RPC wrapper (Solana Kit 3.0)

**`src/rpc.ts`**
```ts
import { createSolanaRpc, createHttpTransport } from "@solana/kit";
import { COMMITMENT, RPC_URL, TX_TIMEOUT_MS } from "./env";

export const rpc = createSolanaRpc({
  transport: createHttpTransport({ url: RPC_URL, timeout: TX_TIMEOUT_MS }),
  // Commitment is passed per-call where applicable; keep wrapper simple.
});

export type Rpc = typeof rpc;
export const defaultCommitment = COMMITMENT;
```

---

## 7) Wallet/signer interface (minimal)

**`src/wallet.ts`**
```ts
import { VersionedTransaction } from "@solana/kit/types"; // Or import from web3-compat if needed

export interface Signer {
  publicKey: Uint8Array;               // 32 bytes
  sign(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

export type SendFn = (raw: Uint8Array) => Promise<string>; // signature
```

> Keep it **agnostic** so users can plug in Keypair, backpack, wallet adapter, etc.

---

## 8) Program clients via **Codama** (IDL → TS)

### 8.1 Place IDLs
- Put **Pump bonding‑curve** IDL JSON at: `src/pumpsdk/idl/pump.json`
- Put **Pump AMM** IDL JSON at: `src/ammsdk/idl/pump_amm.json`

> Source of truth: on‑chain IDL account (if published), or vendor from upstream repository/tags. Keep a **tracked commit hash** in your README so codegen is reproducible.

### 8.2 Generate TS clients
Install (already added): `codama` and `@codama/renderers-js`.

Create **`scripts/codama-generate.ts`** (Bun script):

```ts
#!/usr/bin/env bun
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createJsRenderer } from "@codama/renderers-js"; // renderer
import codama from "codama"; // programmatic Codama API

async function render(idlPath: string, outDir: string, moduleName: string) {
  const idl = JSON.parse(await readFile(idlPath, "utf8"));
  const project = codama.loadJson(idl);
  const { files } = await createJsRenderer({ module: moduleName }).render(project);
  await mkdir(outDir, { recursive: true });
  for (const f of files) {
    const p = join(outDir, f.path);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, f.content, "utf8");
  }
}

await render("src/pumpsdk/idl/pump.json", "src/pumpsdk/generated", "pump");
await render("src/ammsdk/idl/pump_amm.json", "src/ammsdk/generated", "pump_amm");
console.log("Codama codegen complete.");
```

Run:
```bash
bun run codegen
```

This produces **instruction builders, accounts, types** compatible with Solana Kit (pure TS, ESM).

---

## 9) Public API surface (flat & minimal)

**`src/index.ts`**
```ts
export { buy, sell, sellPercent, mintWithFirstBuy } from "./pumpsdk/client";
export { provideLiquidity, removeLiquidity } from "./ammsdk/client";
export type { Signer } from "./wallet";
export { rpc, defaultCommitment } from "./rpc";
export * as types from "./types";
```

### 9.1 Pump bonding‑curve client

**`src/pumpsdk/client.ts`** (skeleton showing shape; fill PDAs using Codama outputs):
```ts
import { rpc, defaultCommitment } from "../rpc";
import type { Signer, SendFn } from "../wallet";
import { buildBuyIx, buildSellIx, buildCreateIx } from "./generated/instructions"; // names depend on renderer
import { computeSlippageOut, computeSlippageIn } from "../math";

type Pubkey = Uint8Array; // 32 bytes

export async function mintWithFirstBuy(args: {
  signer: Signer; send: SendFn; mint: Pubkey; name: string; symbol: string; uri: string;
  creator: Pubkey; // bonding-curve creator PDA
  tokenAmountOut: bigint;  // desired base tokens
  maxSolIn: bigint;        // slippage cap in lamports
}) {
  // 1) create (mint + curve) 2) initial buy
  // Use Codama builders to construct both instructions and combine in one transaction.
}

export async function buy(args: {
  signer: Signer; send: SendFn; mint: Pubkey;
  tokenAmountOut: bigint; maxSolIn: bigint; // slippage control
  commitment?: "processed" | "confirmed" | "finalized";
}) {
  // buildBuyIx(...) -> sign -> send -> confirm
}

export async function sell(args: {
  signer: Signer; send: SendFn; mint: Pubkey;
  tokenAmountIn: bigint; minSolOut: bigint; // slippage
  commitment?: "processed" | "confirmed" | "finalized";
}) { /* ... */ }

export async function sellPercent(args: {
  signer: Signer; send: SendFn; mint: Pubkey; percent: number; minSolOut?: bigint;
  commitment?: "processed" | "confirmed" | "finalized";
}) {
  // read user ATA balance -> compute tokenAmountIn = floor(balance * percent)
  // delegate to sell()
}
```

### 9.2 AMM client

**`src/ammsdk/client.ts`** (skeleton):
```ts
export async function provideLiquidity(args: {
  signer: Signer; send: SendFn; baseMint: Pubkey; quoteMint: Pubkey;
  maxBaseIn: bigint; maxQuoteIn: bigint; minLpOut: bigint;
  commitment?: "processed" | "confirmed" | "finalized";
}) { /* use Codama builders for create_pool/deposit */ }

export async function removeLiquidity(args: {
  signer: Signer; send: SendFn; baseMint: Pubkey; quoteMint: Pubkey;
  lpAmountIn: bigint; minBaseOut: bigint; minQuoteOut: bigint;
  commitment?: "processed" | "confirmed" | "finalized";
}) { /* withdraw/burn LP */ }
```

> Every function accepts **explicit slippage caps** (max in / min out). That’s the only knob most users care about; everything else has sane defaults.

---

## 10) Minimal helpers

**`src/math.ts`**
```ts
export function pctToBps(p: number): number {
  if (p < 0 || p > 100) throw new Error("percent out of range");
  return Math.round(p * 100);
}
// placeholder slippage helpers; real math may read on-chain reserves
export const computeSlippageOut = (amountIn: bigint, bps: number) =>
  (amountIn * BigInt(10_000 - bps)) / 10_000n;
export const computeSlippageIn = (amountOut: bigint, bps: number) =>
  (amountOut * 10_000n) / BigInt(10_000 - bps);
```

**`src/utils/tx.ts`**
```ts
import { rpc } from "../rpc";
export async function sendAndConfirm(raw: Uint8Array, commitment: "processed"|"confirmed"|"finalized" = "confirmed") {
  // rpc.sendTransaction -> rpc.getSignatureStatuses or getTransaction until desired commitment
}
```

---

## 11) Example usage (Node/Bun)

**`examples/quickstart.ts`** (pseudocode; wire with your signer):
```ts
import { buy, sell, sellPercent, mintWithFirstBuy, provideLiquidity, removeLiquidity } from "pump-kit";

// 1) Mint + first buy
await mintWithFirstBuy({ /* mint metadata, desired amount, slippage max */ });

// 2) Buy
await buy({ mint, tokenAmountOut: 1_000_000n, maxSolIn: 5_000_000n });

// 3) Sell 25%
await sellPercent({ mint, percent: 25, minSolOut: 0n });

// 4) Provide liquidity
await provideLiquidity({ baseMint, quoteMint, maxBaseIn: 5_000_000n, maxQuoteIn: 100_000_000n, minLpOut: 0n });

// 5) Remove liquidity
await removeLiquidity({ baseMint, quoteMint, lpAmountIn: 1_000_000n, minBaseOut: 0n, minQuoteOut: 0n });
```

Run examples with:
```bash
SOLANA_RPC=https://api.mainnet-beta.solana.com bun run examples/quickstart.ts
```

---

## 12) Codama: keeping IDLs modern & fast

1. **Source of IDL** (prefer in this order):
   - **On‑chain IDL account** (if program uses Anchor and IDL is published). Query once and vendor into `src/**/idl/*.json` with the program’s deploy commit/slot noted in README.
   - **Upstream repository** pinned by **tag/commit** (do **not** copy from random SDKs).  
   - **Fallback**: the IDL you already have (ensure it matches the deployed binary by comparing instruction discriminators).

2. **Regenerate on each upstream bump**:  
   `bun run codegen` — checks in `src/**/generated/*`. Treat generated code as **build artifact committed** (so users don’t need Codama).

3. **Versioning strategy**: bump your package when **either** program IDL or your API changes. Include program addresses (pump & pump_amm) in the README and export them as constants.

---

## 13) Publishing checklist

- [ ] `bun run build` produces **dist/index.js** (ESM) + **dist/types/** declarations.  
- [ ] `exports` map points to ESM + types.  
- [ ] No accidental Node‑only APIs (keep web compatibility).  
- [ ] Document **slippage parameters** clearly for each function.  
- [ ] Include **examples/** runnable with Bun.  
- [ ] Pin **IDL commit/slot** and program addresses in README.  

---

## 14) FAQ

- **Why Solana Kit 3.0 instead of `@solana/web3.js`?**  
  Cleaner transport, composable RPC, smaller surface, and active maintenance for new features. It’s the modern path.

- **Which confirmation should we default to?**  
  `confirmed` is a solid default. Let advanced users override via env or per‑call arg. For speed-sensitive UX, `processed` is acceptable with retry/observe patterns.

- **Do users get full TypeScript types?**  
  Yes. We ship ESM JS + `.d.ts` generated by `tsc`. The Codama output is typed as well.

---

## 15) Next steps

- Fill PDAs and exact account metas using Codama’s generated helpers from your IDLs.
- Implement the 6 public functions with explicit **`max*`/`min*`** slippage args.
- Provide at least **one** end‑to‑end example per function in `/examples`.
- Add a tiny test matrix using Bun’s test runner once APIs stabilize.
