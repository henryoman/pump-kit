/**
 * The absolute simplest API for Pump.fun
 * Everything you need, nothing you don't.
 */

export { buy, sell, quickBuy, quickSell } from "./swap";
export type { BuyParams, SellParams } from "./swap";

export { mintWithFirstBuy, validateMintParams } from "./recipes/mintFirstBuy";
export type { MintWithFirstBuyParams } from "./recipes/mintFirstBuy";

export { provideLiquidity } from "./recipes/provideLiquidity";
export type { ProvideLiquidityParams } from "./recipes/provideLiquidity";

export { removeLiquidity } from "./recipes/removeLiquidity";
export type { RemoveLiquidityParams } from "./recipes/removeLiquidity";

// Re-export essential types
export type { TransactionSigner, Instruction, Address } from "@solana/kit";

