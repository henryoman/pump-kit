/**
 * Integration tests for sell functionality.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { sellWithSlippage } from "../../src/recipes/sell";
import { createTestWallet, getTestRpc } from "../setup";
import type { TransactionSigner } from "@solana/kit";
import { address as getAddress } from "@solana/kit";
import {
  bondingCurvePda,
  globalPda,
  associatedBondingCurveAta,
  creatorVaultPda,
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

describe("Sell Operations", () => {
  let testWallet: TransactionSigner;
  let rpc: ReturnType<typeof getTestRpc>;
  const mintAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const feeRecipient = DEFAULT_FEE_RECIPIENT;

  beforeAll(async () => {
    rpc = getTestRpc();
    testWallet = await createTestWallet();
  });

  test("sellWithSlippage builds valid instruction", async () => {
    const instruction = await sellWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 250_000,
      estimatedSolOutSol: 0.25,
      slippageBps: 50,
      feeRecipient,
      bondingCurveCreator: testWallet.address,
      rpc,
    });

    expect(instruction).toBeDefined();
    expect(instruction.accounts).toBeDefined();
    expect(instruction.programAddress).toBeDefined();
  });

  test("sellWithSlippage uses default slippage when not specified", async () => {
    const instruction = await sellWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 250_000,
      estimatedSolOutSol: 0.25,
      feeRecipient,
      bondingCurveCreator: testWallet.address,
      rpc,
    });

    expect(instruction).toBeDefined();
  });

  test("sellWithSlippage wires expected accounts", async () => {
    const instruction = await sellWithSlippage({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: 250_000,
      estimatedSolOutSol: 0.25,
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
    const global = await globalPda();
    const creatorVault = await creatorVaultPda(testWallet.address);
    const eventAuthority = await eventAuthorityPda();
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
      creatorVault,
      getAddress(TOKEN_PROGRAM_ID),
      eventAuthority,
      getAddress(PUMP_PROGRAM_ID),
      feeConfig,
      getAddress(FEE_PROGRAM_ID),
    ];

    const accountAddresses = instruction.accounts.map((meta) => meta.address);
    expect(accountAddresses).toEqual(expectedAccounts.map(getAddress));
  });
});
