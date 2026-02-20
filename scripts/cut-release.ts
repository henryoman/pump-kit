import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

type BumpType = "patch" | "minor" | "major";

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

function isSemver(value: string): boolean {
  return /^(\d+)\.(\d+)\.(\d+)$/.test(value);
}

function ensureCleanTree(): void {
  const status = run("git", ["status", "--porcelain"], "git status");
  if (status.length > 0) {
    throw new Error(
      "Working tree is not clean. Commit or stash your changes before running release:cut.",
    );
  }
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  return pkg.version;
}

const args = process.argv.slice(2);
const skipCi = args.includes("--skip-ci");
const noPush = args.includes("--no-push");
const rawTarget = args.find((arg) => !arg.startsWith("--")) ?? "patch";

let target: BumpType | string = rawTarget;
if (rawTarget !== "patch" && rawTarget !== "minor" && rawTarget !== "major" && !isSemver(rawTarget)) {
  throw new Error(
    `Invalid version target "${rawTarget}". Use patch|minor|major or explicit x.y.z.`,
  );
}

ensureCleanTree();

if (!skipCi) {
  console.log("Running CI checks...");
  runStreaming("bun", ["run", "ci"], "CI checks");
}

const beforeVersion = readVersion();
console.log(`Current version: ${beforeVersion}`);

if (target === "patch" || target === "minor" || target === "major") {
  run("npm", ["version", target, "--no-git-tag-version"], "npm version");
} else {
  run("npm", ["version", target, "--no-git-tag-version"], "npm version");
}

const nextVersion = readVersion();
const tag = `v${nextVersion}`;
console.log(`Prepared release version: ${nextVersion}`);

run("git", ["add", "package.json", "bun.lock"], "git add");
run("git", ["commit", "-m", `Release ${tag}`], "git commit");
run("git", ["tag", tag], "git tag");

if (!noPush) {
  runStreaming("git", ["push", "origin", "HEAD"], "git push");
  runStreaming("git", ["push", "origin", tag], "git push tag");
  console.log(`Release tag pushed: ${tag}`);
} else {
  console.log(`Release tag created locally: ${tag}`);
}

console.log("Done. GitHub Actions release workflow will run on the tag.");
