import { expect, test } from "bun:test";
import { createPumpEventManager } from "../../src/events/pumpEvents";

test("Kit log subscriptions dispatch events and abort when the last listener is removed", async () => {
  let subscriptionSignal: AbortSignal | undefined;
  let filter: unknown;
  let delivered!: () => void;
  const received = new Promise<void>(resolve => { delivered = resolve; });
  const subscriptions = { logsNotifications: (value: unknown) => {
    filter = value;
    return { subscribe: async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      subscriptionSignal = abortSignal;
      return (async function* () {
        yield { context: { slot: 123n }, value: { signature: "signature", logs: ['Program log: trade_event {"amount":5}'] } };
        if (!abortSignal.aborted) await new Promise<void>(resolve => abortSignal.addEventListener("abort", () => resolve(), { once: true }));
      })();
    } };
  } } as any;
  const manager = createPumpEventManager(subscriptions);
  const id = manager.addEventListener("trade", event => {
    expect(event.slot).toBe(123);
    expect(event.parsed).toEqual({ amount: 5 });
    delivered();
  });
  await received;
  expect(filter).toEqual({ mentions: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"] });
  manager.removeEventListener(id);
  expect(subscriptionSignal!.aborted).toBe(true);
});
