import { address } from "@solana/kit";
import type { Address, Commitment } from "@solana/kit";
import type { RpcSubscriptions, LogsNotificationsApi } from "@solana/rpc-subscriptions";

export type PumpLogsSubscriptions = RpcSubscriptions<LogsNotificationsApi>;
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
  onError?: (error: unknown) => void;
}

export class PumpEventManager {
  private connection: PumpLogsSubscriptions;
  private programId: Address;
  private commitment: Commitment;
  private listeners: Map<number, ListenerEntry> = new Map();
  private nextListenerId = 1;
  private controller: AbortController | null = null;
  private onError: (error: unknown) => void;

  constructor(connection: PumpLogsSubscriptions, options: PumpEventManagerOptions = {}) {
    this.connection = connection;
    this.programId = address(options.programId ?? PUMP_PROGRAM_ID);
    this.commitment = options.commitment ?? "confirmed";
    this.onError = options.onError ?? (error => console.error("Pump log subscription failed", error));
  }

  addEventListener(type: PumpEventType, callback: PumpEventListener): number {
    const id = this.nextListenerId++;
    this.listeners.set(id, { id, type, callback });
    void this.ensureSubscription();
    return id;
  }

  removeEventListener(id: number): void {
    this.listeners.delete(id);
    if (this.listeners.size === 0) {
      this.teardownSubscription();
    }
  }

  private async ensureSubscription() {
    if (this.controller) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const stream = await this.connection.logsNotifications({ mentions: [this.programId] },
        { commitment: this.commitment }).subscribe({ abortSignal: controller.signal });
      for await (const notification of stream) {
        if (controller.signal.aborted) break;
        this.dispatch(notification.value, Number(notification.context.slot));
      }
    } catch (error) {
      if (!controller.signal.aborted) this.onError(error);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private teardownSubscription() {
    this.controller?.abort();
    this.controller = null;
  }

  private dispatch(logRecord: { signature: string; logs: readonly string[] }, slot: number) {
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
  connection: PumpLogsSubscriptions,
  options: PumpEventManagerOptions = {}
): PumpEventManager {
  return new PumpEventManager(connection, options);
}
