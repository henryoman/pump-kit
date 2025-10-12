import { describe, test, expect, beforeAll } from "bun:test";
import { buy, sell } from "../../src/swap";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  type BondingCurveState,
  type FeeStructure,
} from "../../src/ammsdk/bondingCurveMath";
import { addSlippage, subSlippage } from "../../src/utils/slippage";
import { solToLamports, tokensToRaw } from "../../src/utils/amounts";
import type { TransactionSigner } from "@solana/kit";
import { createTestWallet } from "../setup";
import { DEFAULT_FEE_RECIPIENT } from "../../src/config/constants";
import { getBuyInstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buy";
import { getSellInstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/sell";
import { address as getAddress } from "@solana/kit";
import {
  bondingCurvePda,
  associatedBondingCurveAta,
  globalPda,
  creatorVaultPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  feeConfigPda,
  eventAuthorityPda,
} from "../../src/pda/pump";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  FEE_PROGRAM_ID,
} from "../../src/config/addresses";

describe("Swap helpers", () => {
  let testWallet: TransactionSigner;
  const mintAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  const mockCurve = (creator: string): BondingCurveState => ({
    virtualTokenReserves: 50_000_000_000n,
    virtualSolReserves: 5_000_000_000n,
    realTokenReserves: 25_000_000_000n,
    realSolReserves: 1_000_000_000n,
    creator: getAddress(creator),
  });

  const mockFees: FeeStructure = {
    lpFeeBps: 50n,
    protocolFeeBps: 25n,
    creatorFeeBps: 25n,
  };

  beforeAll(async () => {
    testWallet = await createTestWallet();
  });

  test("buy() derives token amount from SOL budget", async () => {
    const slippageBps = 75;
    const solBudgetSol = 0.8;
    const solBudgetLamports = solToLamports(solBudgetSol);
    const curveState = mockCurve(testWallet.address);
    const quote = quoteBuyWithSolAmount(curveState, mockFees, solBudgetLamports);
    const expectedMaxCost = addSlippage(quote.totalSolCostLamports, slippageBps);

    const instruction = await buy({
      user: testWallet,
      mint: mintAddress,
      solAmount: solBudgetSol,
      slippageBps,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      bondingCurveCreator: testWallet.address,
      curveStateOverride: curveState,
      feeStructureOverride: mockFees,
    });

    const decoded = getBuyInstructionDataDecoder().decode(instruction.data);
    expect(decoded.amount).toBe(quote.tokenAmount);
    expect(decoded.maxSolCost).toBe(expectedMaxCost);
  });

  test("buy() wires expected accounts", async () => {
    const instruction = await buy({
      user: testWallet,
      mint: mintAddress,
      solAmount: 0.4,
      bondingCurveCreator: testWallet.address,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      curveStateOverride: mockCurve(testWallet.address),
      feeStructureOverride: mockFees,
    });

    const bondingCurve = await bondingCurvePda(mintAddress);
    const associatedBondingCurve = await associatedBondingCurveAta(bondingCurve, mintAddress);
    const [associatedUser] = await findAssociatedTokenPda({
      owner: testWallet.address,
      mint: getAddress(mintAddress),
      tokenProgram: getAddress(TOKEN_PROGRAM_ID),
    });
    const creatorVault = await creatorVaultPda(testWallet.address);
    const global = await globalPda();
    const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
    const userVolumeAccumulator = await userVolumeAccumulatorPda(testWallet.address);
    const feeConfig = await feeConfigPda();

    const expectedAccounts = [
      global,
      DEFAULT_FEE_RECIPIENT,
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

  test("sell() derives min SOL output from slippage guard (fixed amount)", async () => {
    const tokenAmountHuman = 0.75;
    const decimals = 6;
    const tokenAmountRaw = tokensToRaw(tokenAmountHuman, decimals);
    const slippageBps = 100;
    const curveState = mockCurve(testWallet.address);
    const quote = quoteSellForTokenAmount(curveState, mockFees, tokenAmountRaw);
    const expectedMinOut = subSlippage(quote.solOutputLamports, slippageBps);

    const instruction = await sell({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: tokenAmountHuman,
      tokenDecimals: decimals,
      slippageBps,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      bondingCurveCreator: testWallet.address,
      curveStateOverride: curveState,
      feeStructureOverride: mockFees,
    });

    const decoded = getSellInstructionDataDecoder().decode(instruction.data);
    expect(decoded.minSolOutput).toBe(expectedMinOut);
    expect(decoded.amount).toBe(tokenAmountRaw);
  });

  // TODO: add percentage-based sell tests once swap helpers expose balance injection hooks.
});
