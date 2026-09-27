import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { buyV2, sellV2, buyExactQuoteInV2 } from "../../src/clients/trade_v2";
import { getBuyExactQuoteInV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyExactQuoteInV2";
import { getBuyV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/buyV2";
import { getSellV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/sellV2";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";
import { findAssociatedTokenPda } from "../../src/pda/ata";

const quoteMint = address("So11111111111111111111111111111111111111112");
test("unified trades derive ATAs with independently resolved token programs", async () => {
  const user = await generateKeyPairSigner();
  const mint = (await generateKeyPairSigner()).address;
  const lookups: string[] = [];
  const rpc = { getAccountInfo: (key: string) => ({ send: async () => {
    lookups.push(key);
    return { value: { owner: key === mint ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID } };
  } }) } as any;
  const params = { user, mint, quoteMint, rpc, bondingCurveCreator: user.address,
    feeRecipient: user.address, buybackFeeRecipient: user.address };
  const buy = await buyV2({ ...params, tokenAmountRaw: 1000n, maxQuoteInputRaw: 250000000n });
  expect(lookups).toEqual([mint, quoteMint]);
  expect(buy.accounts[3].address).toBe(address(TOKEN_2022_PROGRAM_ID));
  expect(buy.accounts[4].address).toBe(address(TOKEN_PROGRAM_ID));
  const [baseAta] = await findAssociatedTokenPda({ owner: user.address, mint, tokenProgram: address(TOKEN_2022_PROGRAM_ID) });
  expect(buy.accounts[14].address).toBe(baseAta);
  expect(getBuyV2InstructionDataDecoder().decode(buy.data).maxSolCost).toBe(250000000n);
  const hinted = { ...params, baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID };
  const exact = await buyExactQuoteInV2({ ...hinted, quoteAmountRaw: 250000000n, minTokenOutputRaw: 1000n });
  expect(getBuyExactQuoteInV2InstructionDataDecoder().decode(exact.data).spendableQuoteIn).toBe(250000000n);
  expect(getBuyExactQuoteInV2InstructionDataDecoder().decode(exact.data).minTokensOut).toBe(1000n);
  const sell = await sellV2({ ...hinted, tokenAmountRaw: 1000n, minQuoteOutputRaw: 1n });
  expect(getSellV2InstructionDataDecoder().decode(sell.data).minSolOutput).toBe(1n);
  expect(lookups).toHaveLength(2);
  expect(buy.accounts).toHaveLength(27);
  expect(exact.accounts).toHaveLength(27);
  expect(sell.accounts).toHaveLength(26);
  for (const quoteAmountRaw of [0n, -1n, 18446744073709551616n]) {
    await expect(buyExactQuoteInV2({ ...hinted, quoteAmountRaw, minTokenOutputRaw: 1n })).rejects.toThrow("u64");
  }
});
