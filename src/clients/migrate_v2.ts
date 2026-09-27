import { address, getProgramDerivedAddress, getAddressEncoder, AccountRole } from "@solana/kit";
import type { Address, TransactionSigner } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../config/addresses";
import { findAssociatedTokenPda } from "../pda/ata";
import { fetchGlobal } from "../pumpsdk/generated/accounts/global";
import { globalPda } from "../pda/pump";
import { eventAuthorityPda, poolPda } from "../pda/pumpAmm";
import { resolveTokenProgram } from "../utils/token_program";
import { getMigrateV2InstructionAsync } from "../pumpsdk/generated/instructions/migrateV2";

/** Migrate a completed curve, resolving base and quote token programs separately. */
export async function migrateV2(params: {
  user: TransactionSigner; mint: Address | string; rpc: RpcClient;
  quoteMint?: Address | string; baseTokenProgram?: Address | string; quoteTokenProgram?: Address | string;
}) {
  const baseMint = address(params.mint);
  const quoteMint = address(params.quoteMint ?? "So11111111111111111111111111111111111111112");
  const [baseTokenProgram, quoteTokenProgram, global] = await Promise.all([
    resolveTokenProgram({ rpc: params.rpc, mint: baseMint, tokenProgram: params.baseTokenProgram }),
    resolveTokenProgram({ rpc: params.rpc, mint: quoteMint, tokenProgram: params.quoteTokenProgram }),
    globalPda().then(pda => fetchGlobal(params.rpc, pda, { commitment: "confirmed" })),
  ]);
  const instruction = await getMigrateV2InstructionAsync({ user: params.user, baseMint, quoteMint, baseTokenProgram, quoteTokenProgram,
    withdrawAuthority: global.data.withdrawAuthority, pumpAmmEventAuthority: await eventAuthorityPda(), program: address(PUMP_PROGRAM_ID) });
  const [poolAuthority] = await getProgramDerivedAddress({ programAddress: address(PUMP_PROGRAM_ID),
    seeds: [new TextEncoder().encode("pool-authority"), getAddressEncoder().encode(baseMint)] });
  const poolAddress = await poolPda(0, poolAuthority, baseMint, quoteMint);
  // These required boost accounts are remaining accounts, absent from the IDL.
  const [boostAuthority] = await getProgramDerivedAddress({ programAddress: address(PUMP_AMM_PROGRAM_ID),
    seeds: [new TextEncoder().encode("boost_vault"), getAddressEncoder().encode(poolAddress)] });
  const [boostVault] = await findAssociatedTokenPda({ owner: boostAuthority, mint: quoteMint, tokenProgram: quoteTokenProgram });
  return { ...instruction, accounts: [...instruction.accounts,
    { address: boostAuthority, role: AccountRole.READONLY }, { address: boostVault, role: AccountRole.WRITABLE }] };
}
