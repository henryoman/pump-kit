/**
 * Transaction building, sending, confirmation, and simulation utilities.
 */

import { address as toAddress } from "@solana/kit";
import { sendAndConfirmTransactionFactory } from "@solana/kit";
import type { Commitment } from "@solana/kit";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import type { RpcClient, RpcSubscriptionsClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import {
  appendTransactionMessageInstruction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type TransactionMessageWithBlockhashLifetime,
  type TransactionMessageWithFeePayer,
} from "@solana/kit";
import {
  addSignersToTransactionMessage,
  isTransactionSigner,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  getBase64EncodedWireTransaction,
  assertIsTransactionWithinSizeLimit,
  getSignatureFromTransaction,
} from "@solana/kit";

import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";

export type TransactionLifetime = Readonly<{
  blockhash: string;
  lastValidBlockHeight: bigint;
}>;

export interface TransactionResult {
  signature: string;
  slot?: number | bigint | null;
}

/** An unknown result must be reconciled using this signature before signing another order. */
export class TransactionExecutionError extends Error {
  constructor(
    message: string,
    readonly outcome: "failed" | "unknown",
    readonly signature: string,
    readonly lifetime: TransactionLifetime,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TransactionExecutionError";
  }
}

export interface BuildTransactionParams {
  instructions: readonly Instruction[];
  payer: Address | TransactionSigner;
  /** Optional additional signers that should be associated with the transaction message. */
  additionalSigners?: readonly TransactionSigner[];
  /** The blockhash and expiration from one RPC response. Omit to fetch a complete pair. */
  lifetime?: TransactionLifetime;
  /** Instructions to insert ahead of the provided instruction list (e.g. priority fee config). */
  prependInstructions?: readonly Instruction[];
  /** Instructions to append after the provided instruction list. */
  appendInstructions?: readonly Instruction[];
  /** Optional priority fee instructions to prepend automatically. */
  priorityFees?: PriorityFeeOptions;
  /** Addresses from active on-chain lookup tables, for version 0 messages. */
  addressLookupTables?: Record<string, readonly Address[]>;
  /** Transaction message version. Defaults to legacy. */
  version?: "legacy" | 0;
  /** Custom RPC client (useful for testing). */
  rpc: RpcClient;
  /** Commitment to use when fetching the latest blockhash. */
  commitment?: Commitment;
}

export interface BuiltTransaction {
  transactionMessage: TransactionMessageWithSignersLifetime;
  latestBlockhash: string;
  lastValidBlockHeight: bigint;
}

type TransactionMessageWithSignersLifetime = TransactionMessageWithBlockhashLifetime;

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
  /** Persist the signed transaction identity before any broadcast. Failure prevents submission. */
  onSigned?: (record: { signature: string; latestBlockhash: string; lastValidBlockHeight: bigint }) => Promise<void>;
  rpc: RpcClient;
  rpcSubscriptions: RpcSubscriptionsClient;
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
  rpc: RpcClient;
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
  lifetime,
  version = "legacy",
  addressLookupTables,
  rpc: rpcClient,
  commitment = getDefaultCommitment(),
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

  // Extract all signers from instructions first
  const instructionSigners = new Map<string, TransactionSigner>();
  
  for (const instruction of orderedInstructions) {
    message = appendTransactionMessageInstruction(instruction, message);
    // Extract signers from instruction accounts
    if (instruction.accounts) {
      for (const account of instruction.accounts) {
        if ('signer' in account && account.signer && typeof account.signer === 'object' && 'address' in account.signer) {
          const signer = account.signer as TransactionSigner;
          instructionSigners.set(signer.address, signer);
        }
      }
    }
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

  // Add signers from instructions (avoid duplicates)
  for (const signer of instructionSigners.values()) {
    if (!signers.some(s => s.address === signer.address)) {
      signers.push(signer);
    }
  }

  if (additionalSigners.length > 0) {
    for (const signer of additionalSigners) {
      if (isTransactionSigner(signer) && !signers.some(s => s.address === signer.address)) {
        signers.push(signer);
      }
    }
  }

  const messageWithSigners =
    signers.length > 0
      ? (addSignersToTransactionMessage(signers, messageWithFeePayer as any) as TransactionMessageWithFeePayer)
      : messageWithFeePayer;

  if (lifetime && (!lifetime.blockhash || typeof lifetime.lastValidBlockHeight !== "bigint")) {
    throw new Error("Transaction lifetime requires a blockhash and bigint lastValidBlockHeight");
  }
  const resolvedLifetime = lifetime ?? (await rpcClient.getLatestBlockhash({ commitment }).send()).value;
  const blockhash = resolvedLifetime.blockhash;
  const validBlockHeight = BigInt(resolvedLifetime.lastValidBlockHeight);

  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash as any,
      lastValidBlockHeight: validBlockHeight!,
    },
    messageWithSigners as any
  ) as TransactionMessageWithSignersLifetime;

  return {
    transactionMessage: addressLookupTables
      ? compressTransactionMessageUsingAddressLookupTables(messageWithLifetime as any, addressLookupTables as any) as TransactionMessageWithSignersLifetime
      : messageWithLifetime,
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
  lifetime,
  version,
  addressLookupTables,
  prependInstructions,
  appendInstructions,
  priorityFees,
  rpc: rpcClient,
  rpcSubscriptions: rpcSubscriptionsClient,
  commitment = getDefaultCommitment(),
  sendOptions = {},
  onSigned,
}: SendAndConfirmTransactionParams): Promise<TransactionResult> {
  const built = await buildTransaction({
    instructions,
    payer,
    additionalSigners,
    lifetime,
    version,
    addressLookupTables,
    prependInstructions,
    appendInstructions,
    priorityFees,
    rpc: rpcClient,
    commitment,
  });

  const signedTransaction = await signTransactionMessageWithSigners(
    built.transactionMessage as any
  );

  assertIsTransactionWithinSizeLimit(signedTransaction);
  const signature = getSignatureFromTransaction(signedTransaction);
  await onSigned?.({ signature, latestBlockhash: built.latestBlockhash, lastValidBlockHeight: built.lastValidBlockHeight });

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

  let sendError: unknown;
  try {
    await sendAndConfirm(signedTransaction as any, sendConfig as any);
  } catch (error) {
    sendError = error;
  }

  const lifetimeIdentity = { blockhash: built.latestBlockhash, lastValidBlockHeight: built.lastValidBlockHeight };
  let status;
  try {
    const response = await rpcClient.getSignatureStatuses([signature], { searchTransactionHistory: true }).send();
    status = response.value?.[0] ?? null;
  } catch (error) {
    throw new TransactionExecutionError("Transaction outcome is unknown; reconcile the original signature before retrying",
      "unknown", signature, lifetimeIdentity, { cause: sendError ?? error });
  }

  if (status?.err) {
    const serialize = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
    let errorMessage = `Transaction failed: ${serialize(status.err)}`;
    try {
      const tx = await rpcClient.getTransaction(signature, {
        commitment, encoding: "json", maxSupportedTransactionVersion: 0,
      }).send();
      if (tx?.meta?.logMessages?.length) {
        errorMessage += `\nProgram logs:\n${tx.meta.logMessages.join("\n")}`;
      }
    } catch {
      // Diagnostic reads can fail; retain the confirmed execution error.
    }
    throw new TransactionExecutionError(errorMessage, "failed", signature, lifetimeIdentity, { cause: sendError });
  }

  const confirmed = status?.confirmationStatus === "finalized" ||
    (commitment !== "finalized" && status?.confirmationStatus === "confirmed") ||
    (commitment === "processed" && status?.confirmationStatus === "processed");
  if (!confirmed) {
    throw new TransactionExecutionError("Transaction outcome is unknown; reconcile the original signature before retrying",
      "unknown", signature, lifetimeIdentity, { cause: sendError });
  }

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
  lifetime,
  version,
  addressLookupTables,
  prependInstructions,
  appendInstructions,
  priorityFees,
  rpc: rpcClient,
  commitment = getDefaultCommitment(),
  options = {},
}: SimulateTransactionParams): Promise<SimulationResponse> {
  const built = await buildTransaction({
    instructions,
    payer,
    additionalSigners,
    lifetime,
    version,
    addressLookupTables,
    prependInstructions,
    appendInstructions,
    priorityFees,
    rpc: rpcClient,
    commitment,
  });

  const signedTransaction = await signTransactionMessageWithSigners(
    built.transactionMessage as any
  );

  assertIsTransactionWithinSizeLimit(signedTransaction);
  const encoded = getBase64EncodedWireTransaction(signedTransaction);

  const simulateConfig: Record<string, unknown> = {
    encoding: "base64",
    commitment: options.commitment ?? commitment,
  };

  if (options.minContextSlot !== undefined) {
    simulateConfig.minContextSlot = BigInt(options.minContextSlot);
  }

  if (options.sigVerify !== undefined) {
    simulateConfig.sigVerify = options.sigVerify;
  }

  if (options.replaceRecentBlockhash !== undefined) {
    if (options.replaceRecentBlockhash === true && options.sigVerify === true) {
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

  const { computeUnitLimit, computeUnitPriceMicroLamports } = priorityFees;
  if (computeUnitLimit !== undefined && (!Number.isInteger(computeUnitLimit) || computeUnitLimit < 0 || computeUnitLimit > 1_400_000)) {
    throw new Error("computeUnitLimit must be an integer between 0 and 1400000");
  }
  if (computeUnitPriceMicroLamports !== undefined) {
    if ((typeof computeUnitPriceMicroLamports !== "bigint" && typeof computeUnitPriceMicroLamports !== "number") ||
        (typeof computeUnitPriceMicroLamports === "number" && !Number.isSafeInteger(computeUnitPriceMicroLamports)) ||
        BigInt(computeUnitPriceMicroLamports) < 0n || BigInt(computeUnitPriceMicroLamports) > 18446744073709551615n) {
      throw new Error("computeUnitPriceMicroLamports must be a nonnegative u64 bigint or safe integer");
    }
  }

  const instructions: Instruction[] = [];

  if (
    priorityFees.computeUnitLimit !== undefined &&
    priorityFees.computeUnitLimit > 0
  ) {
    instructions.push(
      getSetComputeUnitLimitInstruction({ units: priorityFees.computeUnitLimit })
    );
  }

  if (
    priorityFees.computeUnitPriceMicroLamports !== undefined &&
    BigInt(priorityFees.computeUnitPriceMicroLamports) > 0n
  ) {
    instructions.push(
      getSetComputeUnitPriceInstruction({ microLamports: BigInt(priorityFees.computeUnitPriceMicroLamports) })
    );
  }

  return instructions;
}
