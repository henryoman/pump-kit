/**
 * Thin client wrappers for Pump AMM operations.
 * These functions provide a simple, opinionated API over the generated instruction builders.
 */

import type { Address, TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import { findAssociatedTokenPda } from "../pda/ata";

import {
  PUMP_AMM_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  FEE_PROGRAM_ID,
} from "../config/addresses";
import {
  coinCreatorVaultAta,
  coinCreatorVaultAuthorityPda,
  eventAuthorityPda,
  globalConfigPda,
  globalVolumeAccumulatorPda,
  poolPda,
  lpMintPda,
  poolTokenAta,
  userLpAta,
  userVolumeAccumulatorPda,
} from "../pda/pumpAmm";
import { ammFeeConfigPda } from "../pda/pumpAmm";
import {
  getDepositInstruction,
  getWithdrawInstruction,
  getBuyInstruction,
  getSellInstruction,
  getCreatePoolInstruction,
} from "../ammsdk/generated/instructions";
import { fetchPool } from "../ammsdk/generated/accounts/pool";
import { fetchGlobalConfig } from "../ammsdk/generated/accounts/globalConfig";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";

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
  user: TransactionSigner;
  baseMint: Address | string;
  quoteMint: Address | string;
  index?: number;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  tokenAmountOut: bigint;
  maxQuoteIn: bigint;
  allowTrackVolume?: boolean;
  rpc: RpcClient;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Build a buy instruction via the AMM pool (not bonding curve).
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export async function ammBuy(params: AmmBuyParams) {
  const {
    user,
    baseMint,
    quoteMint,
    tokenAmountOut,
    maxQuoteIn,
    rpc,
    allowTrackVolume = true,
    commitment: commitmentOverride,
  } = params;

  if (tokenAmountOut <= 0n) throw new Error("tokenAmountOut must be positive");
  if (maxQuoteIn <= 0n) throw new Error("maxQuoteIn must be positive");

  const commitment = commitmentOverride ?? getDefaultCommitment();
  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(TOKEN_PROGRAM_ID);

  const pool = await resolvePoolAddress(params, userAddr);
  const { poolData, globalConfigData, globalConfigAddress } = await resolvePoolState(
    rpc,
    pool,
    commitment
  );

  const protocolFeeRecipient = pickProtocolFeeRecipient(globalConfigData.protocolFeeRecipients);
  if (!protocolFeeRecipient) {
    throw new Error("Global config does not define a protocol fee recipient");
  }

  const coinCreatorVaultAuthority = await coinCreatorVaultAuthorityPda(poolData.coinCreator);
  const coinCreatorVaultTokenAccount = await coinCreatorVaultAta(
    coinCreatorVaultAuthority,
    quote,
    tokenProgramAddr
  );

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
  const [protocolFeeRecipientAta] = await findAssociatedTokenPda({
    owner: protocolFeeRecipient,
    tokenProgram: tokenProgramAddr,
    mint: quote,
  });
  const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
  const userVolumeAccumulator = await userVolumeAccumulatorPda(userAddr);
  const eventAuthority = await eventAuthorityPda();
  const feeConfig = await ammFeeConfigPda();

  return getBuyInstruction(
    {
      pool,
      user,
      globalConfig: globalConfigAddress,
      baseMint: base,
      quoteMint: quote,
      userBaseTokenAccount: userBaseAta,
      userQuoteTokenAccount: userQuoteAta,
      poolBaseTokenAccount: poolBaseAta,
      poolQuoteTokenAccount: poolQuoteAta,
      protocolFeeRecipient,
      protocolFeeRecipientTokenAccount: protocolFeeRecipientAta,
      baseTokenProgram: tokenProgramAddr,
      quoteTokenProgram: tokenProgramAddr,
      systemProgram: getAddress(SYSTEM_PROGRAM_ID),
      associatedTokenProgram: getAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
      eventAuthority,
      program: getAddress(PUMP_AMM_PROGRAM_ID),
      coinCreatorVaultAta: coinCreatorVaultTokenAccount,
      coinCreatorVaultAuthority,
      globalVolumeAccumulator,
      userVolumeAccumulator,
      feeConfig,
      feeProgram: getAddress(FEE_PROGRAM_ID),
      baseAmountOut: tokenAmountOut,
      maxQuoteAmountIn: maxQuoteIn,
      trackVolume: [allowTrackVolume] as const,
    },
    { programAddress: getAddress(PUMP_AMM_PROGRAM_ID) }
  );
}

export interface AmmSellParams {
  user: TransactionSigner;
  baseMint: Address | string;
  quoteMint: Address | string;
  index?: number;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  tokenAmountIn: bigint;
  minQuoteOut: bigint;
  allowTrackVolume?: boolean;
  rpc: RpcClient;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Build a sell instruction via the AMM pool (not bonding curve).
 * 
 * TODO: Complete implementation once we verify the generated instruction signature.
 */
export async function ammSell(params: AmmSellParams) {
  const {
    user,
    baseMint,
    quoteMint,
    tokenAmountIn,
    minQuoteOut,
    rpc,
    allowTrackVolume = true,
    commitment: commitmentOverride,
  } = params;

  if (tokenAmountIn <= 0n) throw new Error("tokenAmountIn must be positive");
  if (minQuoteOut <= 0n) throw new Error("minQuoteOut must be positive");

  const commitment = commitmentOverride ?? getDefaultCommitment();
  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(TOKEN_PROGRAM_ID);

  const pool = await resolvePoolAddress(params, userAddr);
  const { poolData, globalConfigData, globalConfigAddress } = await resolvePoolState(
    rpc,
    pool,
    commitment
  );

  const protocolFeeRecipient = pickProtocolFeeRecipient(globalConfigData.protocolFeeRecipients);
  if (!protocolFeeRecipient) {
    throw new Error("Global config does not define a protocol fee recipient");
  }

  const coinCreatorVaultAuthority = await coinCreatorVaultAuthorityPda(poolData.coinCreator);
  const coinCreatorVaultTokenAccount = await coinCreatorVaultAta(
    coinCreatorVaultAuthority,
    quote,
    tokenProgramAddr
  );

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
  const [protocolFeeRecipientAta] = await findAssociatedTokenPda({
    owner: protocolFeeRecipient,
    tokenProgram: tokenProgramAddr,
    mint: quote,
  });
  const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
  const userVolumeAccumulator = await userVolumeAccumulatorPda(userAddr);
  const eventAuthority = await eventAuthorityPda();
  const feeConfig = await ammFeeConfigPda();

  return getSellInstruction(
    {
      pool,
      user,
      globalConfig: globalConfigAddress,
      baseMint: base,
      quoteMint: quote,
      userBaseTokenAccount: userBaseAta,
      userQuoteTokenAccount: userQuoteAta,
      poolBaseTokenAccount: poolBaseAta,
      poolQuoteTokenAccount: poolQuoteAta,
      protocolFeeRecipient,
      protocolFeeRecipientTokenAccount: protocolFeeRecipientAta,
      baseTokenProgram: tokenProgramAddr,
      quoteTokenProgram: tokenProgramAddr,
      systemProgram: getAddress(SYSTEM_PROGRAM_ID),
      associatedTokenProgram: getAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
      eventAuthority,
      program: getAddress(PUMP_AMM_PROGRAM_ID),
      coinCreatorVaultAta: coinCreatorVaultTokenAccount,
      coinCreatorVaultAuthority,
      feeConfig,
      feeProgram: getAddress(FEE_PROGRAM_ID),
      baseAmountIn: tokenAmountIn,
      minQuoteAmountOut: minQuoteOut,
    },
    { programAddress: getAddress(PUMP_AMM_PROGRAM_ID) }
  );
}

async function resolvePoolAddress(
  params: {
    index?: number;
    poolAddress?: Address | string;
    poolCreator?: Address | string;
    baseMint: Address | string;
    quoteMint: Address | string;
  },
  userAddress: Address | string
): Promise<Address> {
  if (params.poolAddress) {
    return getAddress(params.poolAddress);
  }

  const index = params.index ?? DEFAULT_POOL_INDEX;
  const creator = getAddress(params.poolCreator ?? userAddress);
  return await poolPda(index, creator, getAddress(params.baseMint), getAddress(params.quoteMint));
}

async function resolvePoolState(
  rpc: RpcClient,
  pool: Address,
  commitment: "processed" | "confirmed" | "finalized"
) {
  const globalConfigAddress = await globalConfigPda();
  const [poolAccount, globalConfigAccount] = await Promise.all([
    fetchPool(rpc, pool, { commitment }),
    fetchGlobalConfig(rpc, globalConfigAddress, { commitment }),
  ]);

  return {
    poolData: poolAccount.data,
    globalConfigData: globalConfigAccount.data,
    globalConfigAddress,
  };
}

function pickProtocolFeeRecipient(protocolFeeRecipients: readonly Address[]): Address | null {
  const candidates = protocolFeeRecipients.filter(Boolean);
  return candidates.length > 0 ? getAddress(candidates[0]!) : null;
}
