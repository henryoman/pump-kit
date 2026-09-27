import { resolveSwapVenue, MigrationPendingError } from "./swap/venue";
import { curveBuy, curveSell } from "./swap/curve";
import { ammBuy, ammSell } from "./swap/amm";
import type { CurveBuyParams, CurveSellParams, CommitmentLevel } from "./swap/curve";
import type { AmmBuyParams, AmmSellParams } from "./swap/amm";

export { curveBuy, curveSell } from "./swap/curve";
export { ammBuy, ammSell, resolveAmmTradingContext } from "./swap/amm";

export type {
  CurveBuyParams,
  CurveSellParams,
  CommitmentLevel,
} from "./swap/curve";
export type { AmmBuyParams, AmmSellParams } from "./swap/amm";

type PoolRoutingOptions = Pick<AmmBuyParams, "poolAddress" | "poolCreator" | "poolIndex" | "quoteMint" | "wsolStrategy">;
export type BuyParams = CurveBuyParams & PoolRoutingOptions;
export type SellParams = CurveSellParams & PoolRoutingOptions;

export async function buy(params: BuyParams) {
  const venue = await resolveSwapVenue(params);
  if (venue.status === "migrationPending") throw new MigrationPendingError(venue.poolAddress);
  return venue.status === "curve" ? curveBuy({ ...params, curveStateOverride: venue.curve })
    : ammBuy({ ...params, poolAddress: venue.poolAddress, poolStateOverride: venue.pool });
}

export async function sell(params: SellParams) {
  const venue = await resolveSwapVenue(params);
  if (venue.status === "migrationPending") throw new MigrationPendingError(venue.poolAddress);
  return venue.status === "curve" ? curveSell({ ...params, curveStateOverride: venue.curve })
    : ammSell({ ...params, poolAddress: venue.poolAddress, poolStateOverride: venue.pool });
}

export { resolveSwapVenue, MigrationPendingError, type SwapVenue } from "./swap/venue";

export type { SwapPlan, SwapQuote } from "./swap/plan";

export type { AmmTradingContext } from "./swap/snapshot";
