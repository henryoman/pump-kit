/**
 * The absolute simplest API for Pump.fun
 * Everything you need, nothing you don't.
 */

import "./config/polyfills";

export { buy, sell, quickBuy, quickSell } from "./swap";
export type { BuyParams, SellParams } from "./swap";

export { mintWithFirstBuy, validateMintParams } from "./recipes/mintFirstBuy";
export type { MintWithFirstBuyParams } from "./recipes/mintFirstBuy";

// Re-export essential types
export type { TransactionSigner, Instruction, Address } from "@solana/kit";
