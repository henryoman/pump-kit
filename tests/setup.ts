/**
 * Test setup and utilities for Pump Kit testing.
 * This file provides common test helpers and configuration.
 */

import { createSolanaRpc } from "@solana/kit";
import type { TransactionSigner } from "@solana/kit";
import { generateKeyPairSigner } from "@solana/signers";

const RPC_URL = process.env.SOLANA_RPC;

function createMockRpc() {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, property) {
      if (property === Symbol.toStringTag) return undefined;
      if (property === "toString") {
        return () => "[MockSolanaRpc]";
      }

      return () => ({
        async send() {
          throw new Error(
            `Mock RPC cannot perform \`${String(
              property
            )}\`. Set SOLANA_RPC to run network-dependent integration tests.`
          );
        },
      });
    },
  };

  return new Proxy({}, handler);
}

export function getTestRpc() {
  if (RPC_URL) {
    return createSolanaRpc(RPC_URL);
  }

  console.warn(
    "⚠️  SOLANA_RPC not set; using mock RPC stub for deterministic integration tests."
  );
  return createMockRpc();
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
  if (!RPC_URL) {
    console.warn(
      "⚠️  Skipping test: SOLANA_RPC not configured for live RPC validation."
    );
    return true;
  }
  return false;
}
