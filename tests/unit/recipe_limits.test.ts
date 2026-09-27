import { expect, test } from "bun:test";
import { buySimple } from "../../src/recipes/buy";
import { sellSimple } from "../../src/recipes/sell";

test("rejects ambiguous trade limits before any RPC or signing", async () => {
  await expect(buySimple({ maxSolCostSol: 1, maxSolCostLamports: 1n } as any))
    .rejects.toThrow("exactly one SOL spending limit");
  await expect(sellSimple({ minSolOutputSol: 1, minSolOutputLamports: 1n } as any))
    .rejects.toThrow("exactly one SOL output limit");
  await expect(sellSimple({ tokenAmount: 1, tokenAmountRaw: 1n } as any))
    .rejects.toThrow("exactly one token amount");
});
