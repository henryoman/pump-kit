#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

function normalizeAnchorTypes(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAnchorTypes(item)) as JsonArray;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      (value as JsonObject)[key] = normalizeAnchorTypes(nested);
    }
    return value;
  }
  if (value === "pubkey") {
    return "publicKey";
  }
  return value;
}

async function patchIndexBarrel(outDir: string) {
  const indexPath = join(outDir, "index.ts");
  try {
    const content = await readFile(indexPath, "utf8");
    const updated = content.replace(
      /export \* from ['"]\.\/types['"];?/g,
      "export * as types from './types';"
    );
    if (updated !== content) {
      await writeFile(indexPath, updated, "utf8");
      console.log(`🛠️  Patched barrel exports in ${indexPath}`);
    }
  } catch (error) {
    console.warn(`⚠️  Unable to patch barrel file at ${indexPath}:`, error);
  }
}

async function patchCompatibleAccount(outDir: string, name: string, discriminator: string, historicalSizes: number[], size: number) {
  const path = join(outDir, "accounts", `${name}.ts`);
  const content = await readFile(path, "utf8");
  if (!content.includes(`return ${size};`)) throw new Error(`Account size changed in ${path}; update compatibility decoding before regenerating`);
  const original = "encodedAccount as MaybeEncodedAccount<TAddress>,";
  if (!content.includes(original)) throw new Error(`Cannot install compatibility decoding in ${path}`);
  const updated = 'import { normalizeProtocolAccount } from "../../../utils/protocol_accounts";\n' +
    content.replace(original,
      `normalizeProtocolAccount(encodedAccount as MaybeEncodedAccount<TAddress>, ${discriminator}, ${JSON.stringify(historicalSizes)}, ${size}),`);
  await writeFile(path, updated, "utf8");
}

async function render(idlPath: string, outDir: string, { normalizePubkey = false } = {}) {
  console.log(`📖 Reading IDL from ${idlPath}...`);
  const idlJson = await readFile(idlPath, "utf8");
  const idl = JSON.parse(idlJson);

  if (normalizePubkey) {
    normalizeAnchorTypes(idl);
  }
  // The upstream legacy migrate IDL repeats `mint` in the ATA token-program
  // position. Correct the resolver seeds without changing the official snapshot.
  const migration = idl.instructions.find((instruction: { name: string }) => instruction.name === "migrate");
  for (const account of migration?.accounts ?? []) {
    const seeds = account.pda?.seeds;
    if (seeds?.length === 3 && seeds[1].kind === "account" && seeds[1].path === "mint" && seeds[2].path === "mint") {
      seeds[1] = { kind: "account", path: "token_program" };
    }
  }
  
  console.log(`🔧 Processing ${idl.metadata?.name || "unknown"} program...`);
  const rootNode = rootNodeFromAnchor(idl);
  const codama = createFromRoot(rootNode);
  
  console.log(`✨ Rendering TypeScript code to ${outDir}...`);
  const visitor = renderVisitor(outDir, {
    formatCode: true,
    generatedFolder: ".",
    syncPackageJson: false,
  });
  
  await codama.accept(visitor);
  await patchIndexBarrel(outDir);
  if (outDir === "src/pumpsdk/generated") {
    await patchCompatibleAccount(outDir, "bondingCurve", "BONDING_CURVE_DISCRIMINATOR", [49, 81, 82, 83, 115, 123, 124], 125);
  } else {
    await patchCompatibleAccount(outDir, "pool", "POOL_DISCRIMINATOR", [211, 243, 244, 245, 261, 269, 270], 271);
  }
  
  console.log(`✅ Generated code for ${idl.metadata?.name || "unknown"}`);
}

async function main() {
  console.log("🚀 Starting Codama code generation...\n");
  
  // Generate pump bonding curve client (pumpfun)
  await render("idl/pumpfun.idl.json", "src/pumpsdk/generated");
  
  console.log("");
  
  // Generate pump AMM client (pumpswap)
  await render("idl/pumpswap.idl.json", "src/ammsdk/generated");
  
  console.log("\n🎉 Codama code generation complete!");
}

main().catch((err) => {
  console.error("❌ Code generation failed:", err);
  process.exit(1);
});
