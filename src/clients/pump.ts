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
  feeConfigPda,
} from "../pda/pump";
import {
  getBuyInstruction,
  getSellInstruction,
  getCreateInstruction,
} from "../pumpsdk/generated/instructions";
import { fetchBondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import { rpc as defaultRpc, defaultCommitment } from "../config/rpc";

type RpcClient = Parameters<typeof fetchBondingCurve>[0];
type Commitment = "processed" | "confirmed" | "finalized";

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
  /** Optional bonding curve creator (skips RPC lookup) */
  bondingCurveCreator?: Address | string;
  /** Optional RPC client */
  rpc?: RpcClient;
  /** Optional commitment level */
  commitment?: Commitment;
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
    bondingCurveCreator,
    rpc = defaultRpc,
    commitment = defaultCommitment,
  } = params;

  const mint = getAddress(mintStr);
  const userAddr = user.address;
  const bondingCurve = await bondingCurvePda(mint);

  const feeConfigPromise = feeConfigPda();
  const globalPromise = globalPda();
  const eventAuthorityPromise = eventAuthorityPda();
  const globalVolumeAccumulatorPromise = globalVolumeAccumulatorPda();
  const userVolumeAccumulatorPromise = userVolumeAccumulatorPda(userAddr);

  // Derive PDAs (all async)
  const associatedBondingCurvePromise = associatedBondingCurveAta(bondingCurve, mint);
  const associatedUserPromise = findAssociatedTokenPda({
    owner: userAddr,
    mint,
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });

  const creatorAddress = await resolveCreatorAddress({
    bondingCurve,
    providedCreator: bondingCurveCreator,
    rpc,
    commitment,
  });

  const [
    global,
    associatedBondingCurve,
    [associatedUser],
    creatorVault,
    eventAuthority,
    globalVolumeAccumulator,
    userVolumeAccumulator,
    feeConfig,
  ] = await Promise.all([
    globalPromise,
    associatedBondingCurvePromise,
    associatedUserPromise,
    creatorVaultPda(creatorAddress),
    eventAuthorityPromise,
    globalVolumeAccumulatorPromise,
    userVolumeAccumulatorPromise,
    feeConfigPromise,
  ]);

  // Derive PDAs (all async)
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
    feeConfig,
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
  /** Optional bonding curve creator (skips RPC lookup) */
  bondingCurveCreator?: Address | string;
  /** Optional RPC client */
  rpc?: RpcClient;
  /** Optional commitment level */
  commitment?: Commitment;
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
    bondingCurveCreator,
    rpc = defaultRpc,
    commitment = defaultCommitment,
  } = params;

  const mint = getAddress(mintStr);
  const userAddr = user.address;
  const bondingCurve = await bondingCurvePda(mint);

  const globalPromise = globalPda();
  const associatedBondingCurvePromise = associatedBondingCurveAta(bondingCurve, mint);
  const associatedUserPromise = findAssociatedTokenPda({
    owner: userAddr,
    mint,
    tokenProgram: getAddress(TOKEN_PROGRAM_ID),
  });
  const feeConfigPromise = feeConfigPda();
  const eventAuthorityPromise = eventAuthorityPda();

  const creatorAddress = await resolveCreatorAddress({
    bondingCurve,
    providedCreator: bondingCurveCreator,
    rpc,
    commitment,
  });

  const [
    global,
    associatedBondingCurve,
    [associatedUser],
    creatorVault,
    eventAuthority,
    feeConfig,
  ] = await Promise.all([
    globalPromise,
    associatedBondingCurvePromise,
    associatedUserPromise,
    creatorVaultPda(creatorAddress),
    eventAuthorityPromise,
    feeConfigPromise,
  ]);

  // Derive PDAs (all async)
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
    feeConfig,
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

async function resolveCreatorAddress(args: {
  bondingCurve: Address;
  providedCreator?: Address | string;
  rpc: RpcClient;
  commitment: Commitment;
}): Promise<Address> {
  const { bondingCurve, providedCreator, rpc, commitment } = args;

  if (providedCreator) {
    return getAddress(providedCreator);
  }

  try {
    const account = await fetchBondingCurve(rpc, bondingCurve, { commitment });
    return account.data.creator;
  } catch (error) {
    throw new Error(
      "Unable to resolve bonding curve creator. Provide `bondingCurveCreator` or configure an RPC endpoint with access to the bonding curve account.",
      { cause: error }
    );
  }
}
