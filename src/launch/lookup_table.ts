import { address } from "@solana/kit";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import { ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS, getAddressLookupTableDecoder,
  getCreateLookupTableInstructionAsync, getExtendLookupTableInstruction } from "@solana-program/address-lookup-table";
import type { RpcClient, RpcSubscriptionsClient } from "../config/connection";
import { sendAndConfirmTransaction, type PriorityFeeOptions } from "../utils/transaction";

export async function loadLookupTable(rpc: RpcClient, table: Address | string): Promise<readonly Address[]> {
  const account = await rpc.getAccountInfo(address(table), { encoding: "base64", commitment: "confirmed" }).send();
  if (!account.value || account.value.owner !== ADDRESS_LOOKUP_TABLE_PROGRAM_ADDRESS) throw new Error("Lookup table does not exist or has an invalid owner");
  const state = getAddressLookupTableDecoder().decode(Buffer.from(account.value.data[0], "base64"));
  if (state.deactivationSlot !== 18446744073709551615n) throw new Error("Lookup table is deactivated");
  return state.addresses;
}

/** Creates a reusable on-chain lookup table; this submits setup transactions and costs rent. */
export async function createLaunchLookupTable(params: {
  instructions: readonly Instruction[]; signer: TransactionSigner; rpc: RpcClient;
  rpcSubscriptions: RpcSubscriptionsClient;
  priorityFees?: PriorityFeeOptions;
}) {
  const keys = [...new Set(params.instructions.flatMap(ix => (ix.accounts ?? []).filter(meta => !(meta.role & 2)).map(meta => meta.address)))];
  const slot = await params.rpc.getSlot({ commitment: "finalized" }).send();
  const creation = await getCreateLookupTableInstructionAsync({ authority: params.signer.address, payer: params.signer, recentSlot: slot });
  const table = creation.accounts[0].address;
  const submit = (ix: Instruction) => sendAndConfirmTransaction({ instructions: [ix], payer: params.signer,
    rpc: params.rpc, rpcSubscriptions: params.rpcSubscriptions, priorityFees: params.priorityFees,
    sendOptions: { abortSignal: AbortSignal.timeout(60000) } });
  const signatures = [(await submit(creation)).signature];
  for (let offset = 0; offset < keys.length; offset += 20) {
    const extension = getExtendLookupTableInstruction({ address: table, authority: params.signer,
      payer: params.signer, addresses: keys.slice(offset, offset + 20) });
    signatures.push((await submit(extension)).signature);
  }
  // Newly appended addresses become usable only in a later slot.
  const info = await params.rpc.getAccountInfo(table, { encoding: "base64", commitment: "confirmed" }).send();
  if (!info.value) throw new Error("Lookup table missing after confirmation");
  const state = getAddressLookupTableDecoder().decode(Buffer.from(info.value.data[0], "base64"));
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await params.rpc.getSlot({ commitment: "confirmed" }).send() > BigInt(state.lastExtendedSlot)) {
      return { address: table, addresses: await loadLookupTable(params.rpc, table), signatures };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Lookup table ${table} is not active yet; load it before retrying setup`);
}
