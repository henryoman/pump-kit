/**
 * Unit tests for transaction utilities.
 */

import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/signers";
import { address } from "@solana/addresses";
import {
  buildTransaction,
  sendAndConfirmTransaction,
  TransactionExecutionError,
  simulateTransaction,
  buildPriorityFeeInstructions,
} from "../../src/utils/transaction";
import type { Commitment } from "@solana/rpc-types";

const TEST_BLOCKHASH = "1".repeat(44);

function createMockRpc() {
  return {
    getLatestBlockhash: (_config?: { commitment?: Commitment }) => ({
      send: async () => ({
        value: {
          blockhash: TEST_BLOCKHASH,
          lastValidBlockHeight: 123,
        },
      }),
    }),
    simulateTransaction: () => ({
      send: async () => ({
        context: { slot: 1 },
        value: { err: null, logs: [], unitsConsumed: 10 },
      }),
    }),
  };
}

describe("transaction utilities", () => {
  test("rejects invalid priority fees before constructing instructions", () => {
    for (const computeUnitLimit of [-1, 1.5, NaN, Infinity, 1400001]) {
      expect(() => buildPriorityFeeInstructions({ computeUnitLimit })).toThrow("computeUnitLimit");
    }
    for (const computeUnitPriceMicroLamports of [-1, -1n, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 18446744073709551616n, "100"]) {
      expect(() => buildPriorityFeeInstructions({ computeUnitPriceMicroLamports } as any)).toThrow("computeUnitPriceMicroLamports");
    }
    expect(buildPriorityFeeInstructions({ computeUnitLimit: 0, computeUnitPriceMicroLamports: 0n })).toEqual([]);
    expect(buildPriorityFeeInstructions({ computeUnitLimit: 1400000, computeUnitPriceMicroLamports: 18446744073709551615n })).toHaveLength(2);
  });
  test("buildTransaction attaches fee payer signer and lifetime", async () => {
    const signer = await generateKeyPairSigner();
    const mockRpc = createMockRpc();

    const built = await buildTransaction({
      instructions: [],
      payer: signer,
      rpc: mockRpc as any,
    });

    expect(built.transactionMessage.feePayer).toBe(signer);
    expect(built.transactionMessage.lifetimeConstraint.blockhash).toBe(TEST_BLOCKHASH);
    expect(built.lastValidBlockHeight).toBe(BigInt(123));
  });

  test("simulateTransaction encodes and forwards transaction", async () => {
    const signer = await generateKeyPairSigner();
    const mockRpc = createMockRpc();

    let capturedEncoding: string | null = null;
    let capturedConfig: any;
    const rpcWithCapture = {
      ...mockRpc,
      simulateTransaction: (encoded: string, _config: unknown) => {
        capturedEncoding = encoded;
        capturedConfig = _config;
        return mockRpc.simulateTransaction();
      },
    };

    const response = await simulateTransaction({
      instructions: [],
      payer: signer,
      rpc: rpcWithCapture as any,
      commitment: "processed",
    });

    expect(typeof capturedEncoding).toBe("string");
    expect(capturedConfig.encoding).toBe("base64");
    expect(response.value.err).toBeNull();
    expect(response.value.logs).toEqual([]);
  });

  test("buildTransaction respects prepend and append instructions", async () => {
    const signer = await generateKeyPairSigner();
    const mockRpc = createMockRpc();

    const prepend = {
      programAddress: address("ComputeBudget111111111111111111111111111111"),
      accounts: [],
      data: new Uint8Array([1, 2, 3]),
    };

    const core = {
      programAddress: address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
      accounts: [],
      data: new Uint8Array([4]),
    };

    const append = {
      programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      accounts: [],
      data: new TextEncoder().encode("memo"),
    };

    const built = await buildTransaction({
      instructions: [core],
      prependInstructions: [prepend],
      appendInstructions: [append],
      payer: signer,
      rpc: mockRpc as any,
    });

    const programAddresses = built.transactionMessage.instructions.map(
      (ix: any) => ix.programAddress
    );

    expect(programAddresses).toEqual([
      prepend.programAddress,
      core.programAddress,
      append.programAddress,
    ]);
  });

  test("buildTransaction injects priority fee instructions", async () => {
    const signer = await generateKeyPairSigner();
    const mockRpc = createMockRpc();

    const built = await buildTransaction({
      instructions: [
        {
          programAddress: address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
          accounts: [],
          data: new Uint8Array([0]),
        },
      ],
      payer: signer,
      rpc: mockRpc as any,
      priorityFees: {
        computeUnitLimit: 300_000,
        computeUnitPriceMicroLamports: 5_000n,
      },
    });

    const [limitIx, priceIx] = built.transactionMessage.instructions;
    expect(limitIx.programAddress).toBe(
      address("ComputeBudget111111111111111111111111111111")
    );
    expect(priceIx.programAddress).toBe(
      address("ComputeBudget111111111111111111111111111111")
    );
    expect(Array.from(limitIx.data!)).toEqual([2, 224, 147, 4, 0]);
    expect(Array.from(priceIx.data!)).toEqual([3, 136, 19, 0, 0, 0, 0, 0, 0]);
  });
  test("uses a complete supplied lifetime without fetching a different expiration", async () => {
    const signer = await generateKeyPairSigner();
    const built = await buildTransaction({ instructions: [], payer: signer,
      lifetime: { blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 999n },
      rpc: { getLatestBlockhash: () => { throw new Error("Unexpected RPC"); } } as any });
    expect(built.lastValidBlockHeight).toBe(999n);
    expect(built.latestBlockhash).toBe(TEST_BLOCKHASH);
    await expect(buildTransaction({ instructions: [], payer: signer,
      lifetime: { blockhash: TEST_BLOCKHASH } as any, rpc: createMockRpc() as any }))
      .rejects.toThrow("Transaction lifetime requires");
  });

  test("signature verification permits disabled blockhash replacement", async () => {
    const signer = await generateKeyPairSigner();
    const rpc = createMockRpc();
    await expect(simulateTransaction({ instructions: [], payer: signer, rpc: rpc as any,
      options: { sigVerify: true, replaceRecentBlockhash: false } })).resolves.toBeDefined();
    await expect(simulateTransaction({ instructions: [], payer: signer, rpc: rpc as any,
      options: { sigVerify: true, replaceRecentBlockhash: true } })).rejects.toThrow("replaceRecentBlockhash");
  });

  test("preserves confirmed failure logs when submission throws", async () => {
    const signer = await generateKeyPairSigner();
    const rpc = { ...createMockRpc(),
      sendTransaction: () => ({ send: async () => { throw new Error("preflight failed"); } }),
      getSignatureStatuses: () => ({ send: async () => ({ value: [{ err: { InstructionError: [0, "Custom"] } }] }) }),
      getTransaction: () => ({ send: async () => ({ meta: { logMessages: ["Program log: spending limit exceeded"] } }) }),
    };
    try {
      await sendAndConfirmTransaction({ instructions: [], payer: signer, rpc: rpc as any, rpcSubscriptions: {} as any });
      throw new Error("Expected transaction failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionExecutionError);
      const failure = error as TransactionExecutionError;
      expect(failure.outcome).toBe("failed");
      expect(failure.message).toContain("Program log: spending limit exceeded");
      expect(failure.signature).toBeTruthy();
    }
  });

  test("reports unknown submission outcomes with the original transaction identity", async () => {
    const signer = await generateKeyPairSigner();
    let savedSignature: string | undefined;
    const rpc = { ...createMockRpc(),
      sendTransaction: () => ({ send: async () => { throw new Error("transport timeout"); } }),
      getSignatureStatuses: () => ({ send: async () => ({ value: [null] }) }),
    };
    try {
      await sendAndConfirmTransaction({ instructions: [], payer: signer, rpc: rpc as any, rpcSubscriptions: {} as any,
        onSigned: async record => { savedSignature = record.signature; } });
      throw new Error("Expected unknown outcome");
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionExecutionError);
      const failure = error as TransactionExecutionError;
      expect(failure.outcome).toBe("unknown");
      expect(failure.signature).toBe(savedSignature!);
      expect(failure.lifetime.lastValidBlockHeight).toBe(123n);
    }
  });

});
