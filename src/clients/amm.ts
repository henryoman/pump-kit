/**
 * Thin client wrappers for Pump AMM operations.
 * These functions provide a simple, opinionated API over the generated instruction builders.
 */

import type { Address, TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import { findAssociatedTokenPda as findAssociatedTokenPda } from "@solana-program/token-2022";

import {
  PUMP_AMM_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "../config/addresses";
import {
  poolPda,
  lpMintPda,
  userLpAta,
  poolTokenAta,
  globalConfigPda,
  eventAuthorityPda,
} from "../pda/pumpAmm";
import {
  getDepositInstruction,
  getWithdrawInstruction,
  getBuyInstruction,
  getSellInstruction,
  getCreatePoolInstruction,
} from "../ammsdk/generated/instructions";

const DEFAULT_POOL_INDEX = 0;

export interface CreatePoolParams {
  /** The user's wallet/signer (will be pool creator) */
  user: TransactionSigner;
  /** Base token mint address */
  baseMint: Address | string;
  /** Quote token mint address */
  quoteMint: Address | string;
  /** Pool index (for multi-pool support) */
  index: number;
}

/**
 * Build a create pool instruction.
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export async function createPool(params: CreatePoolParams) {
  const { user, baseMint, quoteMint, index } = params;

  const userAddr = user.address;
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  
  // Derive PDAs (all async)
  const pool = await poolPda(index, userAddr, base, quote);
  const lpMint = await lpMintPda(pool);
  const globalConfig = await globalConfigPda();

  // TODO: Complete with actual instruction builder once API is confirmed
  throw new Error("createPool not yet implemented - needs generated instruction verification");
}

export interface DepositParams {
  /** Liquidity provider */
  user: TransactionSigner;
  /** Base token mint address */
  baseMint: Address | string;
  /** Quote token mint address */
  quoteMint: Address | string;
  /** Pool index (default 0) */
  index?: number;
  /** Optional explicit pool address (overrides creator + index) */
  poolAddress?: Address | string;
  /** Pool creator address used when deriving the pool PDA (defaults to user address) */
  poolCreator?: Address | string;
  /** Maximum base tokens to deposit */
  maxBaseIn: bigint;
  /** Maximum quote tokens to deposit */
  maxQuoteIn: bigint;
  /** Minimum LP tokens to receive (slippage protection) */
  minLpOut?: bigint;
  /** SPL token program for base/quote mints (defaults to TOKEN_PROGRAM_ID) */
  tokenProgram?: Address | string;
  /** Token-2022 program for LP mint (defaults to TOKEN_2022_PROGRAM_ID) */
  token2022Program?: Address | string;
}

/**
 * Build a deposit (provide liquidity) instruction.
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export async function deposit(params: DepositParams) {
  const {
    user,
    baseMint,
    quoteMint,
    index = DEFAULT_POOL_INDEX,
    poolAddress,
    poolCreator,
    maxBaseIn,
    maxQuoteIn,
    minLpOut = 0n,
    tokenProgram = TOKEN_PROGRAM_ID,
    token2022Program = TOKEN_2022_PROGRAM_ID,
  } = params;

  if (maxBaseIn <= 0n) throw new Error("maxBaseIn must be positive");
  if (maxQuoteIn <= 0n) throw new Error("maxQuoteIn must be positive");
  if (minLpOut < 0n) throw new Error("minLpOut cannot be negative");

  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(tokenProgram);
  const token2022ProgramAddr = getAddress(token2022Program);
  const pool = poolAddress
    ? getAddress(poolAddress)
    : await poolPda(index, getAddress(poolCreator ?? userAddr), base, quote);

  const globalConfig = await globalConfigPda();
  const lpMint = await lpMintPda(pool);
  const userLp = await userLpAta(userAddr, lpMint);

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: tokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: tokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = await poolTokenAta(pool, base, tokenProgramAddr);
  const poolQuoteAta = await poolTokenAta(pool, quote, tokenProgramAddr);
  const eventAuthority = await eventAuthorityPda();

  return getDepositInstruction(
    {
      pool,
      globalConfig,
      user,
      baseMint: base,
      quoteMint: quote,
      lpMint,
      userBaseTokenAccount: userBaseAta,
      userQuoteTokenAccount: userQuoteAta,
      userPoolTokenAccount: userLp,
      poolBaseTokenAccount: poolBaseAta,
      poolQuoteTokenAccount: poolQuoteAta,
      tokenProgram: tokenProgramAddr,
      token2022Program: token2022ProgramAddr,
      eventAuthority,
      program: getAddress(PUMP_AMM_PROGRAM_ID),
      lpTokenAmountOut: minLpOut,
      maxBaseAmountIn: maxBaseIn,
      maxQuoteAmountIn: maxQuoteIn,
    },
    { programAddress: getAddress(PUMP_AMM_PROGRAM_ID) }
  );
}

export interface WithdrawParams {
  user: TransactionSigner;
  baseMint: Address | string;
  quoteMint: Address | string;
  index?: number;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  lpAmountIn: bigint;
  minBaseOut?: bigint;
  minQuoteOut?: bigint;
  tokenProgram?: Address | string;
  token2022Program?: Address | string;
}

/**
 * Build a withdraw (remove liquidity) instruction.
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export async function withdraw(params: WithdrawParams) {
  const {
    user,
    baseMint,
    quoteMint,
    index = DEFAULT_POOL_INDEX,
    poolAddress,
    poolCreator,
    lpAmountIn,
    minBaseOut = 0n,
    minQuoteOut = 0n,
    tokenProgram = TOKEN_PROGRAM_ID,
    token2022Program = TOKEN_2022_PROGRAM_ID,
  } = params;

  if (lpAmountIn <= 0n) throw new Error("lpAmountIn must be positive");
  if (minBaseOut < 0n) throw new Error("minBaseOut cannot be negative");
  if (minQuoteOut < 0n) throw new Error("minQuoteOut cannot be negative");

  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(tokenProgram);
  const token2022ProgramAddr = getAddress(token2022Program);
  const pool = poolAddress
    ? getAddress(poolAddress)
    : await poolPda(index, getAddress(poolCreator ?? userAddr), base, quote);

  const globalConfig = await globalConfigPda();
  const lpMint = await lpMintPda(pool);
  const userLp = await userLpAta(userAddr, lpMint);

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: tokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: tokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = await poolTokenAta(pool, base, tokenProgramAddr);
  const poolQuoteAta = await poolTokenAta(pool, quote, tokenProgramAddr);
  const eventAuthority = await eventAuthorityPda();

  return getWithdrawInstruction(
    {
      pool,
      globalConfig,
      user,
      baseMint: base,
      quoteMint: quote,
      lpMint,
      userBaseTokenAccount: userBaseAta,
      userQuoteTokenAccount: userQuoteAta,
      userPoolTokenAccount: userLp,
      poolBaseTokenAccount: poolBaseAta,
      poolQuoteTokenAccount: poolQuoteAta,
      tokenProgram: tokenProgramAddr,
      token2022Program: token2022ProgramAddr,
      eventAuthority,
      program: getAddress(PUMP_AMM_PROGRAM_ID),
      lpTokenAmountIn: lpAmountIn,
      minBaseAmountOut: minBaseOut,
      minQuoteAmountOut: minQuoteOut,
    },
    { programAddress: getAddress(PUMP_AMM_PROGRAM_ID) }
  );
}

export interface AmmBuyParams {
  /** The user's wallet/signer */
  user: TransactionSigner;
  /** Base token mint (token to buy) */
  baseMint: Address | string;
  /** Quote token mint (token to pay with) */
  quoteMint: Address | string;
  /** Pool index */
  index: number;
  /** Amount of base tokens to buy */
  tokenAmountOut: bigint;
  /** Maximum quote tokens to spend (slippage protection) */
  maxQuoteIn: bigint;
}

/**
 * Build a buy instruction via the AMM pool (not bonding curve).
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export function ammBuy(params: AmmBuyParams) {
  throw new Error("ammBuy not yet implemented - needs generated instruction verification");
}

export interface AmmSellParams {
  /** The user's wallet/signer */
  user: TransactionSigner;
  /** Base token mint (token to sell) */
  baseMint: Address | string;
  /** Quote token mint (token to receive) */
  quoteMint: Address | string;
  /** Pool index */
  index: number;
  /** Amount of base tokens to sell */
  tokenAmountIn: bigint;
  /** Minimum quote tokens to receive (slippage protection) */
  minQuoteOut: bigint;
}

/**
 * Build a sell instruction via the AMM pool (not bonding curve).
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export function ammSell(params: AmmSellParams) {
  throw new Error("ammSell not yet implemented - needs generated instruction verification");
}
