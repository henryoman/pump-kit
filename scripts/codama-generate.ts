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

async function render(idlPath: string, outDir: string, { normalizePubkey = false } = {}) {
  console.log(`📖 Reading IDL from ${idlPath}...`);
  const idlJson = await readFile(idlPath, "utf8");
  const idl = JSON.parse(idlJson);

  if (normalizePubkey) {
    normalizeAnchorTypes(idl);
  }
  
  console.log(`🔧 Processing ${idl.metadata?.name || "unknown"} program...`);
  const rootNode = rootNodeFromAnchor(idl);
  const codama = createFromRoot(rootNode);
  
  console.log(`✨ Rendering TypeScript code to ${outDir}...`);
  const visitor = renderVisitor(outDir, {
    formatCode: true,
  });
  
  await codama.accept(visitor);
  await patchIndexBarrel(outDir);
  
  console.log(`✅ Generated code for ${idl.metadata?.name || "unknown"}`);
}

async function main() {
  console.log("🚀 Starting Codama code generation...\n");
  
  // Generate pump bonding curve client (pumpfun)
  await render("idl/pumpfun.idl.json", "src/pumpsdk/generated");
  
  console.log("");
  
  // Generate pump AMM client (pumpswap)
  await render("idl/pumpswap.idl.json", "src/ammsdk/generated", {
    normalizePubkey: true,
  });
  
  console.log("\n🎉 Codama code generation complete!");
}

main().catch((err) => {
  console.error("❌ Code generation failed:", err);
  process.exit(1);
});
