import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";

import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import { buySimple } from "../recipes/buy";
import { sellSimple } from "../recipes/sell";
import { bondingCurvePda, feeConfigPda } from "../pda/pump";
import { findAssociatedTokenPda } from "../pda/ata";
import { TOKEN_PROGRAM_ID } from "../config/addresses";
import { buildCreateAtaInstruction } from "../utils/ata";
import { fetchBondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import { fetchFeeConfig } from "../pumpsdk/generated/accounts/feeConfig";
import type { Fees } from "../pumpsdk/generated/types/fees";
import {
  quoteBuyWithSolAmount,
  quoteSellForTokenAmount,
  quoteSolCostForBuy,
  type BondingCurveState,
  type FeeStructure,
} from "../ammsdk/bondingCurveMath";
import { solToLamports, tokensToRaw } from "../utils/amounts";
import {
  DEFAULT_SLIPPAGE_BPS,
  addSlippage,
  subSlippage,
  validateSlippage,
} from "../utils/slippage";
import { DEFAULT_FEE_RECIPIENT } from "../config/constants";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type WithRpcOptions = {
  rpc: RpcClient;
  commitment?: CommitmentLevel;
};

export type CurveBuyParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  solAmount: number;
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  trackVolume?: boolean;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
  allowAtaCreation?: boolean;
};

export type CurveSellParams = WithRpcOptions & {
  user: TransactionSigner;
  mint: Address | string;
  tokenAmount?: number;
  useWalletPercentage?: boolean;
  walletPercentage?: number;
  tokenDecimals?: number;
  slippageBps?: number;
  feeRecipient?: Address | string;
  bondingCurveCreator?: Address | string;
  curveStateOverride?: BondingCurveState;
  feeStructureOverride?: FeeStructure;
};

const DEFAULT_FEE_RECIPIENT_ADDRESS = DEFAULT_FEE_RECIPIENT;
const PERCENTAGE_SCALE = 10_000;

const ensurePositiveNumber = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
};

const toFeeStructure = (flatFees: Fees): FeeStructure => ({
  lpFeeBps: flatFees.lpFeeBps,
  protocolFeeBps: flatFees.protocolFeeBps,
  creatorFeeBps: flatFees.creatorFeeBps,
});

type CurveLoadOverrides = {
  curve?: BondingCurveState;
  fees?: FeeStructure;
};

async function loadCurveState(
  mint: Address | string,
  rpcClient: RpcClient,
  commitment: CommitmentLevel,
  overrides?: CurveLoadOverrides
) {
  const curvePromise = overrides?.curve
    ? Promise.resolve(overrides.curve)
    : (async () => {
        const address = await bondingCurvePda(mint);
        const account = await fetchBondingCurve(rpcClient, address, { commitment });
        return account.data;
      })();

  const feesPromise = overrides?.fees
    ? Promise.resolve(overrides.fees)
    : (async () => {
        const address = await feeConfigPda();
        const account = await fetchFeeConfig(rpcClient, address, { commitment });
        return toFeeStructure(account.data.flatFees);
      })();

  try {
    const [curve, fees] = await Promise.all([curvePromise, feesPromise]);
    return { curve, fees } as const;
  } catch (error) {
    throw new Error(
      "Failed to load bonding curve state. Provide overrides or ensure the RPC endpoint can access Pump accounts.",
      { cause: error }
    );
  }
}

function percentageToScaled(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("walletPercentage must be between 0 and 100");
  }
  return BigInt(Math.round(percentage * 100));
}

export async function curveBuy(params: CurveBuyParams): Promise<Instruction> {
  ensurePositiveNumber(params.solAmount, "solAmount");

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;
  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();

  const { curve, fees } = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });

  if (curve.complete) {
    throw new Error("Token has migrated to the AMM. Use ammBuy instead of curveBuy.");
  }

  const creator = params.bondingCurveCreator
    ? toAddress(params.bondingCurveCreator)
    : curve.creator;

  const solBudgetLamports = solToLamports(params.solAmount);

  const budgetQuote = quoteBuyWithSolAmount(curve, fees, solBudgetLamports);
  const tokenAmountToBuy = budgetQuote.tokenAmount;

  const exactCost = quoteSolCostForBuy(curve, fees, tokenAmountToBuy);
  const slippageAdjustedCost = addSlippage(exactCost.totalSolCostLamports, slippageBps);
  const maxSolCostLamports = slippageAdjustedCost * 2n;

  const mintAddress = toAddress(params.mint);
  const [userAta] = await findAssociatedTokenPda({
    owner: params.user.address,
    mint: mintAddress,
  });

  let createAtaInstruction: Instruction | undefined;
  if (params.allowAtaCreation !== false) {
    try {
      const ataAccount = await params.rpc
        .getAccountInfo(userAta, { encoding: "base64" })
        .send();
      if (!ataAccount.value) {
        createAtaInstruction = buildCreateAtaInstruction({
          payer: params.user,
          owner: params.user,
          mint: mintAddress,
        });
      }
    } catch (checkError) {
      // If we can't check, assume it needs to be created
      console.warn("[curveBuy] getAccountInfo failed for user ATA, defaulting to create", checkError);
      createAtaInstruction = buildCreateAtaInstruction({
        payer: params.user,
        owner: params.user,
        mint: mintAddress,
      });
    }
  }

  const buyInstruction = await buySimple({
    user: params.user,
    mint: params.mint,
    tokenAmount: tokenAmountToBuy,
    maxSolCostLamports,
    feeRecipient,
    trackVolume: params.trackVolume,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });

  if (createAtaInstruction) {
    const instructionWithPrepend = Object.assign({}, buyInstruction) as Instruction & {
      prepend?: Instruction[];
    };
    instructionWithPrepend.prepend = [
      createAtaInstruction,
      ...(instructionWithPrepend.prepend ?? []),
    ];
    return instructionWithPrepend;
  }

  return buyInstruction;
}

export async function curveSell(params: CurveSellParams): Promise<Instruction> {
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const feeRecipient = params.feeRecipient ?? DEFAULT_FEE_RECIPIENT_ADDRESS;
  const rpcClient = params.rpc;
  const commitment = params.commitment ?? getDefaultCommitment();

  const { curve, fees } = await loadCurveState(params.mint, rpcClient, commitment, {
    curve: params.curveStateOverride,
    fees: params.feeStructureOverride,
  });

  if (curve.complete) {
    throw new Error("Token has migrated to the AMM. Use ammSell instead of curveSell.");
  }

  const creator = params.bondingCurveCreator
    ? toAddress(params.bondingCurveCreator)
    : curve.creator;

  const useWalletPercentage = params.useWalletPercentage ?? false;
  const mintAddress = toAddress(params.mint);
  let tokenAmountRaw: bigint;

  if (useWalletPercentage) {
    const percentage = params.walletPercentage ?? 100;
    const scaled = percentageToScaled(percentage);

    const [associatedUser] = await findAssociatedTokenPda({
      owner: toAddress(params.user.address),
      mint: mintAddress,
      tokenProgram: toAddress(TOKEN_PROGRAM_ID),
    });

    const balanceResponse = await rpcClient.getTokenAccountBalance(associatedUser).send();
    const rawBalance = BigInt(balanceResponse.value.amount);
    if (rawBalance === 0n) {
      throw new Error("Wallet token balance is zero; nothing to sell");
    }

    tokenAmountRaw = (rawBalance * scaled) / BigInt(PERCENTAGE_SCALE);
    if (tokenAmountRaw <= 0n) {
      tokenAmountRaw = 1n;
    }
  } else {
    if (params.tokenAmount === undefined) {
      throw new Error("tokenAmount is required when useWalletPercentage is false");
    }
    ensurePositiveNumber(params.tokenAmount, "tokenAmount");
    const decimals = params.tokenDecimals ?? 6;
    tokenAmountRaw = tokensToRaw(params.tokenAmount, decimals);
  }

  const quote = quoteSellForTokenAmount(curve, fees, tokenAmountRaw);
  const minSolOutputLamports = subSlippage(quote.solOutputLamports, slippageBps);

  if (minSolOutputLamports <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  return sellSimple({
    user: params.user,
    mint: params.mint,
    tokenAmountRaw,
    minSolOutputLamports,
    feeRecipient,
    bondingCurveCreator: creator,
    rpc: rpcClient,
    commitment,
  });
}


