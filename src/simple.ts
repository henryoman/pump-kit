/**
 * The absolute simplest API for Pump.fun
 * Everything you need, nothing you don't.
 */

export { buy, sell, quickBuy, quickSell } from "./swap";
export type { BuyParams, SellParams } from "./swap";

export { mintWithFirstBuy, validateMintParams } from "./recipes/mintFirstBuy";
export type { MintWithFirstBuyParams } from "./recipes/mintFirstBuy";

export {
  addLiquidity,
  removeLiquidity,
  quickAddLiquidity,
  quickRemoveLiquidity,
} from "./liquidity";
export type { AddLiquidityParams, RemoveLiquidityParams } from "./liquidity";

// Re-export essential types
export type { TransactionSigner, Instruction, Address } from "@solana/kit";

