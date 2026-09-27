import * as actualSnapshot from "../../src/swap/snapshot";
import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from "bun:test";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "../../src/pda/ata";
import type { Instruction, TransactionSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../../src/config/addresses";
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

const TOTAL_FEE_BPS = 175n; // 1.5% combined LP + protocol fee
const BPS_DENOMINATOR = 10_000n;

const baseReserve = 1_000_000_000n;
const quoteReserve = 50_000_000_000n;
let virtualQuoteReserves = 0n;

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

mock.module("../../src/swap/snapshot", () => ({
  ...actualSnapshot,
  loadAmmSnapshot: async ({ context }: any) => ({
    contextSlot: 100n, poolAddress: context.poolAddress, poolCreator: MOCK_POOL_CREATOR,
    poolData: (await readPool()).data,
    globalConfigData: { lpFeeBasisPoints: 75n, protocolFeeBasisPoints: 75n },
    baseMint: { mint: MOCK_BASE_MINT, tokenProgram: TOKEN_2022_PROGRAM_ID, decimals: 6 },
    quoteMint: { mint: MOCK_QUOTE_MINT, tokenProgram: TOKEN_PROGRAM_ID, decimals: 9 },
    baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
    baseReserve, realQuoteReserve: quoteReserve, quoteReserve: quoteReserve + virtualQuoteReserves,
    fees: { lpFeeBps: 75n, protocolFeeBps: 75n, creatorFeeBps: 25n },
  }),
}));

mock.module("../../src/clients/amm", () => ({
  ammBuy: buildAmmBuyMock,
  ammSell: buildAmmSellMock,
}));

let poolResolutionReads = 0;
let poolReady = true;
let poolReadError: Error | undefined;
const readPool = async () => {
  if (poolReadError) throw poolReadError;
  return { exists: poolReady, programAddress: PUMP_AMM_PROGRAM_ID,
    data: {
      index: 0,
      creator: MOCK_POOL_CREATOR,
      baseMint: MOCK_BASE_MINT,
      quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
      lpMint: "LpMint11111111111111111111111111111111111",
      poolBaseTokenAccount: BASE_ATA,
      poolQuoteTokenAccount: QUOTE_ATA,
      lpSupply: 1_000_000n,
      coinCreator: MOCK_POOL_CREATOR,
      virtualQuoteReserves,
    },
  };
};
mock.module("../../src/ammsdk/generated/accounts/pool", () => ({
  fetchPool: async () => { poolResolutionReads++; return readPool(); }, fetchMaybePool: readPool,
}));

mock.module("../../src/ammsdk/generated/accounts/globalConfig", () => ({
  fetchGlobalConfig: async () => ({
    data: {
      lpFeeBasisPoints: 75n,
      protocolFeeBasisPoints: 75n,
    },
  }),
}));

mock.module("../../src/ammsdk/generated/accounts/feeConfig", () => ({
  fetchFeeConfig: async () => ({ data: {
    flatFees: { lpFeeBps: 75n, protocolFeeBps: 75n, creatorFeeBps: 25n },
    feeTiers: [], stableFeeTiers: [], exoticFlatFees: { lpFeeBps: 0n, protocolFeeBps: 0n, creatorFeeBps: 0n },
  } }),
}));

mock.module("../../src/pda/pumpAmm", () => ({
  poolPda: async () => MOCK_POOL_ADDRESS,
  poolTokenAta: async (_pool: string, tokenMint: string) => {
    return tokenMint === MOCK_BASE_MINT ? BASE_ATA : QUOTE_ATA;
  },
  globalConfigPda: async () => MOCK_GLOBAL_CONFIG_ADDRESS,
  ammFeeConfigPda: async () => MOCK_GLOBAL_CONFIG_ADDRESS,
}));

const { ammBuy, ammSell, buy, sell, resolveSwapVenue, resolveAmmTradingContext } = await import("../../src/swap");

type RpcStub = ReturnType<typeof createRpcStub>;

function createRpcStub() {
  const balances = new Map<string, { value: { amount: string } }>();
  const accountInfos = new Map<string, { value: unknown }>();

  return {
    getSlot: () => ({ send: async () => 100n }),
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
  const denominator = BPS_DENOMINATOR + totalFeeBps;
  return (amount * BPS_DENOMINATOR) / denominator;
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
  const netQuoteIn = (tokensOut * quoteRes + baseRes - tokensOut - 1n) / (baseRes - tokensOut);
  void totalFeeBps;
  return netQuoteIn + (netQuoteIn * 75n + 9999n) / 10000n * 2n + (netQuoteIn * 25n + 9999n) / 10000n;
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
    virtualQuoteReserves = 0n;
    poolReady = true;
    poolReadError = undefined;
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

    let netQuoteIn = applyInputFees(solBudgetLamports, totalFees);
    const feeTotal = (netQuoteIn * 75n + 9999n) / 10000n * 2n + (netQuoteIn * 25n + 9999n) / 10000n;
    if (netQuoteIn + feeTotal > solBudgetLamports) netQuoteIn -= netQuoteIn + feeTotal - solBudgetLamports;
    netQuoteIn -= 1n;
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

    const plan = await ammBuy({
      user: wallet,
      mint: MOCK_BASE_MINT,
      solAmount,
      kind: "exactOut",
      slippageBps,
      rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS,
      poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
    });

    const instruction = plan.instructions.find(ix => ix.programAddress === "AmmProgram1111111111111111111111111111111")!;
    expect(instruction.programAddress).toBe("AmmProgram1111111111111111111111111111111");
    expect(plan.instructions).toHaveLength(2);
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
    const grossQuote = computeQuoteOut(tokenAmountRaw, baseReserve, quoteReserve);
    const quoteOut = grossQuote - (grossQuote * 75n + 9999n) / 10000n * 2n - (grossQuote * 25n + 9999n) / 10000n;
    const expectedMinQuoteOut = subSlippage(quoteOut, slippageBps);

    const plan = await ammSell({
      user: wallet,
      mint: MOCK_BASE_MINT,
      tokenAmount,
      tokenDecimals: decimals,
      slippageBps,
      rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS,
      poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
    });

    const instruction = plan.instructions.find(ix => ix.programAddress === "AmmProgram1111111111111111111111111111111")!;
    expect(instruction.programAddress).toBe("AmmProgram1111111111111111111111111111111");
    expect(buildAmmSellMock).toHaveBeenCalledTimes(1);
    const params = ammSellCalls[0];
    expect(params.tokenAmountIn).toBe(tokenAmountRaw);
    expect(params.minQuoteOut).toBe(expectedMinQuoteOut);
  });
  test("AMM quotes include nonzero virtual quote reserves", async () => {
    virtualQuoteReserves = quoteReserve;
    const params = {
      user: wallet, mint: MOCK_BASE_MINT, rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS, poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID, slippageBps: 0,
    };
    await ammBuy({ ...params, solAmount: 1 });
    const withVirtual = ammBuyCalls[0].tokenAmountOut;
    virtualQuoteReserves = 0n;
    await ammBuy({ ...params, solAmount: 1 });
    expect(withVirtual).toBeLessThan(ammBuyCalls[1].tokenAmountOut);
    virtualQuoteReserves = quoteReserve;
    await ammSell({ ...params, tokenAmount: 1 });
    const sellWithVirtual = ammSellCalls[0].minQuoteOut;
    virtualQuoteReserves = 0n;
    await ammSell({ ...params, tokenAmount: 1 });
    expect(sellWithVirtual).toBeGreaterThan(ammSellCalls[1].minQuoteOut);
  });

  test("public buy and sell route completed curves to the AMM", async () => {
    const params = {
      user: wallet, mint: MOCK_BASE_MINT, rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS, poolCreator: MOCK_POOL_CREATOR,
      quoteMint: MOCK_QUOTE_MINT, baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
      curveStateOverride: { virtualTokenReserves: 1n, virtualQuoteReserves: 1n,
        realTokenReserves: 0n, realQuoteReserves: 0n, creator: wallet.address, complete: true },
    };
    await buy({ ...params, solAmount: "0.1" });
    await sell({ ...params, tokenAmount: "1" });
    expect(ammBuyCalls).toHaveLength(1);
    expect(ammSellCalls).toHaveLength(1);
    expect(ammBuyCalls[0].exactQuoteIn.amountIn).toBe(100000000n);
    expect(ammBuyCalls[0].exactQuoteIn.minAmountOut).toBeGreaterThan(0n);
    expect(ammBuyCalls[0].maxQuoteIn).toBe(100000000n);
    expect(ammBuyCalls[0].baseTokenProgram).toBe(TOKEN_2022_PROGRAM_ID);
    expect(ammSellCalls[0].quoteTokenProgram).toBe(TOKEN_PROGRAM_ID);
  });

  test("AMM percentage sells reject amounts below one raw unit", async () => {
    const [ata] = await findAssociatedTokenPda({ owner: wallet.address,
      mint: address(MOCK_BASE_MINT), tokenProgram: address(TOKEN_2022_PROGRAM_ID) });
    rpc.setBalance(ata, 1n);
    await expect(ammSell({ user: wallet, mint: MOCK_BASE_MINT, rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS, quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
      useWalletPercentage: true, walletPercentage: 1 })).rejects.toThrow("Percentage sell rounds to zero token units");
    expect(buildAmmSellMock).not.toHaveBeenCalled();
  });

  test("routing distinguishes completion from migration and preserves RPC errors", async () => {
    const params = { user: wallet, mint: MOCK_BASE_MINT, rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS, quoteMint: MOCK_QUOTE_MINT,
      curveStateOverride: { virtualTokenReserves: 1n, virtualQuoteReserves: 1n,
        realTokenReserves: 0n, realQuoteReserves: 0n, creator: wallet.address, complete: true } };
    poolReady = false;
    expect((await resolveSwapVenue(params)).status).toBe("migrationPending");
    await expect(buy({ ...params, amountIn: 1000000n })).rejects.toThrow("not ready");
    expect(buildAmmBuyMock).not.toHaveBeenCalled();
    poolReadError = new Error("RPC transport unavailable");
    await expect(resolveSwapVenue(params)).rejects.toThrow("RPC transport unavailable");
    expect((await resolveSwapVenue({ ...params, curveStateOverride: { ...params.curveStateOverride, complete: false } })).status).toBe("curve");
    poolReadError = undefined;
    poolReady = true;
    expect((await resolveSwapVenue(params)).status).toBe("amm");
  });

  test("AMM plans preserve exact-output targets and explicit input/output limits", async () => {
    const params = { user: wallet, mint: MOCK_BASE_MINT, rpc: rpc as any,
      poolAddress: MOCK_POOL_ADDRESS, quoteMint: MOCK_QUOTE_MINT,
      baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID };
    const plan = await ammBuy({ ...params, kind: "exactOut", amountOut: 100n, maxAmountIn: 10000n });
    expect(ammBuyCalls[0].tokenAmountOut).toBe(100n);
    expect(ammBuyCalls[0].maxQuoteIn).toBe(10000n);
    expect(ammBuyCalls[0].exactQuoteIn).toBeUndefined();
    expect(plan.quote.kind).toBe("exactOut");
    await ammSell({ ...params, amountIn: 100n, minAmountOut: 10n });
    expect(ammSellCalls[0].minQuoteOut).toBe(10n);
    await expect(ammBuy({ ...params, kind: "exactOut", amountOut: 100n, amountIn: 10000n })).rejects.toThrow("cannot be mixed");
    await expect(ammSell({ ...params, amountIn: 100n, minAmountOut: 10n, slippageBps: 50 })).rejects.toThrow("Do not mix");
  });

});


test("retained AMM contexts avoid pool discovery for subsequent plans", async () => {
  poolReadError = undefined;
  poolReady = true;
  virtualQuoteReserves = 0n;
  const rpc = createRpcStub();
  const before = poolResolutionReads;
  const tradingContext = await resolveAmmTradingContext({ rpc: rpc as any,
    mint: address(MOCK_BASE_MINT), quoteMint: address(MOCK_QUOTE_MINT),
    poolAddress: MOCK_POOL_ADDRESS, commitment: "confirmed" });
  expect(poolResolutionReads).toBe(before + 1);
  const user = await createTestWallet();
  const params = { user, mint: MOCK_BASE_MINT, quoteMint: MOCK_QUOTE_MINT,
    rpc: rpc as any, tradingContext, amountIn: 1000000n };
  const first = await ammBuy(params);
  virtualQuoteReserves = 3000000000n;
  const refreshed = await ammBuy(params);
  expect(poolResolutionReads).toBe(before + 1);
  expect(first.quote.kind).toBe("exactIn");
  expect(refreshed.quote.kind).toBe("exactIn");
  if (first.quote.kind === "exactIn" && refreshed.quote.kind === "exactIn") {
    expect(refreshed.quote.expectedAmountOut).toBeLessThan(first.quote.expectedAmountOut);
  }
  await expect(ammBuy({ ...params, quoteTokenProgram: TOKEN_2022_PROGRAM_ID })).rejects.toThrow("mint owner");
  await expect(ammSell({ ...params, tokenDecimals: 9 })).rejects.toThrow("tokenDecimals");
  virtualQuoteReserves = 0n;
});
