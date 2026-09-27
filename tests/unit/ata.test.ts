import { expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { buildCreateAtaInstruction } from "../../src/utils/ata";
import { findAssociatedTokenPda } from "../../src/pda/ata";
import { TOKEN_2022_PROGRAM_ID } from "../../src/config/addresses";

test("idempotent Kit ATA creation derives Token-2022 accounts and keeps payer signers", async () => {
  const payer = await generateKeyPairSigner();
  const mint = (await generateKeyPairSigner()).address;
  const [owner] = await findAssociatedTokenPda({ owner: payer.address, mint });
  const program = address(TOKEN_2022_PROGRAM_ID);
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: program });
  const instruction = await buildCreateAtaInstruction({ payer, owner, mint, tokenProgram: program });
  expect(instruction.accounts![1].address).toBe(ata);
  expect(instruction.accounts![5].address).toBe(program);
  expect((instruction.accounts![0] as any).signer).toBe(payer);
  expect(instruction.data).toEqual(new Uint8Array([1]));
});
