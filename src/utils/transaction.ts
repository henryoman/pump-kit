/**
 * Transaction building, sending, confirmation, and simulation utilities.
 */

import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import {
  addSignersToTransactionMessage,
  isTransactionSigner,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type TransactionMessageWithBlockhashLifetime,
  type TransactionMessageWithFeePayer,
} from "@solana/transaction-messages";
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
} from "@solana/transactions";
import { address as toAddress } from "@solana/addresses";
import { rpc, rpcSubscriptions, defaultCommitment } from "../config/rpc";
import { sendAndConfirmTransactionFactory } from "@solana/kit";
import type { Commitment } from "@solana/rpc-types";

const COMPUTE_BUDGET_PROGRAM = toAddress(
  "ComputeBudget111111111111111111111111111111"
);

export interface TransactionResult {
  signature: string;
  slot?: number | bigint | null;
}

export interface BuildTransactionParams {
  instructions: readonly Instruction[];
  payer: Address | TransactionSigner;
  /** Optional additional signers that should be associated with the transaction message. */
  additionalSigners?: readonly TransactionSigner[];
  /** Optional override for the blockhash lifetime. */
  latestBlockhash?: string;
  /** Optional override for the last valid block height associated with the blockhash. */
  lastValidBlockHeight?: bigint | number;
  /** Instructions to insert ahead of the provided instruction list (e.g. priority fee config). */
  prependInstructions?: readonly Instruction[];
  /** Instructions to append after the provided instruction list. */
  appendInstructions?: readonly Instruction[];
  /** Optional priority fee instructions to prepend automatically. */
  priorityFees?: PriorityFeeOptions;
  /** Transaction message version. Defaults to legacy. */
  version?: "legacy" | 0;
  /** Custom RPC client (useful for testing). */
  rpc?: typeof rpc;
  /** Commitment to use when fetching the latest blockhash. */
  commitment?: Commitment;
}

export interface BuiltTransaction {
  transactionMessage: TransactionMessageWithSignersLifetime;
  latestBlockhash: string;
  lastValidBlockHeight: bigint;
}

type TransactionMessageWithSignersLifetime = any;

export interface SendOptions {
  abortSignal?: AbortSignal;
  skipPreflight?: boolean;
  maxRetries?: number;
  minContextSlot?: number;
  preflightCommitment?: Commitment;
}

export interface SendAndConfirmTransactionParams
  extends Omit<BuildTransactionParams, "payer"> {
  payer: TransactionSigner;
  sendOptions?: SendOptions;
  rpc?: typeof rpc;
  rpcSubscriptions?: typeof rpcSubscriptions;
  commitment?: Commitment;
}

export interface SimulateTransactionOptions {
  commitment?: Commitment;
  sigVerify?: boolean;
  replaceRecentBlockhash?: boolean;
  minContextSlot?: number;
  accounts?: {
    encoding?: "base64" | "base64+zstd" | "jsonParsed";
    addresses: readonly string[];
  };
}

export interface SimulateTransactionParams
  extends Omit<BuildTransactionParams, "payer"> {
  payer: TransactionSigner;
  additionalSigners?: readonly TransactionSigner[];
  options?: SimulateTransactionOptions;
  rpc?: typeof rpc;
  commitment?: Commitment;
}

export interface SimulationResponse {
  context: {
    slot: number;
  };
  value: {
    err: unknown;
    logs: readonly string[] | null;
    unitsConsumed?: number;
    accounts?: unknown;
    returnData?: unknown;
  };
}

/**
 * Builds a transaction message from the provided instructions and payer, attaching
 * a recent blockhash lifetime and any supplied signers.
 */
export async function buildTransaction({
  instructions,
  payer,
  additionalSigners = [],
  latestBlockhash,
  lastValidBlockHeight,
  version = "legacy",
  rpc: rpcClient = rpc,
  commitment = defaultCommitment,
  prependInstructions = [],
  appendInstructions = [],
  priorityFees,
}: BuildTransactionParams): Promise<BuiltTransaction> {
  const payerAddress =
    typeof payer === "string" ? toAddress(payer) : payer.address;

  let message: any = createTransactionMessage({ version });

  const priorityInstructions = buildPriorityFeeInstructions(priorityFees);

  const orderedInstructions = [
    ...priorityInstructions,
    ...(prependInstructions ?? []),
    ...instructions,
    ...(appendInstructions ?? []),
  ];

  for (const instruction of orderedInstructions) {
    message = appendTransactionMessageInstruction(instruction, message);
  }

  let messageWithFeePayer = setTransactionMessageFeePayer(
    payerAddress,
    message as any
  ) as TransactionMessageWithFeePayer;

  const signers: TransactionSigner[] = [];

  if (isTransactionSignerTyped(payer)) {
    messageWithFeePayer = setTransactionMessageFeePayerSigner(
      payer,
      messageWithFeePayer as any
    ) as TransactionMessageWithFeePayer;
    signers.push(payer);
  }

  if (additionalSigners.length > 0) {
    signers.push(...additionalSigners.filter(isTransactionSigner));
  }

  const messageWithSigners =
    signers.length > 0
      ? (addSignersToTransactionMessage(signers, messageWithFeePayer as any) as TransactionMessageWithFeePayer)
      : messageWithFeePayer;

  let blockhash = latestBlockhash;
  let validBlockHeight =
    lastValidBlockHeight !== undefined
      ? BigInt(lastValidBlockHeight)
      : undefined;

  if (!blockhash || validBlockHeight === undefined) {
    const { value } = await rpcClient
      .getLatestBlockhash({ commitment })
      .send();
    blockhash = blockhash ?? value.blockhash;
    if (validBlockHeight === undefined) {
      validBlockHeight = BigInt(value.lastValidBlockHeight);
    }
  }

  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash as any,
      lastValidBlockHeight: validBlockHeight!,
    },
    messageWithSigners as any
  ) as TransactionMessageWithSignersLifetime;

  return {
    transactionMessage: messageWithLifetime,
    latestBlockhash: blockhash!,
    lastValidBlockHeight: validBlockHeight!,
  };
}

/**
 * Signs, sends, and waits for confirmation of the supplied instructions using the provided signer.
 */
export async function sendAndConfirmTransaction({
  instructions,
  payer,
  additionalSigners = [],
  latestBlockhash,
  lastValidBlockHeight,
  version,
  prependInstructions,
  appendInstructions,
  priorityFees,
  rpc: rpcClient = rpc,
  rpcSubscriptions: rpcSubscriptionsClient = rpcSubscriptions,
  commitment = defaultCommitment,
  sendOptions = {},
}: SendAndConfirmTransactionParams): Promise<TransactionResult> {
  const built = await buildTransaction({
    instructions,
    payer,
    additionalSigners,
    latestBlockhash,
    lastValidBlockHeight,
    version,
    prependInstructions,
    appendInstructions,
    priorityFees,
    rpc: rpcClient,
    commitment,
  });

  const signedTransaction = await signTransactionMessageWithSigners(
    built.transactionMessage as any
  );

  const signature = getSignatureFromTransaction(signedTransaction);

  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: rpcClient,
    rpcSubscriptions: rpcSubscriptionsClient,
  });

  const sendConfig: Record<string, unknown> = {
    commitment,
  };

  if (sendOptions.abortSignal) sendConfig.abortSignal = sendOptions.abortSignal;
  if (sendOptions.skipPreflight !== undefined) sendConfig.skipPreflight = sendOptions.skipPreflight;
  if (sendOptions.minContextSlot !== undefined) {
    sendConfig.minContextSlot = BigInt(sendOptions.minContextSlot);
  }
  if (sendOptions.maxRetries !== undefined) sendConfig.maxRetries = sendOptions.maxRetries;
  if (sendOptions.preflightCommitment) {
    sendConfig.preflightCommitment = sendOptions.preflightCommitment;
  }

  await sendAndConfirm(signedTransaction as any, sendConfig as any);

  const statusResponse = await rpcClient
    .getSignatureStatuses([signature], { searchTransactionHistory: false })
    .send();
  const status = statusResponse.value?.[0] ?? null;

  return {
    signature,
    slot: status?.slot ?? null,
  };
}

/**
 * Simulates the provided set of instructions without broadcasting the transaction.
 */
export async function simulateTransaction({
  instructions,
  payer,
  additionalSigners = [],
  latestBlockhash,
  lastValidBlockHeight,
  version,
  prependInstructions,
  appendInstructions,
  priorityFees,
  rpc: rpcClient = rpc,
  commitment = defaultCommitment,
  options = {},
}: SimulateTransactionParams): Promise<SimulationResponse> {
  const built = await buildTransaction({
    instructions,
    payer,
    additionalSigners,
    latestBlockhash,
    lastValidBlockHeight,
    version,
    prependInstructions,
    appendInstructions,
    priorityFees,
    rpc: rpcClient,
    commitment,
  });

  const signedTransaction = await signTransactionMessageWithSigners(
    built.transactionMessage as any
  );

  const encoded = getBase64EncodedWireTransaction(signedTransaction);

  const simulateConfig: Record<string, unknown> = {
    commitment: options.commitment ?? commitment,
  };

  if (options.minContextSlot !== undefined) {
    simulateConfig.minContextSlot = BigInt(options.minContextSlot);
  }

  if (options.sigVerify !== undefined) {
    simulateConfig.sigVerify = options.sigVerify;
  }

  if (options.replaceRecentBlockhash !== undefined) {
    if (options.sigVerify) {
      throw new Error(
        "replaceRecentBlockhash cannot be true when sigVerify is enabled."
      );
    }
    simulateConfig.replaceRecentBlockhash = options.replaceRecentBlockhash;
  }

  if (options.accounts) {
    simulateConfig.accounts = options.accounts as any;
  }

  const response = await rpcClient
    .simulateTransaction(encoded, simulateConfig as any)
    .send();

  const normalized: SimulationResponse = {
    context: {
      slot: Number(response.context.slot),
    },
    value: {
      err: response.value.err,
      logs: response.value.logs,
      unitsConsumed:
        response.value.unitsConsumed !== undefined
          ? Number(response.value.unitsConsumed)
          : undefined,
      accounts: response.value.accounts,
      returnData: response.value.returnData ?? undefined,
    },
  };

  return normalized;
}

function isTransactionSignerTyped(value: Address | TransactionSigner): value is TransactionSigner {
  return typeof value !== "string" && isTransactionSigner(value);
}

export interface PriorityFeeOptions {
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number | bigint;
}

export function buildPriorityFeeInstructions(
  priorityFees?: PriorityFeeOptions
): Instruction[] {
  if (!priorityFees) return [];

  const instructions: Instruction[] = [];

  if (
    priorityFees.computeUnitLimit !== undefined &&
    priorityFees.computeUnitLimit > 0
  ) {
    instructions.push(
      createSetComputeUnitLimitInstruction(priorityFees.computeUnitLimit)
    );
  }

  if (
    priorityFees.computeUnitPriceMicroLamports !== undefined &&
    BigInt(priorityFees.computeUnitPriceMicroLamports) > 0n
  ) {
    instructions.push(
      createSetComputeUnitPriceInstruction(
        BigInt(priorityFees.computeUnitPriceMicroLamports)
      )
    );
  }

  return instructions;
}

function createSetComputeUnitLimitInstruction(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 0; // SetComputeUnitLimit discriminator
  new DataView(data.buffer).setUint32(1, units, true);
  return {
    programAddress: COMPUTE_BUDGET_PROGRAM,
    accounts: [],
    data,
  };
}

function createSetComputeUnitPriceInstruction(
  microLamports: bigint
): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3; // SetComputeUnitPrice discriminator
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return {
    programAddress: COMPUTE_BUDGET_PROGRAM,
    accounts: [],
    data,
  };
}
