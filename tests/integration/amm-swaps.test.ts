import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from "bun:test";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { addSlippage, subSlippage } from "../../src/utils/slippage";
import { solToLamports, tokensToRaw } from "../../src/utils/amounts";
import { createTestWallet } from "../setup";

const MOCK_BASE_MINT = "So11111111111111111111111111111111111111112";
const MOCK_QUOTE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MOCK_POOL_ADDRESS = "5Y1xKwh28ykVfoCENKz7dxyzKDn5XxhxL7sRKqzZo4PM";
const MOCK_POOL_CREATOR = "7Q2Yj8LZRxurx8WcN6iYGkc4Y5E9sDcV1Yx1CEV4nKqe";
const MOCK_GLOBAL_CONFIG_ADDRESS = "3SghDUFxuDrPq3NbS1RyCBj3Tz7kRXKuX3sX5Yucs5cj";
const BASE_ATA = "9jqMADYjX4jG3Ejj6LikUeJ8V4aHcRUW2YCiMzFxLrR2";
const QUOTE_ATA = "9i6PjaVXrDm6uSPRqCMgfHTCqkfNNpJBWQAbQHV2feRv";

const TOTAL_FEE_BPS = 150n; // 1.5% combined LP + protocol fee
const BPS_DENOMINATOR = 10_000n;

const baseReserve = 1_000_000_000n;
const quoteReserve = 50_000_000_000n;

const ammBuyCalls: any[] = [];
const ammSellCalls: any[] = [];

const buildAmmBuyMock = mock(
  async (args: any): Promise<Instruction> => {
    ammBuyCalls.push(args);
    return {
      programAddress: "AmmProgram1111111111111111111111111111111",
      accounts: [],
      data: new Uint8Array([0xde, 0xad]),
    };
  }
);

const buildAmmSellMock = mock(
  async (args: any): Promise<Instruction> => {
    ammSellCalls.push(args);
    return {
      programAddress: "AmmProgram1111111111111111111111111111111",
      accounts: [],
      data: new Uint8Array([0xbe, 0xef]),
    };
  }
);

mock.module("../../src/clients/amm", () => ({
  ammBuy: buildAmmBuyMock,
  ammSell: buildAmmSellMock,
}));

mock.module("../../src/pumpsdk/generated/accounts/bondingCurve", () => ({
  fetchBondingCurve: async () => ({
    data: {
      creator: MOCK_POOL_CREATOR,
    },
  }),
}));

mock.module("../../src/ammsdk/generated/accounts/pool", () => ({
  fetchPool: async () => ({
    data: {
      index: 0,
      creator: MOCK_POOL_CREATOR,
      baseMint: MOCK_BASE_MINT,
      quoteMint: MOCK_QUOTE_MINT,
      lpMint: "LpMint11111111111111111111111111111111111",
      poolBaseTokenAccount: BASE_ATA,
      poolQuoteTokenAccount: QUOTE_ATA,
      lpSupply: 1_000_000n,
    },
  }),
}));

mock.module("../../src/ammsdk/generated/accounts/globalConfig", () => ({
  fetchGlobalConfig: async () => ({
    data: {
      lpFeeBasisPoints: 75n,
      protocolFeeBasisPoints: 75n,
    },
  }),
}));

mock.module("../../src/pda/pumpAmm", () => ({
  poolPda: async () => MOCK_POOL_ADDRESS,
  poolTokenAta: async (_pool: string, tokenMint: string) => {
    return tokenMint === MOCK_BASE_MINT ? BASE_ATA : QUOTE_ATA;
  },
  globalConfigPda: async () => MOCK_GLOBAL_CONFIG_ADDRESS,
}));

mock.module("../../src/utils/ata", () => ({
  buildCreateAtaInstruction: () => ({
    programAddress: "AtaProgram1111111111111111111111111111111",
    accounts: [],
    data: new Uint8Array(),
  }),
}));

const { ammBuy, ammSell } = await import("../../src/swap");

type RpcStub = ReturnType<typeof createRpcStub>;

function createRpcStub() {
  const balances = new Map<string, { value: { amount: string } }>();
  const accountInfos = new Map<string, { value: unknown }>();

  return {
    setBalance(address: string, amount: bigint) {
      balances.set(address, { value: { amount: amount.toString() } });
    },
    setAccount(address: string, value: unknown) {
      accountInfos.set(address, { value });
    },
    getTokenAccountBalance(address: string) {
      return {
        send: async () => {
          const balance = balances.get(address);
          if (!balance) {
            throw new Error(`Missing token balance for ${address}`);
          }
          return balance;
        },
      };
    },
    getAccountInfo(address: string) {
      return {
        send: async () => accountInfos.get(address) ?? { value: null },
      };
    },
    getProgramAccounts() {
      return {
        send: async () => [],
      };
    },
  };
}

function applyInputFees(amount: bigint, totalFeeBps: bigint): bigint {
  const denominator = BPS_DENOMINATOR - totalFeeBps;
  return (amount * denominator) / BPS_DENOMINATOR;
}

function computeTokensOut(netQuoteIn: bigint, baseRes: bigint, quoteRes: bigint): bigint {
  return (netQuoteIn * baseRes) / (quoteRes + netQuoteIn);
}

function computeQuoteForTokens(
  tokensOut: bigint,
  quoteRes: bigint,
  baseRes: bigint,
  totalFeeBps: bigint
): bigint {
  const netQuoteIn = (tokensOut * quoteRes) / (baseRes - tokensOut);
  const denominator = BPS_DENOMINATOR - totalFeeBps;
  return (netQuoteIn * BPS_DENOMINATOR + (denominator - 1n)) / denominator;
}

function computeQuoteOut(netBaseIn: bigint, baseRes: bigint, quoteRes: bigint): bigint {
  return (netBaseIn * quoteRes) / (baseRes + netBaseIn);
}

describe("AMM swap helpers", () => {
  let wallet: TransactionSigner;
  let rpc: RpcStub;

  beforeAll(async () => {
    wallet = await createTestWallet();
  });

  beforeEach(() => {
    ammBuyCalls.length = 0;
    ammSellCalls.length = 0;
    buildAmmBuyMock.mockClear();
    buildAmmSellMock.mockClear();
    rpc = createRpcStub();
    rpc.setBalance(BASE_ATA, baseReserve);
    rpc.setBalance(QUOTE_ATA, quoteReserve);
  });

  afterEach(() => {
    ammBuyCalls.length = 0;
    ammSellCalls.length = 0;
  });

  test("ammBuy computes token output and max SOL input with slippage", async () => {
    const solAmount = 0.5;
    const slippageBps = 125;
    const solBudgetLamports = solToLamports(solAmount);
    const totalFees = TOTAL_FEE_BPS;

    const netQuoteIn = applyInputFees(solBudgetLamports, totalFees);
    let expectedTokens = computeTokensOut(netQuoteIn, baseReserve, quoteReserve);
    if (expectedTokens >= baseReserve) {
      expectedTokens = baseReserve - 1n;
    }

    let quoteRequired = computeQuoteForTokens(expectedTokens, quoteReserve, baseReserve, totalFees);
    while (quoteRequired > solBudgetLamports && expectedTokens > 0n) {
      expectedTokens -= 1n;
      quoteRequired = computeQuoteForTokens(expectedTokens, quoteReserve, baseReserve, totalFees);
    }
    const expectedMaxQuoteIn = addSlippage(quoteRequired, slippageBps);

    const instruction = await ammBuy({
      user: wallet,
      mint: MOCK_BASE_MINT,
      solAmount,
      slippageBps,
      rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS,
      poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT,
    });

    expect(instruction.programAddress).toBe("AmmProgram1111111111111111111111111111111");
    expect(instruction.prepend?.length).toBe(1);
    expect(buildAmmBuyMock).toHaveBeenCalledTimes(1);
    const params = ammBuyCalls[0];
    expect(params.tokenAmountOut).toBe(expectedTokens);
    expect(params.maxQuoteIn).toBe(expectedMaxQuoteIn);
  });

  test("ammSell computes min SOL output from token amount and slippage", async () => {
    const tokenAmount = 15;
    const decimals = 6;
    const tokenAmountRaw = tokensToRaw(tokenAmount, decimals);
    const slippageBps = 175;
    const netBaseIn = applyInputFees(tokenAmountRaw, TOTAL_FEE_BPS);
    const quoteOut = computeQuoteOut(netBaseIn, baseReserve, quoteReserve);
    const expectedMinQuoteOut = subSlippage(quoteOut, slippageBps);

    const instruction = await ammSell({
      user: wallet,
      mint: MOCK_BASE_MINT,
      tokenAmount,
      tokenDecimals: decimals,
      slippageBps,
      rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS,
      poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT,
    });

    expect(instruction.programAddress).toBe("AmmProgram1111111111111111111111111111111");
    expect(buildAmmSellMock).toHaveBeenCalledTimes(1);
    const params = ammSellCalls[0];
    expect(params.tokenAmountIn).toBe(tokenAmountRaw);
    expect(params.minQuoteOut).toBe(expectedMinQuoteOut);
  });
});

