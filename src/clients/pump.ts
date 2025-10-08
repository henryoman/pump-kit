/**
 * Thin client wrappers for Pump bonding curve operations.
 * These functions provide a simple, opinionated API over the generated instruction builders.
 */

import type { Address, TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

import {
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  FEE_PROGRAM_ID,
} from "../config/addresses";
import {
  globalPda,
  bondingCurvePda,
  associatedBondingCurveAta,
  creatorVaultPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  eventAuthorityPda,
} from "../pda/pump";
import {
  getBuyInstruction,
  getSellInstruction,
  getCreateInstruction,
} from "../pumpsdk/generated/instructions";

export interface BuyParams {
  /** The user's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: Address | string;
  /** Amount of tokens to buy */
  tokenAmount: bigint;
  /** Maximum SOL to spend (slippage protection) */
  maxSolCostLamports: bigint;
  /** Fee recipient address */
  feeRecipient: Address | string;
  /** Whether to track volume (default: true) */
  trackVolume?: boolean;
}

/**
 * Build a buy instruction for purchasing tokens from the bonding curve.
 */
export async function buy(params: BuyParams) {
  const {
    user,
    mint: mintStr,
    tokenAmount,
    maxSolCostLamports,
    feeRecipient,
    trackVolume = true,
  } = params;

  const mint = getAddress(mintStr);
  const userAddr = user.address;
  
  // Derive PDAs (all async)
  const global = await globalPda();
  const bondingCurve = await bondingCurvePda(mint);
  const associatedBondingCurve = await associatedBondingCurveAta(bondingCurve, mint);
  const [associatedUser] = await findAssociatedTokenPda({
    owner: userAddr,
    mint,
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });
  const creatorVault = await creatorVaultPda(bondingCurve);
  const eventAuthority = await eventAuthorityPda();
  const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
  const userVolumeAccumulator = await userVolumeAccumulatorPda(userAddr);

  return getBuyInstruction({
    global,
    feeRecipient: getAddress(feeRecipient),
    mint,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    user,
    systemProgram: getAddress(SYSTEM_PROGRAM_ID),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
    creatorVault,
    eventAuthority,
    program: getAddress(PUMP_PROGRAM_ID),
    globalVolumeAccumulator,
    userVolumeAccumulator,
    feeConfig: global, // Placeholder - may need specific PDA
    feeProgram: getAddress(FEE_PROGRAM_ID),
    amount: tokenAmount,
    maxSolCost: maxSolCostLamports,
    trackVolume: [trackVolume] as readonly [boolean],
  });
}

export interface SellParams {
  /** The user's wallet/signer */
  user: TransactionSigner;
  /** Token mint address */
  mint: Address | string;
  /** Amount of tokens to sell */
  tokenAmount: bigint;
  /** Minimum SOL to receive (slippage protection) */
  minSolOutputLamports: bigint;
  /** Fee recipient address */
  feeRecipient: Address | string;
  /** Whether to track volume (default: true) */
  trackVolume?: boolean;
}

/**
 * Build a sell instruction for selling tokens back to the bonding curve.
 */
export async function sell(params: SellParams) {
  const {
    user,
    mint: mintStr,
    tokenAmount,
    minSolOutputLamports,
    feeRecipient,
    trackVolume = true,
  } = params;

  const mint = getAddress(mintStr);
  const userAddr = user.address;
  
  // Derive PDAs (all async)
  const global = await globalPda();
  const bondingCurve = await bondingCurvePda(mint);
  const associatedBondingCurve = await associatedBondingCurveAta(bondingCurve, mint);
  const [associatedUser] = await findAssociatedTokenPda({
    owner: userAddr,
    mint,
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });
  const creatorVault = await creatorVaultPda(bondingCurve);
  const eventAuthority = await eventAuthorityPda();

  return getSellInstruction({
    global,
    feeRecipient: getAddress(feeRecipient),
    mint,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    user,
    systemProgram: getAddress(SYSTEM_PROGRAM_ID),
    creatorVault,
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
    eventAuthority,
    program: getAddress(PUMP_PROGRAM_ID),
    feeConfig: global, // Placeholder
    feeProgram: getAddress(FEE_PROGRAM_ID),
    amount: tokenAmount,
    minSolOutput: minSolOutputLamports,
  });
}

export interface CreateParams {
  /** The user's wallet/signer (will be creator) */
  user: TransactionSigner;
  /** Token mint keypair/signer (should be pre-generated) */
  mint: TransactionSigner;
  /** Mint authority address (usually same as user) */
  mintAuthority: Address | string;
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Metadata URI */
  uri: string;
  /** Creator address (usually user's address) */
  creator?: Address | string;
}

/**
 * Build a create instruction for minting a new token on the bonding curve.
 * Note: This creates the token but doesn't include a first buy.
 * For mint + first buy, you'll need to combine this with a buy instruction.
 */
export async function create(params: CreateParams) {
  const { user, mint, mintAuthority, name, symbol, uri, creator } = params;

  const mintAddress = mint.address;
  const creatorAddress = creator ? getAddress(creator) : user.address;
  
  // Derive PDAs (all async)
  const global = await globalPda();
  const bondingCurve = await bondingCurvePda(mintAddress);
  const associatedBondingCurve = await associatedBondingCurveAta(bondingCurve, mintAddress);
  
  // Metadata PDA (Metaplex standard)
  // Seed: ["metadata", metadataProgram, mint]
  const [metadataPda] = await getProgramDerivedAddress({
    programAddress: getAddress("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
    seeds: [
      new TextEncoder().encode("metadata"),
      getAddress("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
      mintAddress,
    ],
  });

  const eventAuthority = await eventAuthorityPda();

  return getCreateInstruction({
    mint,
    mintAuthority: getAddress(mintAuthority),
    bondingCurve,
    associatedBondingCurve,
    global,
    mplTokenMetadata: getAddress("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
    metadata: metadataPda,
    user,
    systemProgram: getAddress(SYSTEM_PROGRAM_ID),
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
    associatedTokenProgram: getAddress("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    rent: getAddress("SysvarRent111111111111111111111111111111111"),
    eventAuthority,
    program: getAddress(PUMP_PROGRAM_ID),
    name,
    symbol,
    uri,
    creator: creatorAddress,
  });
}

// Helper import for metadata PDA
import { getProgramDerivedAddress } from "@solana/kit";
