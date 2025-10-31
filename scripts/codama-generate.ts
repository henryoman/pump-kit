#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

async function render(idlPath: string, outDir: string) {
  console.log(`📖 Reading IDL from ${idlPath}...`);
  const idlJson = await readFile(idlPath, "utf8");
  const idl = JSON.parse(idlJson);
  
  console.log(`🔧 Processing ${idl.metadata?.name || "unknown"} program...`);
  const rootNode = rootNodeFromAnchor(idl);
  const codama = createFromRoot(rootNode);
  
  console.log(`✨ Rendering TypeScript code to ${outDir}...`);
  const visitor = renderVisitor(outDir, {
    formatCode: true,
  });
  
  await codama.accept(visitor);
  
  console.log(`✅ Generated code for ${idl.metadata?.name || "unknown"}`);
}

async function main() {
  console.log("🚀 Starting Codama code generation...\n");
  
  // Generate pump bonding curve client (pumpfun)
  await render(
    "idl/pumpfun.idl.json",
    "src/pumpsdk/generated"
  );
  
  console.log("");
  
  // Generate pump AMM client (pumpswap)
  await render(
    "idl/pumpswap.idl.json",
    "src/ammsdk/generated"
  );
  
  console.log("\n🎉 Codama code generation complete!");
}

main().catch((err) => {
  console.error("❌ Code generation failed:", err);
  process.exit(1);
});
