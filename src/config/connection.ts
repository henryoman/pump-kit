import type { Rpc } from "@solana/rpc-spec";
import type { SolanaRpcApi } from "@solana/rpc-api";
import type {
  RpcSubscriptions,
  SignatureNotificationsApi,
  SlotNotificationsApi,
} from "@solana/rpc-subscriptions";

/**
 * Pump Kit does not ship a default RPC connection.
 * Provide your own `rpc` and `rpcSubscriptions` clients created via
 * `@solana/kit` factories like `createSolanaRpc` / `createSolanaRpcFromTransport`.
 */
export type RpcClient = Rpc<SolanaRpcApi>;
export type RpcSubscriptionsClient = RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>;
