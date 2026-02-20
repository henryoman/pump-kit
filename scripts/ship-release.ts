import { spawnSync } from "node:child_process";

function run(cmd: string, args: string[], label: string): string {
  const result = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`${label} failed.\n${stderr || stdout || "Unknown error."}`);
  }
  return result.stdout?.trim() ?? "";
}

function runStreaming(cmd: string, args: string[], label: string): void {
  const result = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

const args = process.argv.slice(2);
const bump = args[0] ?? "patch";

runStreaming("bun", ["run", "scripts/cut-release.ts", bump], "cut release");

const runId = run(
  "gh",
  ["run", "list", "--workflow", "release.yml", "--limit", "1", "--json", "databaseId", "--jq", ".[0].databaseId"],
  "get release run id",
);

if (!runId) {
  throw new Error("Could not find GitHub release workflow run.");
}

console.log(`Watching release run ${runId}...`);
runStreaming("gh", ["run", "watch", runId, "--exit-status"], "watch release workflow");
console.log("Release workflow completed successfully.");
