/**
 * Integration tests for liquidity helpers.
 */

import { describe, test, expect } from "bun:test";
import { generateKeyPairSigner } from "@solana/signers";
import {
  addLiquidity,
  removeLiquidity,
  WSOL,
} from "../../src/liquidity";
import { poolPda } from "../../src/pda/pumpAmm";
import { PUMP_AMM_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../../src/config/addresses";
import { address } from "@solana/kit";

const BASE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POOL_INDEX = 0;

const assertAddressEqual = (addr: string, expected: string) => {
  expect(addr).toBe(address(expected));
};

describe("Liquidity helpers", () => {
  test("addLiquidity builds deposit instruction", async () => {
    const user = await generateKeyPairSigner();
    const pool = await poolPda(POOL_INDEX, user.address, BASE_MINT, WSOL);

    const ix = await addLiquidity({
      user,
      baseMint: BASE_MINT,
      quoteMint: WSOL,
      poolIndex: POOL_INDEX,
      maxBaseAmountIn: 1_000_000n,
      maxQuoteAmountIn: 2_000_000n,
      minLpTokensOut: 0n,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    expect(ix.programAddress).toBe(address(PUMP_AMM_PROGRAM_ID));
    const poolMeta = ix.accounts[0];
    assertAddressEqual(poolMeta.address, pool);
    expect(ix.accounts.length).toBeGreaterThanOrEqual(15);
  });

  test("removeLiquidity builds withdraw instruction", async () => {
    const user = await generateKeyPairSigner();

    const ix = await removeLiquidity({
      user,
      baseMint: BASE_MINT,
      quoteMint: WSOL,
      poolIndex: POOL_INDEX,
      lpAmountIn: 500_000n,
      minBaseAmountOut: 0n,
      minQuoteAmountOut: 0n,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    expect(ix.programAddress).toBe(address(PUMP_AMM_PROGRAM_ID));
    expect(ix.accounts.length).toBeGreaterThanOrEqual(15);
  });
});
