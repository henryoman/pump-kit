import { describe, test, expect, beforeAll } from "bun:test";
import { curveBuy, curveSell } from "../../src/swap";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  type BondingCurveState,
  type FeeStructure,
} from "../../src/ammsdk/bondingCurveMath";
import { addSlippage, subSlippage } from "../../src/utils/slippage";
import { solToLamports, tokensToRaw } from "../../src/utils/amounts";
import type { TransactionSigner } from "@solana/kit";
import { createTestWallet, getTestRpc } from "../setup";
import { DEFAULT_FEE_RECIPIENT } from "../../src/config/constants";
import { getBuyInstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buy";
import { getSellInstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/sell";
import { address as toAddress } from "@solana/kit";
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
import { findAssociatedTokenPda } from "../../src/pda/ata";
import {
  PUMP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  FEE_PROGRAM_ID,
} from "../../src/config/addresses";

describe("Curve swap helpers", () => {
  let testWallet: TransactionSigner;
  let rpc: ReturnType<typeof getTestRpc>;
  const mintAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  const mockCurve = (creator: string): BondingCurveState => ({
    virtualTokenReserves: 50_000_000_000n,
    virtualSolReserves: 5_000_000_000n,
    realTokenReserves: 25_000_000_000n,
    realSolReserves: 1_000_000_000n,
    creator: toAddress(creator),
    complete: false,
  });

  const mockFees: FeeStructure = {
    lpFeeBps: 50n,
    protocolFeeBps: 25n,
    creatorFeeBps: 25n,
  };

  beforeAll(async () => {
    rpc = getTestRpc();
    testWallet = await createTestWallet();
  });

  test("curveBuy derives token amount and max SOL cost from SOL budget", async () => {
    const slippageBps = 75;
    const solBudgetSol = 0.8;
    const solBudgetLamports = solToLamports(solBudgetSol);
    const curveState = mockCurve(testWallet.address);
    const quote = quoteBuyWithSolAmount(curveState, mockFees, solBudgetLamports);
    const expectedMaxCost = addSlippage(quote.totalSolCostLamports, slippageBps) * 2n;

    const instruction = await curveBuy({
      user: testWallet,
      mint: mintAddress,
      solAmount: solBudgetSol,
      slippageBps,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      bondingCurveCreator: testWallet.address,
      curveStateOverride: curveState,
      feeStructureOverride: mockFees,
      rpc,
    });

    const decoded = getBuyInstructionDataDecoder().decode(instruction.data);
    expect(decoded.amount).toBe(quote.tokenAmount);
    expect(decoded.maxSolCost).toBe(expectedMaxCost);
  });

  test("curveBuy wires expected accounts", async () => {
    const curveState = mockCurve(testWallet.address);
    const instruction = await curveBuy({
      user: testWallet,
      mint: mintAddress,
      solAmount: 0.4,
      bondingCurveCreator: testWallet.address,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      curveStateOverride: curveState,
      feeStructureOverride: mockFees,
      rpc,
    });

    const bondingCurve = await bondingCurvePda(mintAddress);
    const associatedBondingCurve = await associatedBondingCurveAta(bondingCurve, mintAddress);
    const [associatedUser] = await findAssociatedTokenPda({
      owner: testWallet.address,
      mint: toAddress(mintAddress),
      tokenProgram: toAddress(TOKEN_PROGRAM_ID),
    });
    const creatorVault = await creatorVaultPda(testWallet.address);
    const global = await globalPda();
    const globalVolumeAccumulator = await globalVolumeAccumulatorPda();
    const userVolumeAccumulator = await userVolumeAccumulatorPda(testWallet.address);
    const feeConfig = await feeConfigPda();

    const expectedAccounts = [
      global,
      DEFAULT_FEE_RECIPIENT,
      toAddress(mintAddress),
      bondingCurve,
      associatedBondingCurve,
      associatedUser,
      testWallet.address,
      toAddress(SYSTEM_PROGRAM_ID),
      toAddress(TOKEN_PROGRAM_ID),
      creatorVault,
      await eventAuthorityPda(),
      toAddress(PUMP_PROGRAM_ID),
      globalVolumeAccumulator,
      userVolumeAccumulator,
      feeConfig,
      toAddress(FEE_PROGRAM_ID),
    ];

    const accountAddresses = instruction.accounts.map((meta) => meta.address);
    expect(accountAddresses).toEqual(expectedAccounts.map(toAddress));
  });

  test("curveSell derives min SOL output from slippage guard for fixed token amount", async () => {
    const tokenAmountHuman = 0.75;
    const decimals = 6;
    const tokenAmountRaw = tokensToRaw(tokenAmountHuman, decimals);
    const slippageBps = 100;
    const curveState = mockCurve(testWallet.address);
    const quote = quoteSellForTokenAmount(curveState, mockFees, tokenAmountRaw);
    const expectedMinOut = subSlippage(quote.solOutputLamports, slippageBps);

    const instruction = await curveSell({
      user: testWallet,
      mint: mintAddress,
      tokenAmount: tokenAmountHuman,
      tokenDecimals: decimals,
      slippageBps,
      feeRecipient: DEFAULT_FEE_RECIPIENT,
      bondingCurveCreator: testWallet.address,
      curveStateOverride: curveState,
      feeStructureOverride: mockFees,
      rpc,
    });

    const decoded = getSellInstructionDataDecoder().decode(instruction.data);
    expect(decoded.minSolOutput).toBe(expectedMinOut);
    expect(decoded.amount).toBe(tokenAmountRaw);
  });
});

