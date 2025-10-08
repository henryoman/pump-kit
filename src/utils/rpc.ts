import { createSolanaRpc } from "@solana/kit";
import { COMMITMENT, RPC_URL } from "../env";

export const rpc = createSolanaRpc(RPC_URL);

export type Rpc = typeof rpc;
export const defaultCommitment = COMMITMENT;
