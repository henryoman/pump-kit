import { Connection, PublicKey, LogsCallback, Logs, Commitment } from "@solana/web3.js";
import type { Address } from "@solana/kit";
import { PUMP_PROGRAM_ID } from "../config/addresses";

export type PumpEventType = "create" | "trade" | "complete" | "raw";

export interface PumpEvent {
  type: PumpEventType;
  slot: number;
  signature: string;
  rawLog: string;
  parsed?: unknown;
}

export type PumpEventListener = (event: PumpEvent) => void;

interface ListenerEntry {
  id: number;
  type: PumpEventType;
  callback: PumpEventListener;
}

export interface PumpEventManagerOptions {
  programId?: Address | string;
  commitment?: Commitment;
}

export class PumpEventManager {
  private connection: Connection;
  private programId: PublicKey;
  private commitment: Commitment;
  private listeners: Map<number, ListenerEntry> = new Map();
  private nextListenerId = 1;
  private subscriptionId: number | null = null;

  constructor(connection: Connection, options: PumpEventManagerOptions = {}) {
    this.connection = connection;
    this.programId = new PublicKey(options.programId ?? PUMP_PROGRAM_ID);
    this.commitment = options.commitment ?? "confirmed";
  }

  addEventListener(type: PumpEventType, callback: PumpEventListener): number {
    const id = this.nextListenerId++;
    this.listeners.set(id, { id, type, callback });
    this.ensureSubscription();
    return id;
  }

  removeEventListener(id: number): void {
    this.listeners.delete(id);
    if (this.listeners.size === 0) {
      this.teardownSubscription();
    }
  }

  private ensureSubscription() {
    if (this.subscriptionId !== null) return;
    const handler: LogsCallback = (logs, ctx) => {
      this.dispatch(logs, ctx.slot);
    };
    try {
      const id = this.connection.onLogs(this.programId, handler, this.commitment);
      this.subscriptionId = id;
    } catch (err) {
      console.error("Failed to subscribe to Pump.fun logs", err);
    }
  }

  private async teardownSubscription() {
    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
      } catch (err) {
        console.warn("Failed to remove Pump.fun log listener", err);
      }
      this.subscriptionId = null;
    }
  }

  private dispatch(logRecord: Logs, slot: number) {
    const signature = logRecord.signature ?? "";
    for (const rawLog of logRecord.logs) {
      const event = parsePumpEvent(rawLog, slot, signature);
      for (const entry of this.listeners.values()) {
        if (entry.type === "raw" || entry.type === event.type) {
          entry.callback(event);
        }
      }
    }
  }
}

const EVENT_KEYWORDS: Record<PumpEventType, string[]> = {
  create: ["createEvent", "create_event"],
  trade: ["tradeEvent", "trade_event"],
  complete: ["completeEvent", "complete_event"],
  raw: [],
};

function parsePumpEvent(rawLog: string, slot: number, signature: string): PumpEvent {
  let type: PumpEventType = "raw";
  for (const [eventType, keywords] of Object.entries(EVENT_KEYWORDS) as [PumpEventType, string[]][]) {
    if (eventType === "raw") continue;
    if (keywords.some((keyword) => rawLog.includes(keyword))) {
      type = eventType;
      break;
    }
  }

  let parsed: unknown;
  const jsonStart = rawLog.indexOf("{");
  if (jsonStart !== -1) {
    const candidate = rawLog.slice(jsonStart);
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = undefined;
    }
  }

  return {
    type,
    slot,
    signature,
    rawLog,
    parsed,
  };
}

export function createPumpEventManager(
  connection: Connection,
  options: PumpEventManagerOptions = {}
): PumpEventManager {
  return new PumpEventManager(connection, options);
}
