import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { curveBuy, curveSell } from "../../src/swap/curve";
import { quoteBuyWithSolAmount, quoteSellForTokenAmount } from "../../src/ammsdk/bondingCurveMath";
import { getBuyExactQuoteInV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyExactQuoteInV2";
import { getBuyV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyV2";
import { getSellV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/sellV2";
import { addSlippage, subSlippage } from "../../src/utils/slippage";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";
import { findAssociatedTokenPda } from "../../src/pda/ata";

async function fixture() {
  const user = await generateKeyPairSigner();
  const mint = (await generateKeyPairSigner()).address;
  const curveStateOverride = { virtualTokenReserves: 50000000000n, virtualQuoteReserves: 5000000000n,
    realTokenReserves: 25000000000n, realQuoteReserves: 1000000000n, creator: user.address, complete: false };
  const feeStructureOverride = { lpFeeBps: 0n, protocolFeeBps: 75n, creatorFeeBps: 25n };
  const rpc = { getAccountInfo: () => ({ send: async () => ({ value: null }) }) } as any;
  return { user, mint, rpc, curveStateOverride, feeStructureOverride, bondingCurveCreator: user.address,
    feeRecipient: user.address, buybackFeeRecipient: user.address,
    contextSlot: 100n, baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID };
}

test("curve buy preserves its budget and slippage cap using unified v2 accounts", async () => {
  const params = await fixture();
  const quote = quoteBuyWithSolAmount(params.curveStateOverride, params.feeStructureOverride, 800000000n);
  const plan = await curveBuy({ ...params, solAmount: "0.8", kind: "exactOut", slippageBps: 75 });
  const instruction = plan.instructions.at(-1)!;
  const decoded = getBuyV2InstructionDataDecoder().decode(instruction.data);
  expect(decoded.amount).toBe(quote.tokenAmount);
  expect(decoded.maxSolCost).toBe(addSlippage(quote.totalSolCostLamports, 75));
  expect(decoded.maxSolCost).toBeLessThanOrEqual(addSlippage(800000000n, 75));
  expect(plan.venue).toBe("curve");
  expect(plan.contextSlot).toBe(100n);
  expect(plan.quote.kind).toBe("exactOut");
  expect(plan.instructions).toHaveLength(2);
  expect(plan.instructions.every(ix => !("prepend" in ix) && !("append" in ix))).toBe(true);
  expect(instruction.accounts).toHaveLength(27);
  expect(instruction.accounts[3].address).toBe(address(TOKEN_2022_PROGRAM_ID));
  expect(instruction.accounts[4].address).toBe(address(TOKEN_PROGRAM_ID));
  const [ata] = await findAssociatedTokenPda({ owner: params.user.address, mint: params.mint, tokenProgram: address(TOKEN_2022_PROGRAM_ID) });
  expect(instruction.accounts[14].address).toBe(ata);
  expect(plan.instructions[0].accounts[5].address).toBe(address(TOKEN_2022_PROGRAM_ID));
});

test("curve sell preserves its output floor with a Token-2022 base mint", async () => {
  const params = await fixture();
  const quote = quoteSellForTokenAmount(params.curveStateOverride, params.feeStructureOverride, 750000n);
  const plan = await curveSell({ ...params, tokenAmount: "0.75", slippageBps: 100 });
  const instruction = plan.instructions.at(-1)!;
  const decoded = getSellV2InstructionDataDecoder().decode(instruction.data);
  expect(decoded.amount).toBe(750000n);
  expect(decoded.minSolOutput).toBe(subSlippage(quote.solOutputLamports, 100));
  expect(instruction.accounts[3].address).toBe(address(TOKEN_2022_PROGRAM_ID));
});

test("curve setup uses idempotent ATA creation without reading account readiness", async () => {
  const params = await fixture();
  params.rpc = { getAccountInfo: () => { throw new Error("RPC unavailable"); } } as any;
  const plan = await curveBuy({ ...params, solAmount: "0.01" });
  expect(plan.instructions[0].data).toEqual(new Uint8Array([1]));
});

test("curve percentage sells reject amounts below one raw unit", async () => {
  const params = await fixture();
  params.rpc = { getTokenAccountBalance: () => ({ send: async () => ({ value: { amount: "1" } }) }) } as any;
  await expect(curveSell({ ...params, useWalletPercentage: true, walletPercentage: 1 }))
    .rejects.toThrow("Percentage sell rounds to zero token units");
});


test("raw swap amounts remain integer base units and reject mixed modes", async () => {
  const params = await fixture();
  const plan = await curveSell({ ...params, amountIn: 750000n });
  expect(plan.quote.kind).toBe("exactIn");
  expect(plan.quote.kind === "exactIn" && plan.quote.amountIn).toBe(750000n);
  await expect(curveBuy({ ...params, amountIn: 1000000n, solAmount: "0.001" })).rejects.toThrow("exactly one");
  await expect(curveSell({ ...params, amountIn: 1n, tokenAmount: "1" })).rejects.toThrow("Do not mix");
});


test("exact-input curve buys preserve the lamport budget and protect token output", async () => {
  const params = await fixture();
  const plan = await curveBuy({ ...params, amountIn: 800000000n, slippageBps: 75 });
  const expected = quoteBuyWithSolAmount(params.curveStateOverride, params.feeStructureOverride, 800000000n);
  const data = getBuyExactQuoteInV2InstructionDataDecoder().decode(plan.instructions.at(-1)!.data!);
  expect(data.spendableQuoteIn).toBe(800000000n);
  expect(data.minTokensOut).toBe(subSlippage(expected.tokenAmount, 75));
  expect(plan.quote).toEqual({ kind: "exactIn", amountIn: 800000000n,
    expectedAmountOut: expected.tokenAmount, minAmountOut: data.minTokensOut });
  const explicit = await curveBuy({ ...params, amountIn: 800000000n, minAmountOut: 123n });
  expect(getBuyExactQuoteInV2InstructionDataDecoder().decode(explicit.instructions.at(-1)!.data!).minTokensOut).toBe(123n);
  await expect(curveBuy({ ...params, amountIn: 800000000n, minAmountOut: 123n, slippageBps: 50 }))
    .rejects.toThrow("Do not mix");
});

test("exact-output curve buys encode the supplied token target and hard lamport cap", async () => {
  const params = await fixture();
  const plan = await curveBuy({ ...params, kind: "exactOut", amountOut: 750000n, maxAmountIn: 1000000n });
  const data = getBuyV2InstructionDataDecoder().decode(plan.instructions.at(-1)!.data!);
  expect(data.amount).toBe(750000n);
  expect(data.maxSolCost).toBe(1000000n);
  expect(plan.quote.kind === "exactOut" && plan.quote.amountOut).toBe(750000n);
  await expect(curveBuy({ ...params, kind: "exactOut", amountOut: 750000n, amountIn: 1000000n })).rejects.toThrow("cannot be mixed");
  await expect(curveBuy({ ...params, kind: "exactOut", amountOut: 750000n, maxAmountIn: 1000000n, slippageBps: 50 })).rejects.toThrow("cannot be mixed");
});
