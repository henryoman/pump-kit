import { createLaunchLookupTable } from "../launch/lookup_table";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { assertMintSigner } from "../clients/create_v2";

import type { RpcClient, RpcSubscriptionsClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import {
  mintWithFirstBuy,
  type MintWithFirstBuyParams,
} from "../recipes/mintFirstBuy";
import {
  sendAndConfirmTransaction,
  type TransactionResult,
  type PriorityFeeOptions,
  type SendOptions,
} from "../utils/transaction";

export interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

export interface CreateAndBuyOptions {
  creator: TransactionSigner;
  metadata: TokenMetadata;
  firstBuyAmountSol?: string;
  firstBuyTokenAmount?: bigint;
  estimatedFirstBuyCost?: bigint;
  slippageBps?: number;
  feeRecipient?: string;
  bondingCurveCreator?: string;
  mintAuthority?: string;
  mint: TransactionSigner;
  addressLookupTables?: Record<string, readonly Address[]>;
  priorityFees?: PriorityFeeOptions;
  prependInstructions?: readonly Instruction[];
  appendInstructions?: readonly Instruction[];
  additionalSigners?: readonly TransactionSigner[];
  sendOptions?: SendOptions;
  commitment?: ReturnType<typeof getDefaultCommitment>;
  rpc: RpcClient;
  rpcSubscriptions: RpcSubscriptionsClient;
}

export interface CreateAndBuyResult extends TransactionResult {
  mint: TransactionSigner;
  createInstruction: Instruction;
  buyInstruction: Instruction;
}

export async function createAndBuy(options: CreateAndBuyOptions): Promise<CreateAndBuyResult> {
  const {
    creator,
    metadata,
    firstBuyAmountSol,
    firstBuyTokenAmount,
    estimatedFirstBuyCost,
    slippageBps,
    feeRecipient,
    bondingCurveCreator,
    mintAuthority,
    mint: providedMint,
    priorityFees,
    prependInstructions,
    appendInstructions,
    additionalSigners,
    sendOptions,
    commitment = getDefaultCommitment(),
    rpc,
    rpcSubscriptions,
  } = options;

  assertMintSigner(providedMint);
  const mintSigner = providedMint;

  const mintParams: MintWithFirstBuyParams = {
    user: creator,
    mint: mintSigner,
    mintAuthority,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    firstBuyAmountSol,
    firstBuyTokenAmount,
    estimatedFirstBuyCost,
    slippageBps,
    feeRecipient,
    bondingCurveCreator: bondingCurveCreator ?? creator.address,
    rpc,
    commitment,
  };

  const { createInstruction, buyInstruction, instructions } = await mintWithFirstBuy(mintParams);

  const tables = options.addressLookupTables ?? {};
  if (!Object.keys(tables).length) {
    const table = await createLaunchLookupTable({ instructions, signer: creator, rpc, rpcSubscriptions });
    tables[table.address] = table.addresses;
  }
  const result = await sendAndConfirmTransaction({
    version: 0,
    addressLookupTables: tables,
    instructions,
    payer: creator,
    commitment,
    priorityFees,
    prependInstructions,
    appendInstructions,
    additionalSigners: dedupeSigners([
      mintSigner,
      ...(additionalSigners ?? []),
    ]),
    sendOptions,
    rpc,
    rpcSubscriptions,
  });

  return {
    ...result,
    mint: mintSigner,
    createInstruction,
    buyInstruction,
  };
}

function dedupeSigners(signers: readonly TransactionSigner[]): TransactionSigner[] {
  const seen = new Set<string>();
  const unique: TransactionSigner[] = [];
  for (const signer of signers) {
    const key = signer.address;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(signer);
    }
  }
  return unique;
}
