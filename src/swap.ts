import { curveBuy, curveSell } from "./swap/curve";
import { ammBuy, ammSell } from "./swap/amm";
import type { CurveBuyParams, CurveSellParams, CommitmentLevel } from "./swap/curve";
import type { AmmBuyParams, AmmSellParams } from "./swap/amm";

export { curveBuy, curveSell } from "./swap/curve";
export { ammBuy, ammSell } from "./swap/amm";

export type {
  CurveBuyParams,
  CurveSellParams,
  CommitmentLevel,
} from "./swap/curve";
export type { AmmBuyParams, AmmSellParams } from "./swap/amm";

export type BuyParams = CurveBuyParams;
export type SellParams = CurveSellParams;

export const buy = curveBuy;
export const sell = curveSell;
