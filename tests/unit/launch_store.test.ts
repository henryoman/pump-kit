import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileLaunchStore, readLaunchRecord } from "../../src/launch/file_store";
import { reconcileLaunchRecord } from "../../src/launch/reconcile";
import type { LaunchRecord } from "../../src/launch/session";

const mint = "So11111111111111111111111111111111111111112";
const signature = "1".repeat(64);
test("fresh records are exclusive, durable, and cannot be replaced with another mint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pump-record-"));
  try {
    const path = join(directory, "launch.json");
    const store = createFileLaunchStore(path);
    await store.save({ mint, status: "prepared" });
    await expect(createFileLaunchStore(path).save({ mint, status: "prepared" })).rejects.toThrow();
    await store.save({ mint, status: "submitted", signature, lastValidBlockHeight: "100" });
    expect((await readLaunchRecord(path)).signature).toBe(signature);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(store.save({ mint: "11111111111111111111111111111111", status: "prepared" })).rejects.toThrow("another mint");
    expect((await readLaunchRecord(path)).status).toBe("submitted");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reconciliation distinguishes confirmed, failed, and uncertain submissions", async () => {
  const record: LaunchRecord = { mint, status: "submitted", signature };
  for (const [status, expected] of [
    [null, "submitted"], [{ err: null, confirmationStatus: "processed" }, "submitted"],
    [{ err: null, confirmationStatus: "confirmed" }, "confirmed"],
    [{ err: null, confirmationStatus: "finalized" }, "confirmed"],
    [{ err: { InstructionError: [0, "Custom"] } }, "failed"],
  ] as const) {
    const rpc = { getSignatureStatuses: (_signatures: unknown, options: any) => ({ send: async () => {
      expect(options.searchTransactionHistory).toBe(true);
      return { value: [status] };
    } }) } as any;
    expect((await reconcileLaunchRecord(rpc, record)).status).toBe(expected);
  }
});
