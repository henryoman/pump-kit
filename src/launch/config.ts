import { address } from "@solana/kit";
import { validateCreateV2Params } from "../clients/create_v2";
import { solToLamports } from "../utils/amounts";
import { validateSlippage, DEFAULT_SLIPPAGE_BPS } from "../utils/slippage";

export interface LaunchConfig {
  schemaVersion: 1;
  token: { name: string; symbol: string; metadataUri: string };
  quote: "SOL";
  creatorFees?: { recipient?: string; holderReward?: boolean };
  firstBuy?: { amount: string; slippageBps?: number };
}

function object(value: unknown, fields: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!fields.includes(key)) throw new Error(`Unknown ${name} field: ${key}`);
  }
  return result;
}

/** Validate portable config independently of RPC credentials and signers. */
export function validateLaunchConfig(value: unknown): LaunchConfig {
  const config = object(value, ["schemaVersion", "token", "quote", "creatorFees", "firstBuy"], "config");
  if (config.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
  if (config.quote !== "SOL") throw new Error("quote must be SOL");
  const token = object(config.token, ["name", "symbol", "metadataUri"], "token");
  const creatorFees = config.creatorFees === undefined ? undefined : object(config.creatorFees, ["recipient", "holderReward"], "creatorFees");
  if (creatorFees?.recipient !== undefined && typeof creatorFees.recipient !== "string") throw new Error("recipient must be an address string");
  if (creatorFees?.holderReward === true && creatorFees.recipient !== undefined) throw new Error("Holder rewards cannot also specify a creator fee recipient");
  if (creatorFees?.recipient !== undefined) address(creatorFees.recipient as string);
  validateCreateV2Params({
    name: token.name as string, symbol: token.symbol as string, uri: token.metadataUri as string,
    creator: creatorFees?.recipient as string | undefined, holderReward: creatorFees?.holderReward as boolean | undefined,
  });
  let firstBuy: LaunchConfig["firstBuy"];
  if (config.firstBuy !== undefined) {
    const buy = object(config.firstBuy, ["amount", "slippageBps"], "firstBuy");
    if (typeof buy.amount !== "string") throw new Error("firstBuy.amount must be a decimal string");
    const raw = solToLamports(buy.amount);
    if (raw <= 0n || raw > 18446744073709551615n) throw new Error("firstBuy.amount must be a positive u64 lamport amount");
    const slippageBps = buy.slippageBps === undefined ? DEFAULT_SLIPPAGE_BPS : buy.slippageBps;
    if (typeof slippageBps !== "number") throw new Error("slippageBps must be a number");
    validateSlippage(slippageBps);
    if (slippageBps === 10000) throw new Error("First buy slippage must preserve a positive output limit");
    firstBuy = { amount: buy.amount, slippageBps };
  }
  return {
    schemaVersion: 1, quote: "SOL",
    token: { name: token.name as string, symbol: token.symbol as string, metadataUri: token.metadataUri as string },
    ...(creatorFees === undefined ? {} : { creatorFees: { recipient: creatorFees.recipient as string | undefined, holderReward: creatorFees.holderReward as boolean | undefined } }),
    ...(firstBuy === undefined ? {} : { firstBuy }),
  };
}
