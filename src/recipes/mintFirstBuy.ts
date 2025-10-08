/**
 * Mint + First Buy recipe - create a new token and make the initial purchase in one transaction.
 */

import type { TransactionSigner, Instruction, Address } from "@solana/kit";
import { create as buildCreateInstruction, buy as buildBuyInstruction } from "../clients/pump";
import { addSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";

export interface MintWithFirstBuyParams {
  /** User's wallet/signer (will be the creator) */
  user: TransactionSigner;
  /** Pre-generated mint keypair address */
  mint: Address | string;
  /** Mint authority (usually same as user) */
  mintAuthority: Address | string;
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Metadata URI (JSON) */
  uri: string;
  /** Amount of tokens to buy in the first purchase */
  firstBuyTokenAmount: bigint;
  /** Estimated SOL cost for the first buy */
  estimatedFirstBuyCost: bigint;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Fee recipient address */
  feeRecipient: string;
}

/**
 * Build instructions for minting a new token and making the first purchase.
 * Returns both create and buy instructions to be included in a single transaction.
 */
export function mintWithFirstBuy(params: MintWithFirstBuyParams): {
  createInstruction: Instruction;
  buyInstruction: Instruction;
} {
  const {
    user,
    mint,
    mintAuthority,
    name,
    symbol,
    uri,
    firstBuyTokenAmount,
    estimatedFirstBuyCost,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    feeRecipient,
  } = params;

  // Validate inputs
  validateSlippage(slippageBps);
  if (!name || name.length === 0) throw new Error("Token name is required");
  if (!symbol || symbol.length === 0) throw new Error("Token symbol is required");
  if (!uri || uri.length === 0) throw new Error("Metadata URI is required");
  if (firstBuyTokenAmount <= 0n) throw new Error("First buy token amount must be positive");
  if (estimatedFirstBuyCost <= 0n) throw new Error("Estimated first buy cost must be positive");

  // Build create instruction
  const createInstruction = buildCreateInstruction({
    user,
    mint,
    mintAuthority,
    name,
    symbol,
    uri,
  });

  // Build buy instruction with slippage
  const maxSolCostLamports = addSlippage(estimatedFirstBuyCost, slippageBps);
  const buyInstruction = buildBuyInstruction({
    user,
    mint,
    tokenAmount: firstBuyTokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume: true,
  });

  return {
    createInstruction,
    buyInstruction,
  };
}

/**
 * Validate mint creation parameters.
 */
export function validateMintParams(params: {
  name: string;
  symbol: string;
  uri: string;
}): void {
  const { name, symbol, uri } = params;
  
  if (!name || name.length === 0) throw new Error("Token name is required");
  if (name.length > 32) throw new Error("Token name too long (max 32 characters)");
  
  if (!symbol || symbol.length === 0) throw new Error("Token symbol is required");
  if (symbol.length > 10) throw new Error("Token symbol too long (max 10 characters)");
  
  if (!uri || uri.length === 0) throw new Error("Metadata URI is required");
  if (!uri.startsWith("http://") && !uri.startsWith("https://") && !uri.startsWith("ipfs://")) {
    throw new Error("Metadata URI must be a valid URL or IPFS link");
  }
}
