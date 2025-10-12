/**
 * Test setup and utilities for Pump Kit testing.
 * This file provides common test helpers and configuration.
 */

import { createSolanaRpc } from "@solana/kit";
import type { TransactionSigner, Address } from "@solana/kit";
import { generateKeyPairSigner } from "@solana/signers";

const RPC_URL = process.env.SOLANA_RPC;

if (!RPC_URL) {
  throw new Error("SOLANA_RPC must be set to run Pump Kit integration tests");
}

export function getTestRpc() {
  return createSolanaRpc(RPC_URL);
}

/**
 * Create a test wallet with some SOL
 */
export async function createTestWallet(): Promise<TransactionSigner> {
  return await generateKeyPairSigner();
}

/**
 * Wait for a specified amount of time (useful for rate limiting)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if we're running in CI environment
 */
export function isCIEnvironment(): boolean {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

/**
 * Skip test if we're not in the right environment
 */
export function skipIfNoRpc() {
  if (!process.env.SOLANA_RPC && !process.env.SOLANA_CLUSTER) {
    console.warn("⚠️  Skipping test: No RPC endpoint configured");
    return true;
  }
  return false;
}
