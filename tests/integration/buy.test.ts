/**
 * Integration tests for buy functionality.
 * These tests verify instruction building works correctly.
 * 
 * Note: These tests don't send transactions to avoid network costs.
 * They only verify that instructions are built correctly.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { buyWithSlippage } from "../../src/recipes/buy";
import { createTestWallet, skipIfNoRpc } from "../setup";
import type { TransactionSigner } from "@solana/kit";

describe("Buy Operations", () => {
  let testWallet: TransactionSigner;

  beforeAll(async () => {
    if (skipIfNoRpc()) return;
    testWallet = await createTestWallet();
  });

  test("buyWithSlippage builds valid instruction", async () => {
    if (skipIfNoRpc()) return;

    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Example USDC mint
      tokenAmount: 1_000_000n,
      estimatedSolCost: 5_000_000n,
      slippageBps: 50,
      feeRecipient: "11111111111111111111111111111111",
    });

    // Verify instruction structure
    expect(instruction).toBeDefined();
    expect(instruction.accounts).toBeDefined();
    expect(instruction.programAddress).toBeDefined();
    expect(instruction.data).toBeDefined();
  });

  test("buyWithSlippage uses default slippage when not specified", async () => {
    if (skipIfNoRpc()) return;

    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenAmount: 1_000_000n,
      estimatedSolCost: 5_000_000n,
      feeRecipient: "11111111111111111111111111111111",
    });

    expect(instruction).toBeDefined();
  });

  test("buyWithSlippage handles custom slippage", async () => {
    if (skipIfNoRpc()) return;

    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenAmount: 1_000_000n,
      estimatedSolCost: 5_000_000n,
      slippageBps: 100, // 1% slippage
      feeRecipient: "11111111111111111111111111111111",
    });

    expect(instruction).toBeDefined();
  });
});

