import { getDefaultCommitment } from "../config/commitment";
import { address } from "@solana/kit";
import type { Address } from "@solana/kit";
import type { RpcClient } from "../config/connection";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../config/addresses";

export function validateTokenProgram(value: Address | string): Address {
  const program = address(value);
  if (program !== address(TOKEN_PROGRAM_ID) && program !== address(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Mint owner must be the SPL Token or Token-2022 program");
  }
  return program;
}

/** Resolve each mint independently; an explicit hint avoids an RPC lookup. */
export async function resolveTokenProgram(params: {
  rpc: RpcClient;
  mint: Address | string;
  tokenProgram?: Address | string;
}): Promise<Address> {
  if (params.tokenProgram !== undefined) return validateTokenProgram(params.tokenProgram);
  const response = await params.rpc.getAccountInfo(address(params.mint), { encoding: "base64", commitment: getDefaultCommitment() }).send();
  if (!response.value) throw new Error(`Mint account does not exist: ${params.mint}`);
  return validateTokenProgram(response.value.owner);
}

export type MintContext = Readonly<{
  mint: Address;
  tokenProgram: Address;
  decimals: number;
}>;

/** Read and validate the actual owner and mint header once for a trading context. */
export async function resolveMintContext(params: {
  rpc: RpcClient;
  mint: Address | string;
  tokenProgram?: Address | string;
}): Promise<MintContext> {
  const mint = address(params.mint);
  const response = await params.rpc.getAccountInfo(mint, {
    encoding: "base64", commitment: getDefaultCommitment(),
  }).send();
  if (!response.value) throw new Error(`Mint account does not exist: ${mint}`);
  const tokenProgram = validateTokenProgram(response.value.owner);
  if (params.tokenProgram !== undefined && validateTokenProgram(params.tokenProgram) !== tokenProgram) {
    throw new Error("Token program hint does not match mint owner");
  }
  const bytes = Buffer.from(response.value.data[0], "base64");
  if (bytes.length < 82 || bytes[45] !== 1) throw new Error("Invalid or uninitialized mint account");
  return { mint, tokenProgram, decimals: bytes[44]! };
}
