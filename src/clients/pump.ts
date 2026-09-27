/**
 * Thin client wrappers for Pump bonding curve operations.
 * These functions provide a simple, opinionated API over the generated instruction builders.
 */

import type { Address, TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import { buyV2, sellV2 } from "./trade_v2";
import { fetchGlobal } from "../pumpsdk/generated/accounts/global";

import {
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../config/addresses";
import {
  globalPda,
  bondingCurvePda,
  associatedBondingCurveAta,
  eventAuthorityPda,
} from "../pda/pump";
import {
  getCreateInstruction,
} from "../pumpsdk/generated/instructions";
import { fetchBondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";

type FetchClient = Parameters<typeof fetchBondingCurve>[0];
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
  /** RPC client used to fetch Pump accounts */
  rpc: RpcClient;
  /** Optional commitment level */
  commitment?: Commitment;
}

/**
 * Build a buy instruction for purchasing tokens from the bonding curve.
 */
export async function buy(params: BuyParams) {
  const resolved = await resolveTradeParams(params);
  return buyV2({ ...resolved, tokenAmountRaw: params.tokenAmount, maxQuoteInputRaw: params.maxSolCostLamports });
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
  /** RPC client used to fetch bonding curve and fee config */
  rpc: RpcClient;
  /** Optional commitment level */
  commitment?: Commitment;
}

/**
 * Build a sell instruction for selling tokens back to the bonding curve.
 */
export async function sell(params: SellParams) {
  const resolved = await resolveTradeParams(params);
  return sellV2({ ...resolved, tokenAmountRaw: params.tokenAmount, minQuoteOutputRaw: params.minSolOutputLamports });
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
  rpc: FetchClient;
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

async function resolveTradeParams(params: BuyParams | SellParams) {
  const creator = await resolveCreatorAddress({ bondingCurve: await bondingCurvePda(params.mint),
    providedCreator: params.bondingCurveCreator, rpc: params.rpc, commitment: params.commitment ?? getDefaultCommitment() });
  const global = (await fetchGlobal(params.rpc, await globalPda(), { commitment: params.commitment ?? getDefaultCommitment() })).data;
  return { user: params.user, mint: params.mint, rpc: params.rpc, bondingCurveCreator: creator,
    feeRecipient: params.feeRecipient, buybackFeeRecipient: global.buybackFeeRecipients[0]! };
}
