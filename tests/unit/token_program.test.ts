import { expect, test } from "bun:test";
import { address } from "@solana/kit";
import { resolveTokenProgram, resolveMintContext } from "../../src/utils/token_program";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

const mint = address("So11111111111111111111111111111111111111112");
test("resolves Token-2022 and legacy mint owners independently", async () => {
  for (const owner of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const rpc = { getAccountInfo: () => ({ send: async () => ({ value: { owner } }) }) } as any;
    expect(await resolveTokenProgram({ rpc, mint })).toBe(address(owner));
  }
});

test("explicit token program skips RPC and invalid owners fail", async () => {
  const rpc = { getAccountInfo: () => { throw new Error("Unexpected RPC"); } } as any;
  expect(await resolveTokenProgram({ rpc, mint, tokenProgram: TOKEN_2022_PROGRAM_ID })).toBe(address(TOKEN_2022_PROGRAM_ID));
  expect(resolveTokenProgram({ rpc, mint, tokenProgram: mint })).rejects.toThrow("Mint owner");
  for (const value of [null, { owner: mint }]) {
    const invalidRpc = { getAccountInfo: () => ({ send: async () => ({ value }) }) } as any;
    expect(resolveTokenProgram({ rpc: invalidRpc, mint })).rejects.toThrow();
  }
});


test("mint contexts read owner and decimals and reject conflicting hints", async () => {
  const bytes = Buffer.alloc(82);
  bytes[44] = 9;
  bytes[45] = 1;
  const rpc = { getAccountInfo: () => ({ send: async () => ({ value: {
    owner: TOKEN_2022_PROGRAM_ID, data: [bytes.toString("base64"), "base64"],
  } }) }) } as any;
  expect(await resolveMintContext({ rpc, mint })).toEqual({ mint, tokenProgram: address(TOKEN_2022_PROGRAM_ID), decimals: 9 });
  await expect(resolveMintContext({ rpc, mint, tokenProgram: TOKEN_PROGRAM_ID })).rejects.toThrow("does not match");
  bytes[45] = 0;
  await expect(resolveMintContext({ rpc, mint })).rejects.toThrow("uninitialized");
});
