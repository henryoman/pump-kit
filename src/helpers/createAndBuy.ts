import type { Commitment } from "@solana/rpc-types";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { generateKeyPairSigner } from "@solana/signers";

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
  firstBuyTokenAmount: bigint;
  estimatedFirstBuyCost: bigint;
  slippageBps?: number;
  feeRecipient?: string;
  bondingCurveCreator?: string;
  mintAuthority?: string;
  mint?: TransactionSigner;
  priorityFees?: PriorityFeeOptions;
  prependInstructions?: readonly Instruction[];
  appendInstructions?: readonly Instruction[];
  additionalSigners?: readonly TransactionSigner[];
  sendOptions?: SendOptions;
  commitment?: Commitment;
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
    commitment,
  } = options;

  const mintSigner = providedMint ?? (await generateKeyPairSigner());

  const mintParams: MintWithFirstBuyParams = {
    user: creator,
    mint: mintSigner,
    mintAuthority: mintAuthority ?? creator.address,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    firstBuyTokenAmount,
    estimatedFirstBuyCost,
    slippageBps,
    feeRecipient,
    bondingCurveCreator: bondingCurveCreator ?? creator.address,
  };

  const { createInstruction, buyInstruction } = await mintWithFirstBuy(
    mintParams
  );

  const result = await sendAndConfirmTransaction({
    instructions: [createInstruction, buyInstruction],
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
