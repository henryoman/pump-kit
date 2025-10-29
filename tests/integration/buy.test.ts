/**
 * Integration tests for buy functionality.
 * These tests verify instruction building works correctly.
 * 
 * Note: These tests don't send transactions to avoid network costs.
 * They only verify that instructions are built correctly.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { buyWithSlippage } from "../../src/recipes/buy";
import { createTestWallet, getTestRpc } from "../setup";
import type { TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import {
  bondingCurvePda,
  globalPda,
  associatedBondingCurveAta,
  creatorVaultPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  feeConfigPda,
  eventAuthorityPda,
} from "../../src/pda/pump";
import { findAssociatedTokenPda } from "../../src/pda/ata";
import {
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  FEE_PROGRAM_ID,
} from "../../src/config/addresses";
import { DEFAULT_FEE_RECIPIENT } from "../../src/config/constants";

describe("Buy Operations", () => {
  let testWallet: TransactionSigner;
  let rpc: ReturnType<typeof getTestRpc>;
  const mintAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const feeRecipient = DEFAULT_FEE_RECIPIENT;

  beforeAll(async () => {
    rpc = getTestRpc();
    testWallet = await createTestWallet();
  });

  test("buyWithSlippage builds valid instruction", async () => {
    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 1_000_000n,
      estimatedSolCostSol: 0.5,
      slippageBps: 50,
      feeRecipient,
      bondingCurveCreator: testWallet.address,
      rpc,
    });

    // Verify instruction structure
    expect(instruction).toBeDefined();
    expect(instruction.accounts).toBeDefined();
    expect(instruction.programAddress).toBeDefined();
    expect(instruction.data).toBeDefined();
  });

  test("buyWithSlippage uses default slippage when not specified", async () => {
    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 1_000_000n,
      estimatedSolCostSol: 0.5,
      feeRecipient,
      bondingCurveCreator: testWallet.address,
      rpc,
    });

    expect(instruction).toBeDefined();
  });

  test("buyWithSlippage handles custom slippage", async () => {
    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 1_000_000n,
      estimatedSolCostSol: 0.5,
      slippageBps: 100, // 1% slippage
      feeRecipient,
      bondingCurveCreator: testWallet.address,
      rpc,
    });

    expect(instruction).toBeDefined();
  });

  test("buyWithSlippage wires expected accounts", async () => {
    const instruction = await buyWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 1_000_000n,
      estimatedSolCostSol: 0.5,
      bondingCurveCreator: testWallet.address,
      feeRecipient,
      rpc,
    });

    expect(instruction.programAddress).toBe(getAddress(PUMP_PROGRAM_ID));

    const bondingCurve = await bondingCurvePda(mintAddress);
    const associatedBondingCurve = await associatedBondingCurveAta(
      bondingCurve,
      mintAddress
    );
    const [associatedUser] = await findAssociatedTokenPda({
      owner: testWallet.address,
      mint: getAddress(mintAddress),
      tokenProgram: getAddress(TOKEN_PROGRAM_ID),
    });
    const creatorVault = await creatorVaultPda(testWallet.address);
    const global = await globalPda();
    const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
    const userVolumeAccumulator = await userVolumeAccumulatorPda(
      testWallet.address
    );
    const feeConfig = await feeConfigPda();

    const expectedAccounts = [
      global,
      feeRecipient,
      getAddress(mintAddress),
      bondingCurve,
      associatedBondingCurve,
      associatedUser,
      testWallet.address,
      getAddress(SYSTEM_PROGRAM_ID),
      getAddress(TOKEN_PROGRAM_ID),
      creatorVault,
      await eventAuthorityPda(),
      getAddress(PUMP_PROGRAM_ID),
      globalVolumeAccumulator,
      userVolumeAccumulator,
      feeConfig,
      getAddress(FEE_PROGRAM_ID),
    ];

    const accountAddresses = instruction.accounts.map((meta) => meta.address);
    expect(accountAddresses).toEqual(expectedAccounts.map(getAddress));
  });
});
