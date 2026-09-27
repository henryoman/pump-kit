import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deposit, withdraw } from "../../src/clients/amm";
import { addLiquidity, removeLiquidity } from "../../src/liquidity";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

const baseMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const quoteMint = "So11111111111111111111111111111111111111112";
const poolAddress = "5Y1xKwh28ykVfoCENKz7dxyzKDn5XxhxL7sRKqzZo4PM";
const ata = (owner: string, mint: string, program: string) => getAssociatedTokenAddressSync(
  new PublicKey(mint), new PublicKey(owner), true, new PublicKey(program)
).toBase58();

test("mixed-program liquidity derives each mint's user and pool ATAs independently", async () => {
  const user = await generateKeyPairSigner();
  const params = { user, baseMint, quoteMint, poolAddress,
    baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID };
  const instructions = [await deposit({ ...params, maxBaseIn: 10n, maxQuoteIn: 20n, lpTokenAmountOut: 1n }),
    await withdraw({ ...params, lpAmountIn: 1n })];
  for (const instruction of instructions) {
    const accounts = instruction.accounts;
    expect(accounts[6].address).toBe(ata(user.address, baseMint, TOKEN_2022_PROGRAM_ID));
    expect(accounts[7].address).toBe(ata(user.address, quoteMint, TOKEN_PROGRAM_ID));
    expect(accounts[9].address).toBe(ata(poolAddress, baseMint, TOKEN_2022_PROGRAM_ID));
    expect(accounts[10].address).toBe(ata(poolAddress, quoteMint, TOKEN_PROGRAM_ID));
  }
});

test("public liquidity helpers resolve both mint owners with RPC and reject invalid hints", async () => {
  const user = await generateKeyPairSigner();
  const fetched: string[] = [];
  const rpc = { getAccountInfo: (mint: string) => ({ send: async () => {
    fetched.push(mint);
    return { value: { owner: mint === baseMint ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID } };
  } }) } as any;
  const params = { user, baseMint, quoteMint, poolAddress, rpc };
  const depositInstruction = await addLiquidity({ ...params, maxBaseAmountIn: 10n, maxQuoteAmountIn: 20n, lpTokenAmountOut: 1n });
  const withdrawInstruction = await removeLiquidity({ ...params, lpAmountIn: 1n });
  expect(fetched).toEqual([baseMint, quoteMint, baseMint, quoteMint]);
  for (const instruction of [depositInstruction, withdrawInstruction]) {
    expect(instruction.accounts![6].address).toBe(ata(user.address, baseMint, TOKEN_2022_PROGRAM_ID));
    expect(instruction.accounts![7].address).toBe(ata(user.address, quoteMint, TOKEN_PROGRAM_ID));
  }
  await expect(deposit({ ...params, baseTokenProgram: address(baseMint), maxBaseIn: 1n, maxQuoteIn: 1n, lpTokenAmountOut: 1n }))
    .rejects.toThrow("Mint owner");
});

test("deposit encodes an exact LP output and rejects zero or omitted quantities", async () => {
  const user = await generateKeyPairSigner();
  const params = { user, baseMint, quoteMint, poolAddress, maxBaseIn: 10n, maxQuoteIn: 20n };
  const instruction = await deposit({ ...params, lpTokenAmountOut: 7n });
  const { getDepositInstructionDataDecoder } = await import("../../src/ammsdk/generated/instructions/deposit");
  const data = getDepositInstructionDataDecoder().decode(instruction.data);
  expect(data.lpTokenAmountOut).toBe(7n);
  expect(data.maxBaseAmountIn).toBe(10n);
  expect(data.maxQuoteAmountIn).toBe(20n);
  await expect(deposit({ ...params, lpTokenAmountOut: 0n })).rejects.toThrow("positive bigint");
  await expect(deposit(params as any)).rejects.toThrow("positive bigint");
});
