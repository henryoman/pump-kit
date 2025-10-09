/**
 * Ultra-simple liquidity API - add/remove liquidity with minimal complexity
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { DEFAULT_SLIPPAGE_BPS } from "./utils/slippage";

// Wrapped SOL address
const WSOL = "So11111111111111111111111111111111111111112";

export interface AddLiquidityParams {
  /** Your wallet */
  user: TransactionSigner;
  /** Token mint address */
  mint: string;
  /** Amount of tokens to add */
  tokenAmount: bigint;
  /** Amount of SOL to add (in lamports) */
  solAmount: bigint;
  /** Slippage tolerance (optional, default 0.5%) */
  slippage?: number;
}

export interface RemoveLiquidityParams {
  /** Your wallet */
  user: TransactionSigner;
  /** Token mint address */
  mint: string;
  /** Amount of LP tokens to burn */
  lpAmount: bigint;
  /** Slippage tolerance (optional, default 0.5%) */
  slippage?: number;
}

/**
 * Add liquidity to a pool - ultra simple
 * 
 * Pool Index Explanation:
 * - Most tokens have 1 main pool (index 0)
 * - This is automatically used, you don't need to specify it
 * - Only advanced users with multiple pools need to worry about this
 */
export async function addLiquidity(params: AddLiquidityParams): Promise<Instruction> {
  const {
    user,
    mint,
    tokenAmount,
    solAmount,
    slippage = DEFAULT_SLIPPAGE_BPS,
  } = params;

  if (tokenAmount <= 0n) throw new Error("Token amount must be positive");
  if (solAmount <= 0n) throw new Error("SOL amount must be positive");

  // TODO: Implement using AMM client
  // This will:
  // 1. Find the main pool (index 0) for this token
  // 2. Calculate optimal ratio automatically
  // 3. Add liquidity with slippage protection
  // 4. Return LP tokens to user
  
  throw new Error("addLiquidity not yet implemented - coming soon!");
}

/**
 * Remove liquidity from a pool - equally simple
 */
export async function removeLiquidity(params: RemoveLiquidityParams): Promise<Instruction> {
  const {
    user,
    mint,
    lpAmount,
    slippage = DEFAULT_SLIPPAGE_BPS,
  } = params;

  if (lpAmount <= 0n) throw new Error("LP amount must be positive");

  // TODO: Implement using AMM client
  // This will:
  // 1. Find the pool automatically
  // 2. Calculate your share of tokens + SOL
  // 3. Withdraw with slippage protection
  // 4. Return tokens + SOL to your wallet
  
  throw new Error("removeLiquidity not yet implemented - coming soon!");
}

/**
 * Quick add liquidity - even simpler with just 4 parameters
 */
export async function quickAddLiquidity(
  user: TransactionSigner,
  mint: string,
  tokenAmount: bigint,
  solAmount: bigint
): Promise<Instruction> {
  return addLiquidity({ user, mint, tokenAmount, solAmount });
}

/**
 * Quick remove liquidity - just 3 parameters
 */
export async function quickRemoveLiquidity(
  user: TransactionSigner,
  mint: string,
  lpAmount: bigint
): Promise<Instruction> {
  return removeLiquidity({ user, mint, lpAmount });
}

