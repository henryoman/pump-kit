
# pump‑kit — Step 2 (Wire Program IDs, PDAs, and Codama Builders)
**Stack**: Bun · TypeScript · Solana Kit 3.x (`@solana/kit`) · Codama (TS client renderers) · SPL Token & Token‑2022

> Goal: drop in the **program addresses**, define **PDAs** from your IDLs, and **wire Codama‑generated instruction builders** so callers can `buy`, `sell`, `mint (first‑buy)`, `provideLiquidity`, and `removeLiquidity` with explicit control over **slippage** and **token mints**. Minimal surface area, fast defaults.

---

## 0) Inputs you already have (from the IDLs you pasted)
Program IDs (hard constants):

- **pump** program: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **pump_amm** program: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

Other program IDs used by these IDLs (also constants):

- **System Program**: `11111111111111111111111111111111`
- **SPL Token (legacy)**: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
- **SPL Token‑2022**: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
- **Associated Token Program**: `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`
- **Metaplex Token Metadata**: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`
- **Fee program** (from IDL): `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`

You’ll place the two IDL JSON files (no changes needed) at:

```
idl/pump.json
idl/pump_amm.json
```

---

## 1) File layout (new and updated files)

```
pump-kit/
  idl/
    pump.json            # your Anchor 0.30+ IDL (as pasted)
    pump_amm.json        # your Anchor 0.30+ IDL (as pasted)
  src/
    config/
      addresses.ts       # program IDs and well-known addresses
      rpc.ts             # Solana Kit RPC + default commitment
    pda/
      pump.ts            # PDA helpers for pump program
      pumpAmm.ts         # PDA helpers for pump_amm program
      ata.ts             # ATA helpers for Token and Token-2022
    generated/           # (git-ignored) Codama output for both IDLs
      pump/...
      pump_amm/...
    clients/
      pump.ts            # thin wrappers around generated builders (buy/sell/create)
      amm.ts             # thin wrappers around generated builders (pool create/deposit/withdraw,buy/sell)
    utils/
      math.ts            # slippage helpers (bps and decimals) - minimal
      tx.ts              # build+send utility using Solana Kit
  scripts/
    generate-clients.ts  # Codama render script (Bun/TS) -> writes to src/generated
  package.json
  bunfig.toml
  tsconfig.json
  .gitignore
```

---

## 2) Install deps (Bun)

```bash
bun add @solana/kit @solana-program/token @solana-program/token-2022
bun add -D @codama/renderers-js @codama/nodes @codama/ir @types/node typescript
```

> Why: `@solana/kit` (Solana Kit v3) is the modern, modular Web3.js. The `@solana-program/*` packages expose SPL Token constants and helpers (including ATA derivation). Codama renderers will generate zero‑runtime JS/TS builders directly from your IDLs.

---

## 3) Configure addresses

**src/config/addresses.ts**
```ts
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export const FEE_PROGRAM_ID = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"; // from IDL
```

---

## 4) RPC bootstrap (Solana Kit)

**src/config/rpc.ts**
```ts
import { createSolanaRpc, devnet } from "@solana/kit"; // replace devnet with your cluster

export const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"));
export const defaultCommitment = "confirmed";
```

> Use one RPC for simplicity. If you need websockets later, add the `@solana/rpc-websocket` transport with the same API.

---

## 5) PDA helpers (Solana Kit + SPL helpers)

### 5.1 `pump` PDAs
**src/pda/pump.ts**
```ts
import { getProgramDerivedAddress, getAddress, getUtf8Encoder } from "@solana/kit";
import { type Address } from "@solana/kit";
import { PUMP_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "@solana-program/token";

const enc = getUtf8Encoder();

export function globalPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("global")],
  });
}

export function bondingCurvePda(mint: Address): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [enc.encode("bonding-curve"), getAddress(mint)],
  });
}

// ATA for (owner=bondingCurve, mint) under Token (legacy) program
export function associatedBondingCurveAta(bondingCurve: Address, mint: Address): Address {
  return findAssociatedTokenPda({
    owner: getAddress(bondingCurve),
    mint: getAddress(mint),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });
}

export function creatorVaultPda(creator: Address): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("creator-vault"), getAddress(creator)],
  });
}

export function globalVolumeAccumulatorPda(): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("global_volume_accumulator")],
  });
}

export function userVolumeAccumulatorPda(user: Address): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("user_volume_accumulator"), getAddress(user)],
  });
}
```

### 5.2 `pump_amm` PDAs
**src/pda/pumpAmm.ts**
```ts
import { getProgramDerivedAddress, getAddress } from "@solana/kit";
import { type Address } from "@solana/kit";
import { PUMP_AMM_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda as findATA2022 } from "@solana-program/token-2022";

const enc = new TextEncoder();

// pool = PDA("pool", index:u16, creator, base_mint, quote_mint)
export function poolPda(index: number, creator: Address, baseMint: Address, quoteMint: Address): Address {
  const indexBytes = new Uint8Array([index & 0xff, (index >> 8) & 0xff]); // le u16
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("pool"), indexBytes, getAddress(creator), getAddress(baseMint), getAddress(quoteMint)],
  });
}

export function lpMintPda(pool: Address): Address {
  return getProgramDerivedAddress({
    programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
    seeds: [enc.encode("pool_lp_mint"), getAddress(pool)],
  });
}

// Token-2022 LP ATA for (owner=creator, mint=lpMint)
export function userLpAta(creator: Address, lpMint: Address): Address {
  return findATA2022({
    owner: getAddress(creator),
    mint: getAddress(lpMint),
    tokenProgram: getAddress(TOKEN_2022_PROGRAM_ID),
  });
}

export function poolTokenAta(pool: Address, tokenProgram: Address, mint: Address): Address {
  return findATA2022({
    owner: getAddress(pool),
    mint: getAddress(mint),
    tokenProgram: getAddress(tokenProgram),
  });
}
```

> Notes: The seeds shown above mirror your IDLs (e.g., `"global"`, `"bonding-curve"`, `"pool"`, `"pool_lp_mint"`, and ATA `(owner, tokenProgram, mint)`).

---

## 6) Generate Codama TS builders (Bun script)

Create a tiny **Bun/TS** script that loads your two IDLs and writes TypeScript clients using Codama renderers.

**scripts/generate-clients.ts**
```ts
// Minimal Codama rendering using the JS renderers.
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderProgram as renderJsProgram } from "@codama/renderers-js"; // renderer entrypoint
import { programFromAnchorIdl } from "@codama/ir"; // IR helper for Anchor 0.30+ IDLs

function ensureDir(p: string) { try { mkdirSync(p, { recursive: true }); } catch {} }

function generate(idlPath: string, outDir: string) {
  const idl = JSON.parse(readFileSync(idlPath, "utf8"));
  const ir = programFromAnchorIdl(idl); // convert Anchor IDL -> Codama IR
  ensureDir(outDir);
  renderJsProgram(ir, { outDir });
  console.log(`✔ Generated: ${outDir}`);
}

const root = resolve(process.cwd());
generate(resolve(root, "idl/pump.json"), resolve(root, "src/generated/pump"));
generate(resolve(root, "idl/pump_amm.json"), resolve(root, "src/generated/pump_amm"));
```

Add scripts and run:

```jsonc
// package.json
{
  "scripts": {
    "gen:clients": "bun tsx scripts/generate-clients.ts",
    "build": "tsc -p tsconfig.json"
  }
}
```

```bash
bun run gen:clients
```

> Output: `src/generated/pump/**` and `src/generated/pump_amm/**` with instruction builders and account parsers. Codama renderers produce tree‑shakable TS modules—no runtime bloat.

---

## 7) Thin client wrappers (stable API for your SDK)

Keep your public API minimal and opinionated; wrap the generated builders and hide account plumbing + PDA derivations.

### 7.1 pump: `buy`, `sell`, `create` (mint with first buy)
**src/clients/pump.ts**
```ts
import { rpc } from "../config/rpc";
import { PUMP_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, FEE_PROGRAM_ID } from "../config/addresses";
import { globalPda, bondingCurvePda, associatedBondingCurveAta, creatorVaultPda, globalVolumeAccumulatorPda, userVolumeAccumulatorPda } from "../pda/pump";
import { getAddress, createTransactionMessage, pipeTransactionMessage, setTransactionMessageFees, compileTransaction } from "@solana/kit";

// CODEGEN imports (adjust names to actual generated ones):
import { buildBuyInstruction, buildSellInstruction, buildCreateInstruction } from "../generated/pump/instructions";

export async function buy({ user, mint, tokenAmount, maxSolCostLamports, feeRecipient, trackVolume = true }:
  { user: string; mint: string; tokenAmount: bigint; maxSolCostLamports: bigint; feeRecipient: string; trackVolume?: boolean; }) {

  const program = getAddress(PUMP_PROGRAM_ID);
  const g = globalPda();
  const bc = bondingCurvePda(mint);
  const ataBC = associatedBondingCurveAta(bc, mint);
  const ataUser = associatedBondingCurveAta(user, mint);
  const cv = creatorVaultPda(bc);

  const ix = buildBuyInstruction({
    program,
    accounts: {
      global: g,
      feeRecipient,
      mint,
      bondingCurve: bc,
      associatedBondingCurve: ataBC,
      associatedUser: ataUser,
      user,
      systemProgram: SYSTEM_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      creatorVault: cv,
      eventAuthority: g, // event_authority seed is constant; re-derive if you expose a helper
      program,
      globalVolumeAccumulator: globalVolumeAccumulatorPda(),
      userVolumeAccumulator: userVolumeAccumulatorPda(user),
      feeConfig: /* PDA from fee program */ undefined!,
      feeProgram: FEE_PROGRAM_ID,
    },
    args: { amount: tokenAmount, maxSolCost: maxSolCostLamports, trackVolume: { bool: trackVolume } },
  });

  const { value: { blockhash, lastValidBlockHeight } } = await rpc.getLatestBlockhash().send();
  const msg = await pipeTransactionMessage(createTransactionMessage({ version: 0, payer: user, recentBlockhash: blockhash }), [
    (m) => m.addInstruction(ix),
    (m) => setTransactionMessageFees(rpc)(m),
  ]);
  const tx = await compileTransaction(msg);
  return { tx, lastValidBlockHeight };
}
```

### 7.2 amm: `createPool`, `deposit (provideLiquidity)`, `withdraw (removeLiquidity)`, `buy`, `sell`
**src/clients/amm.ts**
```ts
// Mirror the pattern from pump.ts using poolPda/lpMintPda/userLpAta/poolTokenAta helpers
// Import `buildCreatePoolInstruction`, `buildDepositInstruction`, `buildWithdrawInstruction`, `buildBuyInstruction`, `buildSellInstruction`
// from src/generated/pump_amm/instructions and wrap them similarly.
```

---

## 8) Slippage helpers (bps)

**src/utils/math.ts**
```ts
export function addSlippage(amount: bigint, slippageBps: number): bigint {
  return amount + (amount * BigInt(slippageBps)) / BigInt(10_000);
}
export function subSlippage(amount: bigint, slippageBps: number): bigint {
  return amount - (amount * BigInt(slippageBps)) / BigInt(10_000);
}
```

---

## 9) Build + test

```bash
bun run gen:clients
bun run build
```

Smoke test a single PDA:

```ts
import { globalPda } from "./src/pda/pump";
console.log(globalPda());
```

---

## 10) Citations & references (why these APIs)

- Solana **JS SDK = Kit** (v3), modular packages and helpers incl. `getProgramDerivedAddress` and modern RPC: official docs + repo.
- **IDLS**: official Solana guide on using IDLs and generating TS clients (Codama mention).
- **SPL Token** program IDs and helpers (`TOKEN_PROGRAM_ADDRESS`, `ASSOCIATED_TOKEN_PROGRAM_ADDRESS`), and Token‑2022 ATA helper `findAssociatedTokenPda`.
- **Metaplex Token Metadata** program id.

---

## 11) What to expose publicly (SDK surface)

Minimal, opinionated API:
- `buy({ user, mint, tokenAmount, maxSolCostLamports, feeRecipient, slippageBps })`
- `sell({ user, mint, tokenAmount, minSolOutLamports, feeRecipient, slippageBps })`
- `mintWithFirstBuy({ user, name, symbol, uri, creator, firstBuyAmount, maxSolCostLamports })`
- `provideLiquidity({ user, baseMint, quoteMint, baseIn, quoteIn, slippageBps })`
- `removeLiquidity({ user, lpAmount, minBaseOut, minQuoteOut })`

All builders are thin wrappers around **Codama‑generated** ixs + PDAs derived via **Solana Kit** helpers.

---

## 12) Next action
1. Put your two IDLs into `idl/`.  
2. `bun add` packages (above).  
3. `bun run gen:clients` to generate TS builders.  
4. Implement the 7.1/7.2 wrappers by mapping the generated builder names.  
5. Wire a single end‑to‑end call (e.g., `buy`) and send a test transaction.

---

## Appendix: Where the seeds came from
We mirrored the `pda.seeds` entries and ATA patterns in your IDLs:
- `global` → seed `"global"`
- `bonding_curve` → seeds `["bonding-curve", mint]`
- `associated_bonding_curve` → ATA `(owner=bonding_curve, tokenProgram, mint)` using the **Associated Token Program**
- `creator_vault` → seeds `["creator-vault", bonding_curve.creator]`
- AMM `pool` → seeds `["pool", index:u16, creator, base_mint, quote_mint]`
- `lp_mint` → seeds `["pool_lp_mint", pool]`
- All **Token‑2022** ATAs use `(owner, tokenProgram=Token‑2022, mint)`
