/**
 * Integration tests for sell functionality.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { sellWithSlippage } from "../../src/recipes/sell";
import { createTestWallet, skipIfNoRpc } from "../setup";
import type { TransactionSigner } from "@solana/kit";

describe("Sell Operations", () => {
  let testWallet: TransactionSigner;

  beforeAll(async () => {
    if (skipIfNoRpc()) return;
    testWallet = await createTestWallet();
  });

  test("sellWithSlippage builds valid instruction", async () => {
    if (skipIfNoRpc()) return;

    const instruction = await sellWithSlippage({
      user: testWallet,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenAmount: 250_000n,
      estimatedSolOut: 1_000_000n,
      slippageBps: 50,
      feeRecipient: "11111111111111111111111111111111",
    });

    expect(instruction).toBeDefined();
    expect(instruction.accounts).toBeDefined();
    expect(instruction.programAddress).toBeDefined();
  });

  test("sellWithSlippage uses default slippage when not specified", async () => {
    if (skipIfNoRpc()) return;

    const instruction = await sellWithSlippage({
      user: testWallet,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenAmount: 250_000n,
      estimatedSolOut: 1_000_000n,
      feeRecipient: "11111111111111111111111111111111",
    });

    expect(instruction).toBeDefined();
  });
});

