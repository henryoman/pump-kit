import { createHash } from "node:crypto";
import { expect, test } from "bun:test";

test("official IDL snapshots match the hashes and immutable revision in the manifest", async () => {
  const manifest = await Bun.file("idl/manifest.json").json();
  expect(manifest.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(manifest.files).toHaveLength(3);
  for (const entry of manifest.files) {
    const content = await Bun.file(`idl/${entry.file}`).text();
    expect(createHash("sha256").update(content).digest("hex")).toBe(entry.sha256);
    expect(entry.url).toStartWith(`https://raw.githubusercontent.com/${manifest.repository}/${manifest.commit}/idl/`);
  }
});
