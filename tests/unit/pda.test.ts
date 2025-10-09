/**
 * Unit tests for PDA derivation.
 * These tests verify PDAs are derived correctly without network calls.
 */

import { describe, test, expect } from "bun:test";
import { address } from "@solana/kit";
import { globalPda, bondingCurvePda, creatorVaultPda } from "../../src/pda/pump";

describe("Pump PDAs", () => {
  describe("globalPda", () => {
    test("derives consistent global PDA", async () => {
      const pda1 = await globalPda();
      const pda2 = await globalPda();
      expect(pda1).toBe(pda2);
    });

    test("returns a valid address", async () => {
      const pda = await globalPda();
      expect(typeof pda).toBe("string");
      expect(pda.length).toBeGreaterThan(0);
    });
  });

  describe("bondingCurvePda", () => {
    test("derives consistent bonding curve PDA for same mint", async () => {
      const mint = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      const pda1 = await bondingCurvePda(mint);
      const pda2 = await bondingCurvePda(mint);
      expect(pda1).toBe(pda2);
    });

    test("derives different PDAs for different mints", async () => {
      const mint1 = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      const mint2 = address("So11111111111111111111111111111111111111112");
      const pda1 = await bondingCurvePda(mint1);
      const pda2 = await bondingCurvePda(mint2);
      expect(pda1).not.toBe(pda2);
    });
  });

  describe("creatorVaultPda", () => {
    test("derives consistent creator vault PDA", async () => {
      const bondingCurve = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      const pda1 = await creatorVaultPda(bondingCurve);
      const pda2 = await creatorVaultPda(bondingCurve);
      expect(pda1).toBe(pda2);
    });
  });
});

