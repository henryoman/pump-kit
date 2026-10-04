import type {
  Rpc,
  SolanaRpcApi,
  RpcSubscriptions,
  SignatureNotificationsApi,
  SlotNotificationsApi,
} from "@solana/kit";

/**
 * Low-level helpers accept clients created by Solana Kit. The launch factory
 * creates devnet clients when no endpoint or client is supplied.
 */
export type RpcClient = Rpc<SolanaRpcApi>;
export type RpcSubscriptionsClient = RpcSubscriptions<SignatureNotificationsApi & SlotNotificationsApi>;
