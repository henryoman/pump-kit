import type { TransactionSigner, Instruction, Address } from "@solana/kit";
import { address } from "@solana/kit";
import { createV2, mintAuthorityPda, validateCreateV2Params } from "../clients/create_v2";
import { buyV2 } from "../clients/trade_v2";
import { createPump } from "../launch/session";
import { fetchGlobal } from "../pumpsdk/generated/accounts/global";
import { globalPda } from "../pda/pump";
import { buildCreateAtaInstruction } from "../utils/ata";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../config/addresses";
import { addSlippage, DEFAULT_SLIPPAGE_BPS, validateSlippage } from "../utils/slippage";
import type { RpcClient } from "../config/connection";

export interface MintWithFirstBuyParams {
  user: TransactionSigner;
  mint: TransactionSigner;
  /** Deprecated: omit this; the program PDA is derived internally. */
  mintAuthority?: Address | string;
  name: string;
  symbol: string;
  uri: string;
  /** Exact decimal SOL budget, including swap fees. Preferred mode. */
  firstBuyAmountSol?: string;
  /** Explicit token quantity mode; requires estimatedFirstBuyCost. */
  firstBuyTokenAmount?: bigint;
  estimatedFirstBuyCost?: bigint;
  slippageBps?: number;
  feeRecipient?: Address | string;
  buybackFeeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  holderReward?: boolean;
  trackVolume?: boolean;
  rpc: RpcClient;
  commitment?: "processed" | "confirmed" | "finalized";
}

export interface MintWithFirstBuyInstructions {
  createInstruction: Instruction;
  buyInstruction: Instruction;
  /** Include all instructions, in order, for atomic create plus ATA plus buy. */
  instructions: readonly Instruction[];
}

export async function mintWithFirstBuy(params: MintWithFirstBuyParams): Promise<MintWithFirstBuyInstructions> {
  validateCreateV2Params(params);
  if (params.mintAuthority !== undefined && address(params.mintAuthority) !== await mintAuthorityPda()) {
    throw new Error("mintAuthority must be the program-derived mint authority; omit it for automatic derivation");
  }
  if (params.firstBuyAmountSol !== undefined) {
    if (params.firstBuyTokenAmount !== undefined || params.estimatedFirstBuyCost !== undefined || params.feeRecipient !== undefined || params.buybackFeeRecipient !== undefined) {
      throw new Error("Do not mix budget mode with explicit token/cost or fee overrides");
    }
    const session = await createPump({ rpc: params.rpc }).launch.prepare({
      schemaVersion: 1, quote: "SOL", token: { name: params.name, symbol: params.symbol, metadataUri: params.uri },
      creatorFees: { recipient: params.holderReward ? undefined : params.bondingCurveCreator, holderReward: params.holderReward },
      firstBuy: { amount: params.firstBuyAmountSol, slippageBps: params.slippageBps },
    }, { signer: params.user, mint: params.mint });
    return { createInstruction: session.instructions[0]!, buyInstruction: session.instructions[2]!, instructions: session.instructions };
  }
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);
  if (params.firstBuyTokenAmount === undefined || params.firstBuyTokenAmount <= 0n || params.estimatedFirstBuyCost === undefined || params.estimatedFirstBuyCost <= 0n) {
    throw new Error("Provide firstBuyAmountSol or positive firstBuyTokenAmount and estimatedFirstBuyCost");
  }
  const creator = address(params.bondingCurveCreator ?? params.user.address);
  const global = (await fetchGlobal(params.rpc, await globalPda())).data;
  if (!global.createV2Enabled || (params.holderReward && !global.isHolderRewardEnabled)) throw new Error("Requested creation mode is disabled");
  const feeRecipient = address(params.feeRecipient ?? global.feeRecipient);
  const buybackFeeRecipient = params.buybackFeeRecipient ?? global.buybackFeeRecipients.find(value => value !== address("11111111111111111111111111111111"));
  if (!buybackFeeRecipient) throw new Error("No buyback fee recipient configured");
  const createInstruction = await createV2({ ...params, creator });
  const ataInstruction = await buildCreateAtaInstruction({ payer: params.user, owner: params.user, mint: params.mint.address, tokenProgram: TOKEN_2022_PROGRAM_ID });
  const buyInstruction = await buyV2({ user: params.user, mint: params.mint.address, rpc: params.rpc,
    bondingCurveCreator: creator, feeRecipient, buybackFeeRecipient, baseTokenProgram: TOKEN_2022_PROGRAM_ID,
    quoteTokenProgram: TOKEN_PROGRAM_ID, tokenAmountRaw: params.firstBuyTokenAmount,
    maxQuoteInputRaw: addSlippage(params.estimatedFirstBuyCost, slippageBps) });
  return { createInstruction, buyInstruction, instructions: [createInstruction, ataInstruction, buyInstruction] };
}

export function validateMintParams(params: { name: string; symbol: string; uri: string }): void {
  validateCreateV2Params(params);
}
