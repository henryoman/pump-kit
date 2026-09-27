import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { ammBuy, ammSell, type AmmResolvedState } from "../../src/clients/amm";
import { getBuyExactQuoteInInstructionDataDecoder } from "../../src/ammsdk/generated/instructions/buyExactQuoteIn";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

const baseMint = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const quoteMint = address("So11111111111111111111111111111111111111112");
const poolAddress = address("5Y1xKwh28ykVfoCENKz7dxyzKDn5XxhxL7sRKqzZo4PM");

test("AMM builders use the supplied quote snapshot without rereading protocol state", async () => {
  const user = await generateKeyPairSigner();
  const resolvedState = {
    poolAddress,
    poolData: { baseMint, quoteMint, poolBaseTokenAccount: baseMint, poolQuoteTokenAccount: quoteMint, coinCreator: user.address, creator: user.address,
      isCashbackCoin: false, isMayhemMode: false },
    globalConfigData: { protocolFeeRecipients: [user.address], buybackFeeRecipients: [user.address] },
  } as AmmResolvedState;
  const rpc = new Proxy({}, { get: () => { throw new Error("Unexpected RPC read"); } }) as any;
  const params = { user, baseMint, quoteMint, poolAddress, resolvedState, rpc,
    baseTokenProgram: TOKEN_2022_PROGRAM_ID, quoteTokenProgram: TOKEN_PROGRAM_ID };
  const buy = await ammBuy({ ...params, tokenAmountOut: 10n, maxQuoteIn: 20n });
  const exactIn = await ammBuy({ ...params, tokenAmountOut: 10n, maxQuoteIn: 20n,
    exactQuoteIn: { amountIn: 20n, minAmountOut: 8n } });
  const decoded = getBuyExactQuoteInInstructionDataDecoder().decode(exactIn.data);
  expect(decoded.spendableQuoteIn).toBe(20n);
  expect(decoded.minBaseAmountOut).toBe(8n);
  const sell = await ammSell({ ...params, tokenAmountIn: 10n, minQuoteOut: 1n });
  expect(buy.accounts[0].address).toBe(poolAddress);
  expect(sell.accounts[0].address).toBe(poolAddress);
  await expect(ammBuy({ ...params, baseMint: quoteMint, tokenAmountOut: 10n, maxQuoteIn: 20n }))
    .rejects.toThrow("does not match");
});
