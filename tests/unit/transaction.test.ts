/**
 * Unit tests for transaction utilities.
 */

import { describe, expect, test } from "bun:test";
import { generateKeyPairSigner } from "@solana/signers";
import { address } from "@solana/addresses";
import {
  buildTransaction,
  simulateTransaction,
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
    const rpcWithCapture = {
      ...mockRpc,
      simulateTransaction: (encoded: string, _config: unknown) => {
        capturedEncoding = encoded;
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
  });
});
