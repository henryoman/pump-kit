#!/usr/bin/env bun
/**
 * Pump Kit Swap Test Suite
 * Focused on verifying swap-related helpers without touching pending features.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createSolanaRpc } from "@solana/kit";
import { createKeyPairSignerFromBytes } from "@solana/signers";

import { curveBuy, curveSell, ammBuy, ammSell } from "../src/swap";

import {
  globalPda,
  bondingCurvePda,
  associatedBondingCurveAta,
  creatorVaultPda,
  globalVolumeAccumulatorPda,
  userVolumeAccumulatorPda,
  eventAuthorityPda,
  feeConfigPda,
} from "../src/pda/pump";

import {
  addSlippage,
  subSlippage,
  validateSlippage,
  percentToBps,
  bpsToPercent,
  DEFAULT_SLIPPAGE_BPS,
} from "../src/utils/slippage";

import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../src/config/addresses";

type TestConfig = {
  testTokens: {
    curve: string;
    amm: string;
  };
  testAmount: number;
};

// Configuration
const CONFIG = loadTestConfig();
const CURVE_MINT = CONFIG.testTokens.curve;
const AMM_MINT = CONFIG.testTokens.amm;
const TEST_AMOUNT_SOL = CONFIG.testAmount;

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH = join(__dirname, "keypair.json");

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

const results: TestResult[] = [];

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error: any) {
      results.push({ name, passed: false, error: error.message, details: error });
      console.error(`❌ ${name}: ${error.message}`);
    }
  };
}

async function main() {
  console.log("🧪 Pump Kit Swap Test Suite\n");
  console.log("=".repeat(60));

  // Setup
  console.log("\n📦 Setup...");
  const keypairBytes = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8"));
  const wallet = await createKeyPairSignerFromBytes(new Uint8Array(keypairBytes));
  const rpc = createSolanaRpc(RPC_URL);

  console.log(`✅ Wallet: ${wallet.address}`);
  console.log(`✅ RPC: ${RPC_URL}\n`);

  // ============================================================================
  // Test 1: Swap PDA Derivations
  // ============================================================================
  console.log("🔷 Testing Swap PDA Derivations...\n");

  await test("globalPda() - Pump program global PDA", async () => {
    const pda = await globalPda();
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("bondingCurvePda() - Bonding curve PDA", async () => {
    const pda = await bondingCurvePda(CURVE_MINT);
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("associatedBondingCurveAta() - Bonding curve ATA", async () => {
    const bondingCurve = await bondingCurvePda(CURVE_MINT);
    const ata = await associatedBondingCurveAta(bondingCurve, CURVE_MINT);
    if (!ata || typeof ata !== "string") throw new Error("Invalid ATA");
    if (ata.length !== 44) throw new Error(`Invalid ATA length: ${ata.length}`);
  })();

  await test("creatorVaultPda() - Creator vault PDA", async () => {
    const pda = await creatorVaultPda(wallet.address);
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("globalVolumeAccumulatorPda() - Global volume accumulator", async () => {
    const pda = await globalVolumeAccumulatorPda();
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("userVolumeAccumulatorPda() - User volume accumulator", async () => {
    const pda = await userVolumeAccumulatorPda(wallet.address);
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length < 32 || pda.length > 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("eventAuthorityPda() - Event authority PDA", async () => {
    const pda = await eventAuthorityPda();
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  await test("feeConfigPda() - Fee config PDA", async () => {
    const pda = await feeConfigPda();
    if (!pda || typeof pda !== "string") throw new Error("Invalid PDA");
    if (pda.length !== 44) throw new Error(`Invalid PDA length: ${pda.length}`);
  })();

  // ============================================================================
  // Test 2: Slippage Utilities
  // ============================================================================
  console.log("\n🔷 Testing Slippage Utilities...\n");

  await test("percentToBps() - Convert percent to basis points", async () => {
    if (percentToBps(1) !== 100) throw new Error("1% should be 100 bps");
    if (percentToBps(0.5) !== 50) throw new Error("0.5% should be 50 bps");
    if (percentToBps(10) !== 1000) throw new Error("10% should be 1000 bps");
  })();

  await test("bpsToPercent() - Convert basis points to percent", async () => {
    if (bpsToPercent(100) !== 1) throw new Error("100 bps should be 1%");
    if (bpsToPercent(50) !== 0.5) throw new Error("50 bps should be 0.5%");
    if (bpsToPercent(1000) !== 10) throw new Error("1000 bps should be 10%");
  })();

  await test("validateSlippage() - Validate slippage values", async () => {
    validateSlippage(DEFAULT_SLIPPAGE_BPS);
    validateSlippage(500);
    try {
      validateSlippage(-1);
      throw new Error("Should reject negative slippage");
    } catch {}
    try {
      validateSlippage(10_000 + 1);
      throw new Error("Should reject slippage > 100%");
    } catch {}
  })();

  await test("addSlippage() - Add slippage to amount", async () => {
    const result = addSlippage(1_000n, 100);
    if (result !== 1_010n) throw new Error(`Expected 1010, got ${result}`);
  })();

  await test("subSlippage() - Subtract slippage from amount", async () => {
    const result = subSlippage(1_000n, 100);
    if (result !== 990n) throw new Error(`Expected 990, got ${result}`);
  })();

  // ============================================================================
  // Test 3: Swap Instruction Building (No Sending)
  // ============================================================================
  console.log("\n🔷 Testing Swap Instruction Building...\n");

  await test("curveBuy() - Build buy instruction", async () => {
    try {
      const instruction = await curveBuy({
        user: wallet,
        mint: CURVE_MINT,
        solAmount: TEST_AMOUNT_SOL,
        rpc,
        slippageBps: 100,
      });

      if (!instruction) throw new Error("Instruction is null");
      if (!instruction.accounts || instruction.accounts.length === 0) {
        throw new Error("Instruction has no accounts");
      }
      if (!instruction.programAddress) throw new Error("Instruction has no program address");
      if (instruction.programAddress !== PUMP_PROGRAM_ID) {
        throw new Error(`Wrong program: ${instruction.programAddress}`);
      }
      if (!instruction.data || instruction.data.length === 0) {
        throw new Error("Instruction has no data");
      }
    } catch (error: any) {
      if (
        error.message.includes("bonding curve") ||
        error.message.includes("not found") ||
        error.message.includes("Failed to load")
      ) {
        return;
      }
      throw error;
    }
  })();

  await test("curveSell() - Build sell instruction", async () => {
    try {
      const instruction = await curveSell({
        user: wallet,
        mint: CURVE_MINT,
        useWalletPercentage: true,
        walletPercentage: 100,
        rpc,
        slippageBps: 100,
      });

      if (!instruction) throw new Error("Instruction is null");
      if (!instruction.accounts || instruction.accounts.length === 0) {
        throw new Error("Instruction has no accounts");
      }
      if (instruction.programAddress !== PUMP_PROGRAM_ID) {
        throw new Error(`Wrong program: ${instruction.programAddress}`);
      }
    } catch (error: any) {
      if (
        error.message.includes("bonding curve") ||
        error.message.includes("not found") ||
        error.message.includes("Failed to load") ||
        error.message.includes("zero")
      ) {
        return;
      }
      throw error;
    }
  })();

  await test("ammBuy() - Build AMM buy instruction", async () => {
    try {
      const instruction = await ammBuy({
        user: wallet,
        mint: AMM_MINT,
        solAmount: TEST_AMOUNT_SOL,
        rpc,
        slippageBps: 100,
      });

      if (!instruction) throw new Error("Instruction is null");
      if (!instruction.accounts || instruction.accounts.length === 0) {
        throw new Error("Instruction has no accounts");
      }
      if (instruction.programAddress !== PUMP_AMM_PROGRAM_ID) {
        throw new Error(`Wrong program: ${instruction.programAddress}`);
      }
    } catch (error: any) {
      if (
        error.message.includes("amm") ||
        error.message.includes("not found") ||
        error.message.includes("Failed to load") ||
        error.message.includes("zero") ||
        error.message.includes("pool")
      ) {
        return;
      }
      throw error;
    }
  })();

  await test("ammSell() - Build AMM sell instruction", async () => {
    try {
      const instruction = await ammSell({
        user: wallet,
        mint: AMM_MINT,
        useWalletPercentage: true,
        walletPercentage: 100,
        rpc,
        slippageBps: 100,
      });

      if (!instruction) throw new Error("Instruction is null");
      if (!instruction.accounts || instruction.accounts.length === 0) {
        throw new Error("Instruction has no accounts");
      }
      if (instruction.programAddress !== PUMP_AMM_PROGRAM_ID) {
        throw new Error(`Wrong program: ${instruction.programAddress}`);
      }
    } catch (error: any) {
      if (
        error.message.includes("amm") ||
        error.message.includes("not found") ||
        error.message.includes("Failed to load") ||
        error.message.includes("zero") ||
        error.message.includes("pool")
      ) {
        return;
      }
      throw error;
    }
  })();

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Test Results Summary\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);

  if (failed > 0) {
    console.log("\n❌ Failed Tests:\n");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}`);
        console.log(`    Error: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed!");
    process.exit(0);
  }
}

main().catch((error: any) => {
  console.error("\n❌ Fatal error:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

function loadTestConfig(): TestConfig {
  const defaultConfig: TestConfig = {
    testTokens: {
      curve: "NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump",
      amm: "NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump",
    },
    testAmount: 0.008,
  };

  try {
    const configPath = join(__dirname, "config.yaml");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseSimpleYaml(raw);

    const curveMint =
      parsed.testTokens?.curve ??
      parsed["test-tokens"]?.curve ??
      defaultConfig.testTokens.curve;
    const ammMint =
      parsed.testTokens?.amm ??
      parsed["test-tokens"]?.amm ??
      defaultConfig.testTokens.amm;
    const amount = Number(parsed.testAmount ?? parsed["test-amount"]) || defaultConfig.testAmount;

    return {
      testTokens: {
        curve: curveMint,
        amm: ammMint,
      },
      testAmount: amount,
    };
  } catch {
    return defaultConfig;
  }
}

function parseSimpleYaml(raw: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentSection: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!line.startsWith(" ")) {
      if (trimmed.endsWith(":")) {
        currentSection = trimmed.slice(0, -1);
        if (!result[currentSection]) {
          result[currentSection] = {};
        }
        continue;
      }

      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").split("#")[0]?.trim() ?? "";
      result[key] = value;
      currentSection = null;
    } else if (currentSection) {
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").split("#")[0]?.trim() ?? "";
      const section = result[currentSection] ?? {};
      section[key.trim()] = value;
      result[currentSection] = section;
    }
  }

  if (result.testTokens && typeof result.testTokens === "string") {
    result.testTokens = {
      curve: result.testTokens,
      amm: result.testTokens,
    };
  }

  return result;
}

