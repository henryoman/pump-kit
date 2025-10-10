/**
 * Ultra-simple liquidity API - add/remove liquidity with minimal complexity
 */

import type { TransactionSigner, Instruction } from "@solana/kit";
import { deposit as buildDepositInstruction, withdraw as buildWithdrawInstruction } from "./clients/amm";
import { WSOL_ADDRESS } from "./utils/wsol";

// Wrapped SOL address
export const WSOL = WSOL_ADDRESS;

export interface AddLiquidityParams {
  user: TransactionSigner;
  baseMint: string;
  quoteMint?: string;
  poolIndex?: number;
  poolAddress?: string;
  poolCreator?: string;
  maxBaseAmountIn: bigint;
  maxQuoteAmountIn: bigint;
  minLpTokensOut?: bigint;
  tokenProgram?: string;
  token2022Program?: string;
}

export interface RemoveLiquidityParams {
  user: TransactionSigner;
  baseMint: string;
  quoteMint?: string;
  poolIndex?: number;
  poolAddress?: string;
  poolCreator?: string;
  lpAmountIn: bigint;
  minBaseAmountOut?: bigint;
  minQuoteAmountOut?: bigint;
  tokenProgram?: string;
  token2022Program?: string;
}

/**
 * Add liquidity to the Pump AMM pool.
 */
export async function addLiquidity(params: AddLiquidityParams): Promise<Instruction> {
  const {
    user,
    baseMint,
    quoteMint = WSOL_ADDRESS,
    poolIndex,
    poolAddress,
    poolCreator,
    maxBaseAmountIn,
    maxQuoteAmountIn,
    minLpTokensOut,
    tokenProgram,
    token2022Program,
  } = params;

  if (maxBaseAmountIn <= 0n) throw new Error("maxBaseAmountIn must be positive");
  if (maxQuoteAmountIn <= 0n) throw new Error("maxQuoteAmountIn must be positive");

  return await buildDepositInstruction({
    user,
    baseMint,
    quoteMint,
    index: poolIndex,
    poolAddress,
    poolCreator,
    maxBaseIn: maxBaseAmountIn,
    maxQuoteIn: maxQuoteAmountIn,
    minLpOut: minLpTokensOut ?? 0n,
    tokenProgram,
    token2022Program,
  });
}

/**
 * Remove liquidity from the Pump AMM pool.
 */
export async function removeLiquidity(params: RemoveLiquidityParams): Promise<Instruction> {
  const {
    user,
    baseMint,
    quoteMint = WSOL_ADDRESS,
    poolIndex,
    poolAddress,
    poolCreator,
    lpAmountIn,
    minBaseAmountOut,
    minQuoteAmountOut,
    tokenProgram,
    token2022Program,
  } = params;

  if (lpAmountIn <= 0n) throw new Error("lpAmountIn must be positive");

  return await buildWithdrawInstruction({
    user,
    baseMint,
    quoteMint,
    index: poolIndex,
    poolAddress,
    poolCreator,
    lpAmountIn,
    minBaseOut: minBaseAmountOut ?? 0n,
    minQuoteOut: minQuoteAmountOut ?? 0n,
    tokenProgram,
    token2022Program,
  });
}

/**
 * Quick helper to add liquidity with sensible defaults (quote defaults to wSOL, min LP = 0).
 */
export async function quickAddLiquidity(
  user: TransactionSigner,
  baseMint: string,
  maxBaseAmountIn: bigint,
  maxQuoteAmountIn: bigint,
  options: Omit<AddLiquidityParams, "user" | "baseMint" | "maxBaseAmountIn" | "maxQuoteAmountIn"> = {}
): Promise<Instruction> {
  return addLiquidity({
    user,
    baseMint,
    maxBaseAmountIn,
    maxQuoteAmountIn,
    ...options,
  });
}

/**
 * Quick helper to remove liquidity with defaults (min outputs set to zero).
 */
export async function quickRemoveLiquidity(
  user: TransactionSigner,
  baseMint: string,
  lpAmountIn: bigint,
  options: Omit<RemoveLiquidityParams, "user" | "baseMint" | "lpAmountIn"> = {}
): Promise<Instruction> {
  return removeLiquidity({
    user,
    baseMint,
    lpAmountIn,
    ...options,
  });
}
