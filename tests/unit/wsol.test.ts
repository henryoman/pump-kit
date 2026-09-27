import { describe, test, expect } from "bun:test";
import { buildWrapSolInstructions, buildUnwrapSolInstructions } from "../../src/utils/wsol";
import { generateKeyPairSigner } from "@solana/signers";
import { address } from "@solana/kit";

const LAMPORTS = 1_000_000n;

describe("WSOL helpers", () => {
  test("buildWrapSolInstructions creates transfer + sync instructions", async () => {
    const owner = await generateKeyPairSigner();

    const { prepend, append, associatedTokenAddress } = await buildWrapSolInstructions({
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
    const instructions = await buildUnwrapSolInstructions(owner);
    expect(instructions.length).toBe(1);
    expect(instructions[0].programAddress).toBe(
      address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    );
  });

  test("preserves lamports beyond the safe number range and creates ATAs idempotently", async () => {
    const owner = await generateKeyPairSigner();
    const amount = 9_007_199_254_740_993n;
    const { prepend } = await buildWrapSolInstructions({ owner, amount });
    expect(Array.from(prepend[0].data!)).toEqual([1]);
    const data = prepend[1].data!;
    expect(new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(4, true)).toBe(amount);
  });
});

test("Kit WSOL instructions retain payer and close authority signers", async () => {
  const owner = await generateKeyPairSigner();
  const { prepend, append } = await buildWrapSolInstructions({ owner, amount: 1n, autoClose: true });
  expect((prepend[0].accounts![0] as any).signer).toBe(owner);
  expect((prepend[1].accounts![0] as any).signer).toBe(owner);
  expect(Array.from(prepend[2].data!)).toEqual([17]);
  expect(Array.from(append[0].data!)).toEqual([9]);
  expect((append[0].accounts![2] as any).signer).toBe(owner);
  await expect(buildWrapSolInstructions({ owner, amount: 18446744073709551616n })).rejects.toThrow("u64");
});
