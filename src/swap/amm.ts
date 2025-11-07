import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { address as toAddress } from "@solana/kit";

import {
  ammBuy as buildAmmBuy,
  ammSell as buildAmmSell,
} from "../clients/amm";
import { bondingCurvePda } from "../pda/pump";
import { fetchBondingCurve } from "../pumpsdk/generated/accounts/bondingCurve";
import type { RpcClient } from "../config/connection";
import { getDefaultCommitment } from "../config/commitment";
import { solToLamports, tokensToRaw } from "../utils/amounts";
import {
  DEFAULT_SLIPPAGE_BPS,
  addSlippage,
  subSlippage,
  validateSlippage,
} from "../utils/slippage";
import { WSOL_ADDRESS } from "../utils/wsol";
import { poolPda, poolTokenAta, globalConfigPda } from "../pda/pumpAmm";
import { fetchPool } from "../ammsdk/generated/accounts/pool";
import { fetchGlobalConfig } from "../ammsdk/generated/accounts/globalConfig";
import { TOKEN_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "../pda/ata";
import { buildCreateAtaInstruction } from "../utils/ata";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

type AmmBaseParams = {
  user: TransactionSigner;
  mint: Address | string;
  rpc: RpcClient;
  commitment?: CommitmentLevel;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  poolIndex?: number;
  quoteMint?: Address | string;
  allowTrackVolume?: boolean;
};

export type AmmBuyParams = AmmBaseParams & {
  /** SOL budget (before slippage), expressed in SOL. */
  solAmount: number;
  /** Optional slippage tolerance applied to the SOL budget (default 0.5%). */
  slippageBps?: number;
};

export type AmmSellParams = AmmBaseParams & {
  /** Human-readable token amount to sell. */
  tokenAmount?: number;
  /** Optional decimals for the token (defaults to 6). */
  tokenDecimals?: number;
  /** Optional slippage tolerance applied to the SOL output floor (default 0.5%). */
  slippageBps?: number;
  /** Sell percentage of the wallet balance instead of a fixed amount. */
  useWalletPercentage?: boolean;
  /** Percentage of the wallet balance to sell (0-100]. */
  walletPercentage?: number;
};

const TOKEN_PROGRAM_ADDRESS = toAddress(TOKEN_PROGRAM_ID);
const BPS_DENOMINATOR = 10_000n;
const PERCENTAGE_SCALE = 10_000n;

const ensurePositiveNumber = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
};

const resolveQuoteMint = (quoteMint?: Address | string): Address =>
  toAddress(quoteMint ?? WSOL_ADDRESS);

export async function ammBuy(params: AmmBuyParams): Promise<Instruction> {
  ensurePositiveNumber(params.solAmount, "solAmount");

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const commitment = params.commitment ?? getDefaultCommitment();
  const quoteMint = resolveQuoteMint(params.quoteMint);
  const mintAddress = toAddress(params.mint);

  const solBudgetLamports = solToLamports(params.solAmount);

  const context = await resolvePoolContext({
    rpc: params.rpc,
    mint: mintAddress,
    quoteMint,
    commitment,
    poolAddress: params.poolAddress,
    poolCreator: params.poolCreator,
    poolIndex: params.poolIndex,
  });

  const totalFeeBps = computeTotalFeeBps(context.globalConfigData);
  const netQuoteIn = applyInputFees(solBudgetLamports, totalFeeBps);
  if (netQuoteIn <= 0n) {
    throw new Error("Effective quote input after fees is zero");
  }

  let tokenAmountOut = computeTokensOut(netQuoteIn, context.baseReserve, context.quoteReserve);
  if (tokenAmountOut <= 0n) {
    throw new Error("SOL amount is too small to purchase any tokens from the AMM");
  }
  if (tokenAmountOut >= context.baseReserve) {
    tokenAmountOut = context.baseReserve - 1n;
  }
  if (tokenAmountOut <= 0n) {
    throw new Error("AMM pool does not have enough base liquidity for this trade");
  }

  let quoteRequired = computeQuoteForTokens(tokenAmountOut, context.quoteReserve, context.baseReserve, totalFeeBps);
  while (quoteRequired > solBudgetLamports && tokenAmountOut > 0n) {
    tokenAmountOut -= 1n;
    quoteRequired = computeQuoteForTokens(tokenAmountOut, context.quoteReserve, context.baseReserve, totalFeeBps);
  }

  if (tokenAmountOut <= 0n || quoteRequired <= 0n) {
    throw new Error("Unable to satisfy AMM buy with the provided SOL budget");
  }

  const maxQuoteIn = addSlippage(quoteRequired, slippageBps);

  const { createInstruction } = await ensureUserAta({
    rpc: params.rpc,
    owner: params.user,
    mint: mintAddress,
  });

  const instruction = await buildAmmBuy({
    user: params.user,
    baseMint: mintAddress,
    quoteMint,
    tokenAmountOut,
    maxQuoteIn,
    poolAddress: context.poolAddress,
    poolCreator: context.poolCreator,
    index: Number(context.poolData.index),
    allowTrackVolume: params.allowTrackVolume,
    rpc: params.rpc,
    commitment,
  });

  if (createInstruction) {
    const instructionWithPrepend = Object.assign({}, instruction) as Instruction & {
      prepend?: Instruction[];
    };
    instructionWithPrepend.prepend = [
      createInstruction,
      ...(instructionWithPrepend.prepend ?? []),
    ];
    return instructionWithPrepend;
  }

  return instruction;
}

export async function ammSell(params: AmmSellParams): Promise<Instruction> {
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  validateSlippage(slippageBps);

  const commitment = params.commitment ?? getDefaultCommitment();
  const quoteMint = resolveQuoteMint(params.quoteMint);
  const mintAddress = toAddress(params.mint);

  const context = await resolvePoolContext({
    rpc: params.rpc,
    mint: mintAddress,
    quoteMint,
    commitment,
    poolAddress: params.poolAddress,
    poolCreator: params.poolCreator,
    poolIndex: params.poolIndex,
  });

  const tokenAmountRaw = await resolveTokenAmountRaw({
    params,
    rpc: params.rpc,
    mint: mintAddress,
  });

  if (tokenAmountRaw <= 0n) {
    throw new Error("Token amount must be positive");
  }
  if (tokenAmountRaw >= context.baseReserve) {
    throw new Error("Token amount exceeds available AMM base liquidity");
  }

  const totalFeeBps = computeTotalFeeBps(context.globalConfigData);
  const netBaseIn = applyInputFees(tokenAmountRaw, totalFeeBps);
  if (netBaseIn <= 0n) {
    throw new Error("Effective base input after fees is zero");
  }

  const quoteOut = computeQuoteOut(netBaseIn, context.baseReserve, context.quoteReserve);
  if (quoteOut <= 0n) {
    throw new Error("AMM pool produced zero quote output");
  }

  const minQuoteOut = subSlippage(quoteOut, slippageBps);
  if (minQuoteOut <= 0n) {
    throw new Error("Slippage settings would result in zero SOL output");
  }

  return buildAmmSell({
    user: params.user,
    baseMint: mintAddress,
    quoteMint,
    tokenAmountIn: tokenAmountRaw,
    minQuoteOut,
    poolAddress: context.poolAddress,
    poolCreator: context.poolCreator,
    index: Number(context.poolData.index),
    allowTrackVolume: params.allowTrackVolume,
    rpc: params.rpc,
    commitment,
  });
}

type PoolContext = Awaited<ReturnType<typeof resolvePoolState>> & {
  baseReserve: bigint;
  quoteReserve: bigint;
};

const DEFAULT_POOL_SCAN_LIMIT = 8;

async function resolvePoolContext(params: {
  rpc: RpcClient;
  mint: Address;
  quoteMint: Address;
  commitment: CommitmentLevel;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  poolIndex?: number;
}): Promise<PoolContext> {
  const { poolAccount, globalConfigAccount, poolAddress, poolCreator } = await loadPoolAccounts(params);
  const [baseAta, quoteAta] = await Promise.all([
    poolTokenAta(poolAddress, params.mint, TOKEN_PROGRAM_ADDRESS),
    poolTokenAta(poolAddress, params.quoteMint, TOKEN_PROGRAM_ADDRESS),
  ]);

  const reserves = await fetchPoolReserves(params.rpc, baseAta, quoteAta);

  return {
    poolAddress,
    poolCreator,
    poolData: poolAccount.data,
    globalConfigData: globalConfigAccount.data,
    baseReserve: reserves.baseReserve,
    quoteReserve: reserves.quoteReserve,
  };
}

async function resolvePoolState(params: {
  rpc: RpcClient;
  mint: Address;
  quoteMint: Address;
  commitment: CommitmentLevel;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  poolIndex?: number;
}) {
  const { poolAccount, globalConfigAccount, poolAddress, poolCreator } = await loadPoolAccounts(params);

  return {
    poolAddress,
    poolCreator,
    poolData: poolAccount.data,
    globalConfigData: globalConfigAccount.data,
  } as const;
}

async function loadPoolAccounts(params: {
  rpc: RpcClient;
  mint: Address;
  quoteMint: Address;
  commitment: CommitmentLevel;
  poolAddress?: Address | string;
  poolCreator?: Address | string;
  poolIndex?: number;
}) {
  const { rpc, mint, quoteMint, commitment } = params;
  let resolvedPoolCreator = params.poolCreator ? toAddress(params.poolCreator) : undefined;
  let resolvedPoolAddress = params.poolAddress ? toAddress(params.poolAddress) : undefined;

  if (!resolvedPoolCreator) {
    try {
      const curveAddress = await bondingCurvePda(mint);
      const curveAccount = await fetchBondingCurve(rpc, curveAddress, { commitment });
      resolvedPoolCreator = curveAccount.data.creator;
    } catch {
      resolvedPoolCreator = undefined;
    }
  }

  const globalConfigAddress = await globalConfigPda();

  let poolAccount: Awaited<ReturnType<typeof fetchPool>> | null = null;
  let poolAddrCandidate = resolvedPoolAddress;

  const tryFetchPool = async (address: Address) => {
    try {
      const account = await fetchPool(rpc, address, { commitment });
      return account;
    } catch (error) {
      if (isAccountNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  };

  if (poolAddrCandidate) {
    poolAccount = await tryFetchPool(poolAddrCandidate);
  }

  if (!poolAccount) {
    if (!resolvedPoolCreator) {
      throw new Error(
        "Unable to resolve AMM pool: provide poolCreator or poolAddress explicitly for this mint"
      );
    }

    const indices = params.poolIndex !== undefined
      ? [params.poolIndex]
      : Array.from({ length: DEFAULT_POOL_SCAN_LIMIT }, (_, i) => i);

    for (const index of indices) {
      const candidateAddress = await poolPda(index, resolvedPoolCreator, mint, quoteMint);
      const candidateAccount = await tryFetchPool(candidateAddress);
      if (candidateAccount) {
        poolAddrCandidate = candidateAddress;
        poolAccount = candidateAccount;
        break;
      }
    }
  }

  if (!poolAccount || !poolAddrCandidate) {
    throw new Error(
      `Unable to locate AMM pool for mint ${mint}. Provide poolAddress or poolIndex explicitly.`
    );
  }

  const globalConfigAccount = await fetchGlobalConfig(rpc, globalConfigAddress, { commitment });

  if (!resolvedPoolCreator) {
    resolvedPoolCreator = poolAccount.data.creator;
  }

  return {
    poolAccount,
    globalConfigAccount,
    poolAddress: poolAddrCandidate,
    poolCreator: resolvedPoolCreator,
  } as const;
}

function isAccountNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  if (message.includes("account not found")) {
    return true;
  }
  const contextCode = (error as any)?.context?.__code;
  return contextCode === 4100 /* custom code used by solana rpc for missing accounts */;
}

async function fetchPoolReserves(rpc: RpcClient, baseAccount: Address, quoteAccount: Address) {
  const [baseBalance, quoteBalance] = await Promise.all([
    rpc.getTokenAccountBalance(baseAccount).send(),
    rpc.getTokenAccountBalance(quoteAccount).send(),
  ]);

  return {
    baseReserve: BigInt(baseBalance.value.amount),
    quoteReserve: BigInt(quoteBalance.value.amount),
  } as const;
}

function computeTotalFeeBps(globalConfig: Awaited<ReturnType<typeof fetchGlobalConfig>>["data"]) {
  return (
    BigInt(globalConfig.lpFeeBasisPoints) +
    BigInt(globalConfig.protocolFeeBasisPoints) +
    BigInt(globalConfig.coinCreatorFeeBasisPoints)
  );
}

function applyInputFees(amount: bigint, totalFeeBps: bigint): bigint {
  const feeDenominator = BPS_DENOMINATOR - totalFeeBps;
  if (feeDenominator <= 0n) {
    return 0n;
  }
  return (amount * feeDenominator) / BPS_DENOMINATOR;
}

function computeTokensOut(netQuoteIn: bigint, baseReserve: bigint, quoteReserve: bigint): bigint {
  const denominator = quoteReserve + netQuoteIn;
  if (denominator <= 0n) {
    throw new Error("Invalid AMM reserves (denominator is zero)");
  }
  return (netQuoteIn * baseReserve) / denominator;
}

function computeQuoteForTokens(
  tokenAmountOut: bigint,
  quoteReserve: bigint,
  baseReserve: bigint,
  totalFeeBps: bigint
): bigint {
  if (tokenAmountOut <= 0n) {
    return 0n;
  }
  if (tokenAmountOut >= baseReserve) {
    throw new Error("Requested token amount exceeds pool reserves");
  }

  const netQuoteIn = (tokenAmountOut * quoteReserve) / (baseReserve - tokenAmountOut);
  if (netQuoteIn <= 0n) {
    return 0n;
  }

  const feeDenominator = BPS_DENOMINATOR - totalFeeBps;
  if (feeDenominator <= 0n) {
    throw new Error("Invalid AMM fee configuration");
  }

  return (netQuoteIn * BPS_DENOMINATOR + (feeDenominator - 1n)) / feeDenominator;
}

function computeQuoteOut(netBaseIn: bigint, baseReserve: bigint, quoteReserve: bigint): bigint {
  const denominator = baseReserve + netBaseIn;
  if (denominator <= 0n) {
    throw new Error("Invalid AMM reserves (denominator is zero)");
  }
  return (netBaseIn * quoteReserve) / denominator;
}

async function ensureUserAta({
  rpc,
  owner,
  mint,
}: {
  rpc: RpcClient;
  owner: TransactionSigner;
  mint: Address;
}) {
  const [userAta] = await findAssociatedTokenPda({
    owner: toAddress(owner.address),
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  let createInstruction: Instruction | undefined;
  try {
    const accountInfo = await rpc.getAccountInfo(userAta).send();
    if (!accountInfo.value) {
      createInstruction = buildCreateAtaInstruction({
        payer: owner,
        owner,
        mint,
      });
    }
  } catch {
    createInstruction = buildCreateAtaInstruction({
      payer: owner,
      owner,
      mint,
    });
  }

  return { userAta, createInstruction } as const;
}

async function resolveTokenAmountRaw({
  params,
  rpc,
  mint,
}: {
  params: AmmSellParams;
  rpc: RpcClient;
  mint: Address;
}) {
  const useWalletPercentage = params.useWalletPercentage ?? false;
  const decimals = params.tokenDecimals ?? 6;

  if (useWalletPercentage) {
    const percentage = params.walletPercentage ?? 100;
    const scaled = percentageToScaled(percentage);

    const balance = await fetchUserTokenBalance(rpc, params.user, mint);
    if (balance === 0n) {
      throw new Error("Wallet token balance is zero; nothing to sell");
    }

    let amount = (balance * scaled) / PERCENTAGE_SCALE;
    if (amount <= 0n) {
      amount = 1n;
    }
    return amount;
  }

  if (params.tokenAmount === undefined) {
    throw new Error("tokenAmount is required when useWalletPercentage is false");
  }
  ensurePositiveNumber(params.tokenAmount, "tokenAmount");
  return tokensToRaw(params.tokenAmount, decimals);
}

async function fetchUserTokenBalance(
  rpc: RpcClient,
  user: TransactionSigner,
  mint: Address
): Promise<bigint> {
  const [userAta] = await findAssociatedTokenPda({
    owner: toAddress(user.address),
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const accountInfo = await rpc.getTokenAccountBalance(userAta).send();
  return BigInt(accountInfo.value.amount);
}

function percentageToScaled(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("walletPercentage must be between 0 and 100");
  }
  return BigInt(Math.round(percentage * 100));
}

