import { signature } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import type { LaunchRecord } from "./session";

/** Read chain state only. Missing or expired signatures never authorize another launch. */
export async function reconcileLaunchRecord(rpc: RpcClient, record: LaunchRecord): Promise<LaunchRecord> {
  if (!record.signature || record.status === "prepared") return { ...record };
  const response = await rpc.getSignatureStatuses([signature(record.signature)], { searchTransactionHistory: true }).send();
  const status = response.value[0];
  if (status?.err) return { ...record, status: "failed" };
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    return { ...record, status: "confirmed" };
  }
  return { ...record, status: "submitted" };
}
