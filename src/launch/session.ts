import { createLaunchLookupTable } from "./lookup_table";
import { address, createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import type { RpcClient, RpcSubscriptionsClient } from "../config/connection";
import { assertMintSigner, createV2, mintAuthorityPda } from "../clients/create_v2";
import { buyExactQuoteInV2 } from "../clients/trade_v2";
import { fetchGlobal, type Global } from "../pumpsdk/generated/accounts/global";
import { fetchFeeConfig, type FeeConfig } from "../pumpsdk/generated/accounts/feeConfig";
import { bondingCurvePda, globalPda, feeConfigPda, holderRewardsPda } from "../pda/pump";
import { findAssociatedTokenPda } from "../pda/ata";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";
import { quoteBuyWithSolAmount } from "../ammsdk/bondingCurveMath";
import { solToLamports } from "../utils/amounts";
import { subSlippage } from "../utils/slippage";
import { buildCreateAtaInstruction } from "../utils/ata";
import { buildPriorityFeeInstructions, sendAndConfirmTransaction, simulateTransaction, TransactionExecutionError } from "../utils/transaction";
import type { PriorityFeeOptions, SendOptions } from "../utils/transaction";
import { validateLaunchConfig } from "./config";

export interface LaunchRecord {
  mint: string;
  status: "prepared" | "submitted" | "confirmed" | "failed";
  signature?: string;
  latestBlockhash?: string;
  lastValidBlockHeight?: string;
}

export interface PrepareLaunchOptions {
  signer: TransactionSigner;
  /** Required signer for the caller's pre-generated token address. */
  mint: TransactionSigner;
  /** Optional CA guard; requires a mint signer with this exact address. */
  expectedMint?: Address | string;
  addressLookupTables?: Record<string, readonly Address[]>;
  priorityFees?: PriorityFeeOptions;
  /** Included in both simulation and submission, before/after launch instructions. */
  prependInstructions?: readonly Instruction[];
  appendInstructions?: readonly Instruction[];
  /** Persist this record durably; a rejected write prevents broadcast. */
  saveRecord?: (record: LaunchRecord) => Promise<void>;
}

function initialFees(global: Global, config: FeeConfig) {
  if (config.feeTiers.length === 0) throw new Error("SOL fee tiers are empty");
  const cap = global.tokenTotalSupply * global.initialVirtualSolReserves / global.initialVirtualTokenReserves;
  const tiers = [...config.feeTiers].sort((a, b) => a.marketCapLamportsThreshold < b.marketCapLamportsThreshold ? -1 : a.marketCapLamportsThreshold > b.marketCapLamportsThreshold ? 1 : 0);
  let fees = tiers[0]!.fees;
  for (const tier of tiers) if (cap >= tier.marketCapLamportsThreshold) fees = tier.fees;
  return { ...fees, lpFeeBps: 0n };
}

export interface CreatePumpOptions {
  rpcUrl?: string;
  rpc?: RpcClient;
  rpcSubscriptions?: RpcSubscriptionsClient;
  websocketUrl?: string;
}

export function createPump(options: CreatePumpOptions = {}) {
  const rpcUrl = options.rpcUrl ?? "https://api.devnet.solana.com";
  const rpc = options.rpc ?? createSolanaRpc(rpcUrl);
  const websocket = new URL(rpcUrl);
  websocket.protocol = websocket.protocol === "https:" ? "wss:" : "ws:";
  if (["localhost", "127.0.0.1", "[::1]"].includes(websocket.hostname) && websocket.port) websocket.port = String(Number(websocket.port) + 1);
  const subscriptions = options.rpcSubscriptions ?? createSolanaRpcSubscriptions(options.websocketUrl ?? websocket.toString());
  return {
    launch: {
      validate: validateLaunchConfig,
      async prepare(value: unknown, prepareOptions: PrepareLaunchOptions) {
        const config = validateLaunchConfig(value);
        const mint = prepareOptions.mint;
        assertMintSigner(mint);
        if (prepareOptions.expectedMint !== undefined && mint.address !== address(prepareOptions.expectedMint)) {
          throw new Error("expectedMint requires a mint signer with the matching address");
        }
        const priorityFees = prepareOptions.priorityFees ? { ...prepareOptions.priorityFees } : undefined;
        const priorityInstructions = buildPriorityFeeInstructions(priorityFees);
        const signer = prepareOptions.signer;
        const creatorInput = address(config.creatorFees?.recipient ?? signer.address);
        const holderReward = config.creatorFees?.holderReward ?? false;
        // create_v2 overrides the curve's creator in holder-reward mode. The
        // first buy must use that PDA's vault, rather than the wallet's vault.
        const creator = holderReward ? await holderRewardsPda(mint.address) : creatorInput;
        const global = (await fetchGlobal(rpc, await globalPda())).data;
        if (!global.createV2Enabled) throw new Error("create_v2 is disabled by the program");
        if (holderReward && !global.isHolderRewardEnabled) throw new Error("Holder reward creation is disabled by the program");
        const creation = await createV2({ user: signer, mint, name: config.token.name, symbol: config.token.symbol,
          uri: config.token.metadataUri, creator: creatorInput, holderReward });
        const instructions: Instruction[] = [creation];
        const [curve, authority, [userAta]] = await Promise.all([
          bondingCurvePda(mint.address), mintAuthorityPda(),
          findAssociatedTokenPda({ owner: signer.address, mint: mint.address, tokenProgram: address(TOKEN_2022_PROGRAM_ID) }),
        ]);
        let firstBuy: { quoteAmountLamports: bigint; expectedTokenOutputRaw: bigint; minTokenOutputRaw: bigint; slippageBps: number; feeRecipient: string; buybackFeeRecipient: string } | undefined;
        if (config.firstBuy) {
          const feeConfig = (await fetchFeeConfig(rpc, await feeConfigPda())).data;
          const quoteAmountLamports = solToLamports(config.firstBuy.amount);
          const fees = initialFees(global, feeConfig);
          const quote = quoteBuyWithSolAmount({ virtualTokenReserves: global.initialVirtualTokenReserves,
            virtualQuoteReserves: global.initialVirtualSolReserves, realTokenReserves: global.initialRealTokenReserves,
            realQuoteReserves: 0n, creator, complete: false }, fees, quoteAmountLamports);
          const slippageBps = config.firstBuy.slippageBps!;
          const minTokenOutputRaw = subSlippage(quote.tokenAmount, slippageBps);
          if (minTokenOutputRaw <= 0n) throw new Error("First buy has no positive minimum token output");
          const feeRecipient = global.feeRecipient;
          const buybackFeeRecipient = global.buybackFeeRecipients.find(recipient => recipient !== address("11111111111111111111111111111111"));
          if (!buybackFeeRecipient) throw new Error("No configured buyback fee recipient");
          instructions.push(await buildCreateAtaInstruction({ payer: signer, owner: signer, mint: mint.address, tokenProgram: TOKEN_2022_PROGRAM_ID }));
          instructions.push(await buyExactQuoteInV2({ user: signer, mint: mint.address, rpc, bondingCurveCreator: creator,
            baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
            feeRecipient, buybackFeeRecipient, quoteAmountRaw: quoteAmountLamports, minTokenOutputRaw }));
          firstBuy = { quoteAmountLamports, expectedTokenOutputRaw: quote.tokenAmount, minTokenOutputRaw, slippageBps, feeRecipient, buybackFeeRecipient };
        }
        instructions.unshift(...priorityInstructions, ...(prepareOptions.prependInstructions ?? []));
        instructions.push(...(prepareOptions.appendInstructions ?? []));
        let record: LaunchRecord = { mint: mint.address, status: "prepared" };
        await prepareOptions.saveRecord?.({ ...record });
        let sending = false;
        const tables: Record<string, readonly Address[]> = Object.fromEntries(
          Object.entries(prepareOptions.addressLookupTables ?? {}).map(([table, addresses]) => [table, Object.freeze([...addresses])]),
        );
        let setupPromise: Promise<void> | undefined;
        const setup = async () => {
          if (!firstBuy || Object.keys(tables).length) return;
          setupPromise ??= (async () => {
            const table = await createLaunchLookupTable({ instructions, signer, rpc, rpcSubscriptions: subscriptions, priorityFees });
            tables[table.address] = Object.freeze([...table.addresses]);
          })();
          await setupPromise;
        };
        const transactionParams = { instructions, payer: signer, additionalSigners: [mint], rpc, version: 0 as const, addressLookupTables: tables };
        return {
          addresses: Object.freeze({ mint: mint.address, bondingCurve: curve, mintAuthority: authority, userAta }),
          preview: Object.freeze({ config, tokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID,
            tokenDecimals: 6, creator, creatorFeeRecipient: holderReward ? "holders" : creator,
            holderReward, mayhemMode: false, cashback: false, firstBuy,
            lookupTableSetupRequired: !!firstBuy && !Object.keys(tables).length,
            instructionCount: instructions.length, rentAndTransactionFeesIncludedInBudget: false }),
          instructions: Object.freeze(instructions),
          get record() { return { ...record }; },
          setup,
          get addressLookupTables() { return { ...tables }; },
          simulate: () => {
            if (firstBuy && !Object.keys(tables).length) {
              throw new Error("Atomic first-buy simulation requires an active lookup table; call launch.setup() or supply addressLookupTables");
            }
            return simulateTransaction({ ...transactionParams, options: { sigVerify: true } });
          },
          async send(sendOptions?: SendOptions) {
            if (sending || record.status !== "prepared") throw new Error("Launch already submitted or in progress; reconcile its signature before retrying");
            sending = true;
            try {
              await setup();
              const result = await sendAndConfirmTransaction({ ...transactionParams, rpcSubscriptions: subscriptions, sendOptions,
                onSigned: async identity => {
                  record = { mint: mint.address, status: "submitted", ...identity, lastValidBlockHeight: identity.lastValidBlockHeight.toString() };
                  await prepareOptions.saveRecord?.({ ...record });
                },
              });
              record = { ...record, status: "confirmed" };
              await prepareOptions.saveRecord?.({ ...record });
              return result;
            } catch (error) {
              if (error instanceof TransactionExecutionError && error.outcome === "failed") {
                record = { ...record, status: "failed" };
                await prepareOptions.saveRecord?.({ ...record });
              }
              throw error;
            } finally { sending = false; }
          },
        };
      },
    },
  };
}

export type LaunchSession = Awaited<ReturnType<ReturnType<typeof createPump>["launch"]["prepare"]>>;
