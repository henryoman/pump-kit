import { expect, test } from "bun:test";
import { address, getAddressEncoder } from "@solana/kit";
import { ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS } from "@solana-program/address-lookup-table";
import { loadLookupTable } from "../../src/launch/lookup_table";

const table = address("So11111111111111111111111111111111111111112");
test("Kit lookup table decoder reads the protocol header and rejects deactivated tables", async () => {
  const bytes = Buffer.alloc(88);
  bytes.writeUInt32LE(1);
  bytes.writeBigUInt64LE(18446744073709551615n, 4);
  bytes.set(getAddressEncoder().encode(table), 56);
  const rpc = { getAccountInfo: () => ({ send: async () => ({ value: {
    owner: ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS, data: [bytes.toString("base64"), "base64"],
  } }) }) } as any;
  expect(await loadLookupTable(rpc, table)).toEqual([table]);
  bytes.writeBigUInt64LE(100n, 4);
  await expect(loadLookupTable(rpc, table)).rejects.toThrow("deactivated");
});
