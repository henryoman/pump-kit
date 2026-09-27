import type { Instruction } from "@solana/kit";

export type SwapQuote =
  | Readonly<{ kind: "exactIn"; amountIn: bigint; expectedAmountOut: bigint; minAmountOut: bigint }>
  | Readonly<{ kind: "exactOut"; amountOut: bigint; expectedAmountIn: bigint; maxAmountIn: bigint }>;

export type SwapPlan = Readonly<{
  venue: "curve" | "amm";
  /** RPC bank slot shared by the mutable quote state snapshot. */
  contextSlot: bigint;
  instructions: readonly Instruction[];
  quote: SwapQuote;
}>;
