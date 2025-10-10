import { describe, test, expect } from "bun:test";
import { buildWrapSolInstructions, buildUnwrapSolInstructions, WSOL } from "../../src/utils/wsol";
import { generateKeyPairSigner } from "@solana/signers";
import { address } from "@solana/kit";

const LAMPORTS = 1_000_000n;

describe("WSOL helpers", () => {
  test("buildWrapSolInstructions creates transfer + sync instructions", async () => {
    const owner = await generateKeyPairSigner();

    const { prepend, append, associatedTokenAddress } = buildWrapSolInstructions({
      owner,
      amount: LAMPORTS,
      autoClose: true,
    });

    expect(associatedTokenAddress).toBeDefined();
    expect(prepend.length).toBeGreaterThanOrEqual(2);
    expect(append.length).toBe(1);
    expect(prepend[0].programAddress).toBe(
      address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    );
    expect(prepend[1].programAddress).toBe(
      address("11111111111111111111111111111111")
    );
  });

  test("buildUnwrapSolInstructions closes WSOL account", async () => {
    const owner = await generateKeyPairSigner();
    const instructions = buildUnwrapSolInstructions(owner);
    expect(instructions.length).toBe(1);
    expect(instructions[0].programAddress).toBe(
      address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    );
  });
});
