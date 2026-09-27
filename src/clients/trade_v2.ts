import { address } from "@solana/kit";
import type { Address, TransactionSigner } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import { creatorVaultPda } from "../pda/pump";
import { findAssociatedTokenPda } from "../pda/ata";
import { resolveTokenProgram } from "../utils/token_program";
import { getBuyV2InstructionAsync } from "../pumpsdk/generated/instructions/buyV2";
import { getSellV2InstructionAsync } from "../pumpsdk/generated/instructions/sellV2";
import { getBuyExactQuoteInV2InstructionAsync } from "../pumpsdk/generated/instructions/buyExactQuoteInV2";

export interface CurveTradeV2Params {
  user: TransactionSigner;
  mint: Address | string;
  quoteMint?: Address | string;
  baseTokenProgram?: Address | string;
  quoteTokenProgram?: Address | string;
  bondingCurveCreator: Address | string;
  feeRecipient: Address | string;
  buybackFeeRecipient: Address | string;
  rpc: RpcClient;
}

async function tradeAccounts(params: CurveTradeV2Params) {
  const baseMint = address(params.mint);
  const quoteMint = address(params.quoteMint ?? "So11111111111111111111111111111111111111112");
  const [baseTokenProgram, quoteTokenProgram] = await Promise.all([
    resolveTokenProgram({ rpc: params.rpc, mint: baseMint, tokenProgram: params.baseTokenProgram }),
    resolveTokenProgram({ rpc: params.rpc, mint: quoteMint, tokenProgram: params.quoteTokenProgram }),
  ]);
  const [[associatedBaseUser], [associatedQuoteUser], creatorVault] = await Promise.all([
    findAssociatedTokenPda({ owner: params.user.address, mint: baseMint, tokenProgram: baseTokenProgram }),
    findAssociatedTokenPda({ owner: params.user.address, mint: quoteMint, tokenProgram: quoteTokenProgram }),
    creatorVaultPda(params.bondingCurveCreator),
  ]);
  return { baseMint, quoteMint, baseTokenProgram, quoteTokenProgram, associatedBaseUser,
    associatedQuoteUser, creatorVault, user: params.user, feeRecipient: address(params.feeRecipient),
    buybackFeeRecipient: address(params.buybackFeeRecipient) };
}

function positive(value: bigint, field: string): void {
  if (typeof value !== "bigint" || value <= 0n || value > 18446744073709551615n) {
    throw new Error(`${field} must be a positive u64 bigint`);
  }
}

export async function buyV2(params: CurveTradeV2Params & { tokenAmountRaw: bigint; maxQuoteInputRaw: bigint }) {
  positive(params.tokenAmountRaw, "tokenAmountRaw");
  positive(params.maxQuoteInputRaw, "maxQuoteInputRaw");
  return getBuyV2InstructionAsync({ ...await tradeAccounts(params), amount: params.tokenAmountRaw, maxSolCost: params.maxQuoteInputRaw });
}

export async function sellV2(params: CurveTradeV2Params & { tokenAmountRaw: bigint; minQuoteOutputRaw: bigint }) {
  positive(params.tokenAmountRaw, "tokenAmountRaw");
  positive(params.minQuoteOutputRaw, "minQuoteOutputRaw");
  return getSellV2InstructionAsync({ ...await tradeAccounts(params), amount: params.tokenAmountRaw, minSolOutput: params.minQuoteOutputRaw });
}

/** Exact quote budget, including fees; output protection is an explicit base-token floor. */
export async function buyExactQuoteInV2(params: CurveTradeV2Params & { quoteAmountRaw: bigint; minTokenOutputRaw: bigint }) {
  positive(params.quoteAmountRaw, "quoteAmountRaw");
  positive(params.minTokenOutputRaw, "minTokenOutputRaw");
  return getBuyExactQuoteInV2InstructionAsync({ ...await tradeAccounts(params), spendableQuoteIn: params.quoteAmountRaw, minTokensOut: params.minTokenOutputRaw });
}
