import { open, rename, unlink, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { address, signature } from "@solana/kit";
import type { LaunchRecord } from "./session";

export function validateLaunchRecord(value: unknown): LaunchRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid launch record");
  const record = value as LaunchRecord;
  address(record.mint);
  if (!["prepared", "submitted", "confirmed", "failed"].includes(record.status)) throw new Error("Invalid launch status");
  if (record.status !== "prepared" && !record.signature) throw new Error("Submitted record requires a signature");
  if (record.signature) signature(record.signature);
  if (record.lastValidBlockHeight !== undefined && !/^\d+$/.test(record.lastValidBlockHeight)) throw new Error("Invalid block height");
  return { mint: record.mint, status: record.status, signature: record.signature,
    latestBlockhash: record.latestBlockhash, lastValidBlockHeight: record.lastValidBlockHeight };
}

export async function readLaunchRecord(path: string): Promise<LaunchRecord> {
  return validateLaunchRecord(JSON.parse(await readFile(path, "utf8")));
}

/** Claim a fresh record path once. Flush each update before allowing broadcast. */
export function createFileLaunchStore(path: string) {
  const target = resolve(path);
  let claimed = false;
  let previous: LaunchRecord | undefined;
  let pending = Promise.resolve();
  return {
    save(record: LaunchRecord): Promise<void> {
      const next = pending.then(async () => {
        const validated = validateLaunchRecord(record);
        if (previous && previous.mint !== validated.mint) throw new Error("Cannot replace a launch record with another mint");
        if (previous?.signature && validated.signature !== previous.signature) throw new Error("Cannot replace a submitted signature");
        if (previous && previous.status !== "prepared" && validated.status === "prepared") throw new Error("Cannot reset a submitted launch");
        if (previous && ["confirmed", "failed"].includes(previous.status) && validated.status !== previous.status) throw new Error("Cannot change a terminal launch status");
        const payload = JSON.stringify(validated, null, 2) + "\n";
        if (!claimed) {
          const handle = await open(target, "wx", 0o600);
          try { await handle.writeFile(payload); await handle.sync(); } finally { await handle.close(); }
          claimed = true;

        } else {
          const temporary = `${target}.${randomUUID()}.tmp`;
          try {
            const handle = await open(temporary, "wx", 0o600);
            try { await handle.writeFile(payload); await handle.sync(); } finally { await handle.close(); }
            await rename(temporary, target);
          } finally { await unlink(temporary).catch(() => {}); }
        }
        previous = validated;
        const directory = await open(dirname(target), "r");
        try { await directory.sync(); } finally { await directory.close(); }
      });
      pending = next;
      return next;
    },
  };
}
