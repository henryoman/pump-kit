import type { Signer } from "../wallet";
import type { Pubkey, Commitment, TransactionResult } from "../types";
import { rpc, defaultCommitment } from "../utils/rpc";
import { sendAndConfirm } from "../core/tx";
import { getBuyInstruction, getCreateInstruction, getSellInstruction } from "./generated";

/**
 * Mint a new token with first buy (create + initial purchase).
 * This combines token creation and the first buy into a single transaction.
 */
export async function mintWithFirstBuy(args: {
  signer: Signer;
  mint: Pubkey;
  name: string;
  symbol: string;
  uri: string;
  tokenAmountOut: bigint; // desired base tokens
  maxSolIn: bigint; // slippage cap in lamports
  commitment?: Commitment;
}): Promise<TransactionResult> {
  const commitment = args.commitment ?? defaultCommitment;

  // TODO: Implement proper account resolution and PDA derivation
  // This is a skeleton showing the structure - you'll need to:
  // 1. Derive bonding curve PDA
  // 2. Derive associated token accounts
  // 3. Build create instruction with metadata
  // 4. Build buy instruction with slippage params
  // 5. Combine into one transaction, sign, and send

  throw new Error("mintWithFirstBuy: not yet implemented - needs PDA resolution and account setup");
}

/**
 * Buy tokens from the bonding curve.
 */
export async function buy(args: {
  signer: Signer;
  mint: Pubkey;
  tokenAmountOut: bigint; // tokens to receive
  maxSolIn: bigint; // max SOL willing to spend (slippage protection)
  commitment?: Commitment;
}): Promise<TransactionResult> {
  const commitment = args.commitment ?? defaultCommitment;

  // TODO: Implement proper account resolution
  // 1. Derive bonding curve PDA from mint
  // 2. Get or create associated token accounts
  // 3. Build buy instruction with all required accounts
  // 4. Create transaction, sign with signer, send and confirm

  throw new Error("buy: not yet implemented - needs PDA resolution and account setup");
}

/**
 * Sell tokens back to the bonding curve.
 */
export async function sell(args: {
  signer: Signer;
  mint: Pubkey;
  tokenAmountIn: bigint; // tokens to sell
  minSolOut: bigint; // minimum SOL to receive (slippage protection)
  commitment?: Commitment;
}): Promise<TransactionResult> {
  const commitment = args.commitment ?? defaultCommitment;

  // TODO: Implement proper account resolution
  // 1. Derive bonding curve PDA from mint
  // 2. Get associated token accounts
  // 3. Build sell instruction with all required accounts
  // 4. Create transaction, sign with signer, send and confirm

  throw new Error("sell: not yet implemented - needs PDA resolution and account setup");
}

/**
 * Sell a percentage of token holdings.
 * Convenience function that reads the user's balance and sells the specified percentage.
 */
export async function sellPercent(args: {
  signer: Signer;
  mint: Pubkey;
  percent: number; // 0-100
  minSolOut?: bigint; // optional minimum SOL to receive
  commitment?: Commitment;
}): Promise<TransactionResult> {
  if (args.percent < 0 || args.percent > 100) {
    throw new Error("percent must be between 0 and 100");
  }

  // TODO: Implement
  // 1. Get user's ATA for the mint
  // 2. Read token balance
  // 3. Calculate tokenAmountIn = floor(balance * percent / 100)
  // 4. Delegate to sell() with calculated amount

  throw new Error("sellPercent: not yet implemented - needs balance fetching");
}
