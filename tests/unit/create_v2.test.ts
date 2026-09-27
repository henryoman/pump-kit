import { expect, test } from "bun:test";
import { generateKeyPairSigner, address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { createV2, validateCreateV2Params } from "../../src/clients/create_v2";
import { getCreateV2InstructionDataDecoder } from "../../src/pumpsdk/generated/instructions/createV2";
import { PUMP_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

const metadata = { name: "Example", symbol: "EX", uri: "ipfs://example/metadata.json" };

test("create_v2 derives the program mint authority and Token-2022 curve ATA", async () => {
  const user = await generateKeyPairSigner();
  const mint = await generateKeyPairSigner();
  const instruction = await createV2({ user, mint, ...metadata, holderReward: true });
  const [authority] = await getProgramDerivedAddress({ programAddress: address(PUMP_PROGRAM_ID), seeds: [new TextEncoder().encode("mint-authority")] });
  expect(instruction.accounts[1].address).toBe(authority);
  expect(instruction.accounts[7].address).toBe(address(TOKEN_2022_PROGRAM_ID));
  const [ata] = await getProgramDerivedAddress({
    programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    seeds: [instruction.accounts[2].address, TOKEN_2022_PROGRAM_ID, mint.address].map(value => getAddressEncoder().encode(address(value))),
  });
  expect(instruction.accounts[3].address).toBe(ata);
  expect(instruction.accounts).toHaveLength(16);
  const decoded = getCreateV2InstructionDataDecoder().decode(instruction.data);
  expect(decoded.creator).toBe(user.address);
  expect(decoded.isHolderReward).toEqual([true]);
  expect(decoded.isCashbackEnabled).toEqual([false]);
  expect(decoded.isMayhemMode).toBe(false);
});

test("validates permanent creation choices and metadata before deriving accounts", () => {
  for (const overrides of [
    { name: "" }, { name: "é".repeat(17) }, { symbol: "x".repeat(14) },
    { uri: "ipfs://" + "x".repeat(200) }, { uri: "file:///secret" },
    { cashback: true }, { holderReward: "true" },
    { creator: "11111111111111111111111111111111" },
  ]) {
    expect(() => validateCreateV2Params({ ...metadata, ...overrides } as any)).toThrow();
  }
  expect(() => validateCreateV2Params({ ...metadata, symbol: "x".repeat(13) })).not.toThrow();
});
