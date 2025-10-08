
# pump‑kit — Step 3 (Transaction Recipes & UX Controls)
**Goal**: Ship end‑to‑end flows for **buy/sell**, **mint with first‑buy**, **provide/remove liquidity**, with clean slippage controls and input validation. Uses the PDAs and Codama builders from Step 2.

---

## 0) Pre-req
- Complete **Step 2** (program IDs, PDAs, generated builders).
- RPC configured, PDAs wired.
- A signer (user) available via your wallet adapter.

---

## 1) Types & validation

**src/utils/types.ts**
```ts
export type Address = string;
export type Bps = number; // basis points (10000 = 100%)

export interface BuyArgs {
  user: Address; mint: Address;
  tokenAmount: bigint;       // in token's base units
  maxSolCostLamports: bigint;
  slippageBps?: Bps;         // default: 50 (0.50%)
  feeRecipient: Address;
}

export interface SellArgs {
  user: Address; mint: Address;
  tokenAmount: bigint;
  minSolOutLamports: bigint;
  slippageBps?: Bps;
  feeRecipient: Address;
}

export interface ProvideLiqArgs {
  user: Address; baseMint: Address; quoteMint: Address;
  baseIn: bigint; quoteIn: bigint; slippageBps?: Bps;
}

export interface RemoveLiqArgs {
  user: Address; lpAmount: bigint; minBaseOut: bigint; minQuoteOut: bigint; slippageBps?: Bps;
}
```

---

## 2) Slippage helpers (re-use)

**src/utils/slippage.ts**
```ts
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.50%
export const addSlippage = (x: bigint, bps = DEFAULT_SLIPPAGE_BPS) => x + (x * BigInt(bps)) / BigInt(10_000);
export const subSlippage = (x: bigint, bps = DEFAULT_SLIPPAGE_BPS) => x - (x * BigInt(bps)) / BigInt(10_000);
```

---

## 3) Compute ATAs as needed

**src/pda/ata.ts**
```ts
import { getAddress } from "@solana/kit";
import { findAssociatedTokenPda as findATA } from "@solana-program/token";
import { findAssociatedTokenPda as findATA2022 } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";

export const ata = (owner: string, mint: string) =>
  findATA({ owner: getAddress(owner), mint: getAddress(mint), tokenProgram: getAddress(TOKEN_PROGRAM_ID) });

export const ata2022 = (owner: string, mint: string) =>
  findATA2022({ owner: getAddress(owner), mint: getAddress(mint), tokenProgram: getAddress(TOKEN_2022_PROGRAM_ID) });
```

---

## 4) Recipes

### 4.1 Buy
**src/recipes/buy.ts**
```ts
import { buy as buildBuyTx } from "../clients/pump";
import { subSlippage } from "../utils/slippage";

export async function buyWithSlippage(args: {
  user: string; mint: string; tokenAmount: bigint; estimatedSolCost: bigint; slippageBps?: number; feeRecipient: string;
}) {
  const maxSolCostLamports = subSlippage(args.estimatedSolCost, args.slippageBps ?? 50);
  return buildBuyTx({ ...args, maxSolCostLamports });
}
```

### 4.2 Sell
**src/recipes/sell.ts**
```ts
import { sell as buildSellTx } from "../clients/pump";
import { subSlippage } from "../utils/slippage";

export async function sellWithSlippage(args: {
  user: string; mint: string; tokenAmount: bigint; estimatedSolOut: bigint; slippageBps?: number; feeRecipient: string;
}) {
  const minSolOutLamports = subSlippage(args.estimatedSolOut, args.slippageBps ?? 50);
  return buildSellTx({ ...args, minSolOutLamports });
}
```

### 4.3 Mint + first buy (one click)
**src/recipes/mintFirstBuy.ts**
```ts
// Compose `buildCreateInstruction` then `buildBuyInstruction` in one v0 tx.
// Use your PDA helpers for metadata, creator vault, and bonding curve accounts.
```

### 4.4 Provide liquidity
**src/recipes/provideLiquidity.ts**
```ts
// Use src/clients/amm.ts wrappers built on pump_amm Codama builders.
// Derive: poolPda(index, creator, baseMint, quoteMint), lpMintPda(pool),
// and Token-2022 ATAs for LP tokens.
```

### 4.5 Remove liquidity
**src/recipes/removeLiquidity.ts**
```ts
// Mirror provideLiquidity but use withdraw instruction and minBaseOut/minQuoteOut with slippage.
```

---

## 5) Wire up basic UI controls (if using React)

**src/ui/TradePanel.tsx**
```tsx
// Not a full UI — just the inputs we expose:
/*
  - Select: Action (Buy, Sell, Provide, Remove, Mint&Buy)
  - Input: Token (mint address)
  - Input: Amount (token or lamports)
  - Input: Slippage (bps), default 50
  - Advanced: Fee recipient (prefill global default)
  - Submit: Build ↗ send (wallet signs)
*/
```

---

## 6) Sending & confirming

**src/utils/tx.ts**
```ts
import { rpc } from "../config/rpc";
import { signAndSendTransaction } from "@solana/kit/transactions"; // or your wallet adapter

export async function sendTx(tx: any, signer: any) {
  const signed = await signer.signTransaction(tx);
  const sig = await rpc.sendTransaction(signed).send();
  await rpc.confirmTransaction(sig).send();
  return sig;
}
```

---

## 7) Error decoding

- Prefer decoding via the generated error maps (Codama exposes enums/messages from IDL).
- Fallback: inspect `logs` from `simulateTransaction` to surface account mismatch or PDA issues.

---

## 8) Minimal test plan

1. **PDAs**: assert `globalPda()` is on‑curve and consistent across runs.  
2. **ATAs**: create missing user ATAs for both Token and Token‑2022.  
3. **Buy**: try tiny `tokenAmount` and check final user ATA delta ≥ expected minus slippage.  
4. **Sell**: balance of user ATA decreases; SOL balance increases ≥ min.  
5. **AMM**: create pool (devnet), `deposit` small amounts, `withdraw` LP.  
6. **Race‑proofing**: retry on `BlockhashNotFound`, `AccountInUse`.  
7. **Limits**: ensure failure on negative slippage (reverts as expected).

---

## 9) What users can control (surface only core knobs)

- **Action**: Buy / Sell / Provide / Remove / Mint&FirstBuy  
- **Token(s)**: user provides the mint(s) (and optional pool index for AMM)  
- **Slippage (bps)**: default 50, editable  
- **Amounts**: token units or lamports, with helper conversions visible  
- **Fee recipient**: default global, overridable  

That’s it. Everything else (PDAs, ATAs, event authority, fee config) is auto‑derived.

---

## 10) Next action
- Hook these recipes to your wallet adapter, run on devnet, ship a CLI smoke test, then wire into your UI form controls.
