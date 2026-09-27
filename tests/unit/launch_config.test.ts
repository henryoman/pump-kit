import { expect, test } from "bun:test";
import { validateLaunchConfig } from "../../src/launch/config";

const config = { schemaVersion: 1, quote: "SOL", token: { name: "Example", symbol: "EX", metadataUri: "ipfs://example" } };
test("validates create-only and optional decimal first-buy configs", () => {
  expect(validateLaunchConfig(config).firstBuy).toBeUndefined();
  expect(validateLaunchConfig({ ...config, firstBuy: { amount: "0.25" } }).firstBuy).toEqual({ amount: "0.25", slippageBps: 50 });
  expect(validateLaunchConfig({ ...config, creatorFees: { holderReward: true } }).creatorFees?.holderReward).toBe(true);
});
test("rejects secrets, unsupported versions, malformed amounts and conflicting permanent choices", () => {
  for (const override of [
    { rpcUrl: "https://secret" }, { wallet: "secret" }, { schemaVersion: 2 }, { quote: "USDC" },
    { firstBuy: { amount: 0.25 } }, { firstBuy: { amount: "0" } },
    { firstBuy: { amount: "0.0000000001" } }, { firstBuy: { amount: "1", slippageBps: 10000 } },
    { creatorFees: { holderReward: true, recipient: "So11111111111111111111111111111111111111112" } },
    { creatorFees: { cashback: true } },
  ]) expect(() => validateLaunchConfig({ ...config, ...override })).toThrow();
});
