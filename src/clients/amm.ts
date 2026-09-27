/**
 * Thin client wrappers for Pump AMM operations.
 * These functions provide a simple, opinionated API over the generated instruction builders.
 */

import type { Address, TransactionSigner } from "@solana/kit";
import { address as getAddress, getProgramDerivedAddress, getAddressEncoder, AccountRole } from "@solana/kit";
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
  ammFeeConfigPda,
} from "../pda/pumpAmm";
import {
  getDepositInstruction,
  getWithdrawInstruction,
  getBuyInstruction,
  getBuyExactQuoteInInstruction,
  getSellInstruction,
} from "../ammsdk/generated/instructions";
import { fetchPool } from "../ammsdk/generated/accounts/pool";
import { fetchGlobalConfig } from "../ammsdk/generated/accounts/globalConfig";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";

import { resolveTokenProgram, validateTokenProgram } from "../utils/token_program";

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
 * Custom pool creation is not implemented; trading existing pools is supported.
 */
export async function createPool(params: CreatePoolParams) {
  const { user, baseMint, quoteMint, index } = params;

  const userAddr = user.address;
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  
  // Derive PDAs (all async)
  const pool = await poolPda(index, userAddr, base, quote);
  const _lpMint = await lpMintPda(pool);
  const _globalConfig = await globalConfigPda();

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
  /** Exact LP-token quantity requested, subject to maximum base and quote inputs. */
  lpTokenAmountOut: bigint;
  /** Legacy shared mint-owner hint. Prefer independent baseTokenProgram/quoteTokenProgram. */
  tokenProgram?: Address | string;
  /** Token-2022 program for LP mint (defaults to TOKEN_2022_PROGRAM_ID) */
  token2022Program?: Address | string;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  /** Resolves mint owners when individual programs are not supplied. */
  rpc?: RpcClient;
}

/**
 * Build a deposit (provide liquidity) instruction.
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
    lpTokenAmountOut,
    token2022Program = TOKEN_2022_PROGRAM_ID,
  } = params;

  if (maxBaseIn <= 0n) throw new Error("maxBaseIn must be positive");
  if (maxQuoteIn <= 0n) throw new Error("maxQuoteIn must be positive");

  if (typeof lpTokenAmountOut !== "bigint" || lpTokenAmountOut <= 0n) throw new Error("lpTokenAmountOut must be a positive bigint");

  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(TOKEN_PROGRAM_ID);
  const token2022ProgramAddr = getAddress(token2022Program);
  const [baseTokenProgramAddr, quoteTokenProgramAddr] = await resolveLiquidityTokenPrograms(params);
  const pool = poolAddress
    ? getAddress(poolAddress)
    : await poolPda(index, getAddress(poolCreator ?? userAddr), base, quote);

  const globalConfig = await globalConfigPda();
  const lpMint = await lpMintPda(pool);
  const userLp = await userLpAta(userAddr, lpMint);

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: baseTokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = await poolTokenAta(pool, base, baseTokenProgramAddr);
  const poolQuoteAta = await poolTokenAta(pool, quote, quoteTokenProgramAddr);
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
      lpTokenAmountOut: lpTokenAmountOut,
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
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  /** Resolves mint owners when individual programs are not supplied. */
  rpc?: RpcClient;
}

/**
 * Build a withdraw (remove liquidity) instruction.
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
    token2022Program = TOKEN_2022_PROGRAM_ID,
  } = params;

  if (lpAmountIn <= 0n) throw new Error("lpAmountIn must be positive");
  if (minBaseOut < 0n) throw new Error("minBaseOut cannot be negative");
  if (minQuoteOut < 0n) throw new Error("minQuoteOut cannot be negative");

  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const tokenProgramAddr = getAddress(TOKEN_PROGRAM_ID);
  const token2022ProgramAddr = getAddress(token2022Program);
  const [baseTokenProgramAddr, quoteTokenProgramAddr] = await resolveLiquidityTokenPrograms(params);
  const pool = poolAddress
    ? getAddress(poolAddress)
    : await poolPda(index, getAddress(poolCreator ?? userAddr), base, quote);

  const globalConfig = await globalConfigPda();
  const lpMint = await lpMintPda(pool);
  const userLp = await userLpAta(userAddr, lpMint);

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: baseTokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = await poolTokenAta(pool, base, baseTokenProgramAddr);
  const poolQuoteAta = await poolTokenAta(pool, quote, quoteTokenProgramAddr);
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

/** Quote and instruction construction share this exact protocol snapshot. */
export type AmmResolvedState = Readonly<{
  poolAddress: Address;
  poolData: Awaited<ReturnType<typeof fetchPool>>["data"];
  globalConfigData: Awaited<ReturnType<typeof fetchGlobalConfig>>["data"];
}>;

function validateResolvedState(state: AmmResolvedState, pool: Address, base: Address, quote: Address) {
  if (state.poolAddress !== pool || state.poolData.baseMint !== base || state.poolData.quoteMint !== quote) {
    throw new Error("Resolved AMM state does not match the requested pool and mints");
  }
  return { ...state, globalConfigAddress: globalConfigPda(), coinCreator: state.poolData.coinCreator };
}

export interface AmmBuyParams {
  user: TransactionSigner;
  baseMint: Address | string;
  quoteMint: Address | string;
  index?: number;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  resolvedState?: AmmResolvedState;
  tokenAmountOut: bigint;
  exactQuoteIn?: { amountIn: bigint; minAmountOut: bigint };
  maxQuoteIn: bigint;
  allowTrackVolume?: boolean;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  rpc: RpcClient;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Build a buy instruction via the AMM pool (not bonding curve).
 * Uses the pinned IDL builder and current required remaining accounts.
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

  if (params.exactQuoteIn) {
    const { amountIn, minAmountOut } = params.exactQuoteIn;
    if (typeof amountIn !== "bigint" || typeof minAmountOut !== "bigint" || amountIn <= 0n || minAmountOut <= 0n) {
      throw new Error("Exact-input limits must be positive bigint amounts");
    }
    if (amountIn !== maxQuoteIn) throw new Error("Exact-input budget must equal maxQuoteIn");
  }

  const commitment = commitmentOverride ?? getDefaultCommitment();
  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const [baseTokenProgramAddr, quoteTokenProgramAddr] = await Promise.all([
    resolveTokenProgram({ rpc, mint: base, tokenProgram: params.baseTokenProgram }),
    resolveTokenProgram({ rpc, mint: quote, tokenProgram: params.quoteTokenProgram }),
  ]);

  const pool = await resolvePoolAddress(params, userAddr);
  const state = params.resolvedState
    ? validateResolvedState(params.resolvedState, pool, base, quote)
    : await resolvePoolState(rpc, pool, commitment);
  const { poolData, globalConfigData, coinCreator } = state;
  const globalConfigAddress = await state.globalConfigAddress;

  const protocolFeeRecipient = pickProtocolFeeRecipient(poolData.isMayhemMode ? [globalConfigData.reservedFeeRecipient, ...globalConfigData.reservedFeeRecipients] : globalConfigData.protocolFeeRecipients);
  if (!protocolFeeRecipient) {
    throw new Error("Global config does not define a protocol fee recipient");
  }

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: baseTokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = poolData.poolBaseTokenAccount;
  const poolQuoteAta = poolData.poolQuoteTokenAccount;
  const [protocolFeeRecipientAta] = await findAssociatedTokenPda({
    owner: protocolFeeRecipient,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });
  const eventAuthority = await eventAuthorityPda();

  const coinCreatorAddress = coinCreator ? getAddress(coinCreator) : poolData.creator;
  const coinCreatorVaultAuthority = await coinCreatorVaultAuthorityPda(coinCreatorAddress);
  const coinCreatorVaultTokenAccount = await coinCreatorVaultAta(
    coinCreatorVaultAuthority,
    quote,
    quoteTokenProgramAddr
  );

  const [globalVolumeAccumulator, userVolumeAccumulator] = await Promise.all([
    globalVolumeAccumulatorPda(),
    userVolumeAccumulatorPda(userAddr),
  ]);

  const feeConfig = await ammFeeConfigPda();
  const buildBuy = params.exactQuoteIn ? getBuyExactQuoteInInstruction : getBuyInstruction;
  const baseInstruction = buildBuy(
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
      baseTokenProgram: baseTokenProgramAddr,
      quoteTokenProgram: quoteTokenProgramAddr,
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
      spendableQuoteIn: params.exactQuoteIn?.amountIn ?? maxQuoteIn,
      minBaseAmountOut: params.exactQuoteIn?.minAmountOut ?? tokenAmountOut,
      baseAmountOut: tokenAmountOut,
      maxQuoteAmountIn: maxQuoteIn,
      trackVolume: [allowTrackVolume],
    },
    { programAddress: getAddress(PUMP_AMM_PROGRAM_ID) }
  );
  const remaining = await swapRemainingAccounts(poolData, globalConfigData, userAddr, quoteTokenProgramAddr, false);
  return { ...baseInstruction, accounts: [...baseInstruction.accounts, ...remaining] };
}

export interface AmmSellParams {
  user: TransactionSigner;
  baseMint: Address | string;
  quoteMint: Address | string;
  index?: number;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  resolvedState?: AmmResolvedState;
  tokenAmountIn: bigint;
  minQuoteOut: bigint;
  allowTrackVolume?: boolean;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  rpc: RpcClient;
  commitment?: "processed" | "confirmed" | "finalized";
}

/**
 * Build a sell instruction via the AMM pool (not bonding curve).
 * Uses the pinned IDL builder and current required remaining accounts.
 */
export async function ammSell(params: AmmSellParams) {
  const {
    user,
    baseMint,
    quoteMint,
    tokenAmountIn,
    minQuoteOut,
    rpc,
    commitment: commitmentOverride,
  } = params;

  if (tokenAmountIn <= 0n) throw new Error("tokenAmountIn must be positive");
  if (minQuoteOut <= 0n) throw new Error("minQuoteOut must be positive");

  const commitment = commitmentOverride ?? getDefaultCommitment();
  const userAddr = getAddress(user.address);
  const base = getAddress(baseMint);
  const quote = getAddress(quoteMint);
  const [baseTokenProgramAddr, quoteTokenProgramAddr] = await Promise.all([
    resolveTokenProgram({ rpc, mint: base, tokenProgram: params.baseTokenProgram }),
    resolveTokenProgram({ rpc, mint: quote, tokenProgram: params.quoteTokenProgram }),
  ]);

  const pool = await resolvePoolAddress(params, userAddr);
  const state = params.resolvedState
    ? validateResolvedState(params.resolvedState, pool, base, quote)
    : await resolvePoolState(rpc, pool, commitment);
  const { poolData, globalConfigData, coinCreator } = state;
  const globalConfigAddress = await state.globalConfigAddress;

  const protocolFeeRecipient = pickProtocolFeeRecipient(poolData.isMayhemMode ? [globalConfigData.reservedFeeRecipient, ...globalConfigData.reservedFeeRecipients] : globalConfigData.protocolFeeRecipients);
  if (!protocolFeeRecipient) {
    throw new Error("Global config does not define a protocol fee recipient");
  }

  const [userBaseAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: baseTokenProgramAddr,
    mint: base,
  });
  const [userQuoteAta] = await findAssociatedTokenPda({
    owner: userAddr,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });

  const poolBaseAta = poolData.poolBaseTokenAccount;
  const poolQuoteAta = poolData.poolQuoteTokenAccount;
  const [protocolFeeRecipientAta] = await findAssociatedTokenPda({
    owner: protocolFeeRecipient,
    tokenProgram: quoteTokenProgramAddr,
    mint: quote,
  });
  const eventAuthority = await eventAuthorityPda();

  const coinCreatorAddress = coinCreator ? getAddress(coinCreator) : poolData.creator;
  const coinCreatorVaultAuthority = await coinCreatorVaultAuthorityPda(coinCreatorAddress);
  const coinCreatorVaultTokenAccount = await coinCreatorVaultAta(
    coinCreatorVaultAuthority,
    quote,
    quoteTokenProgramAddr
  );
  const feeConfig = await ammFeeConfigPda();

  const baseInstruction = getSellInstruction(
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
      baseTokenProgram: baseTokenProgramAddr,
      quoteTokenProgram: quoteTokenProgramAddr,
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
  const remaining = await swapRemainingAccounts(poolData, globalConfigData, userAddr, quoteTokenProgramAddr, true);
  return { ...baseInstruction, accounts: [...baseInstruction.accounts, ...remaining] };
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

  const coinCreator = poolAccount.data.coinCreator;

  return {
    poolData: poolAccount.data,
    globalConfigData: globalConfigAccount.data,
    globalConfigAddress,
    coinCreator,
  };
}

function pickProtocolFeeRecipient(protocolFeeRecipients: readonly Address[]): Address | null {
  const candidates = protocolFeeRecipients.filter(Boolean);
  return candidates.length > 0 ? getAddress(candidates[0]!) : null;
}

async function swapRemainingAccounts(
  pool: Awaited<ReturnType<typeof fetchPool>>["data"],
  global: Awaited<ReturnType<typeof fetchGlobalConfig>>["data"],
  user: Address, quoteTokenProgram: Address, selling: boolean
) {
  const accounts: { address: Address; role: AccountRole }[] = [];
  if (pool.isCashbackCoin) {
    const accumulator = await userVolumeAccumulatorPda(user);
    const [ata] = await findAssociatedTokenPda({ owner: accumulator, mint: pool.quoteMint, tokenProgram: quoteTokenProgram });
    accounts.push({ address: ata, role: AccountRole.WRITABLE });
    if (selling) accounts.push({ address: accumulator, role: AccountRole.WRITABLE });
  }
  if (pool.coinCreator !== getAddress("11111111111111111111111111111111")) {
    const [poolV2] = await getProgramDerivedAddress({ programAddress: getAddress(PUMP_AMM_PROGRAM_ID),
      seeds: [new TextEncoder().encode("pool-v2"), getAddressEncoder().encode(pool.baseMint)] });
    accounts.push({ address: poolV2, role: AccountRole.READONLY });
  }
  const recipient = pickProtocolFeeRecipient(global.buybackFeeRecipients);
  if (!recipient) throw new Error("Global config does not define a buyback fee recipient");
  const [ata] = await findAssociatedTokenPda({ owner: recipient, mint: pool.quoteMint, tokenProgram: quoteTokenProgram });
  accounts.push({ address: recipient, role: AccountRole.READONLY }, { address: ata, role: AccountRole.WRITABLE });
  return accounts;
}

async function resolveLiquidityTokenPrograms(params: DepositParams | WithdrawParams) {
  const resolve = (mint: Address | string, hint?: Address | string) => {
    if (params.rpc) return resolveTokenProgram({ rpc: params.rpc, mint, tokenProgram: hint });
    const program = validateTokenProgram(hint ?? params.tokenProgram ?? TOKEN_PROGRAM_ID);
    return Promise.resolve(program);
  };
  return Promise.all([resolve(params.baseMint, params.baseTokenProgram ?? params.tokenProgram),
    resolve(params.quoteMint, params.quoteTokenProgram ?? params.tokenProgram)]);
}
