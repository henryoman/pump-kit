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

function readPackageJson(): { name: string; version: string } {
  return JSON.parse(readFileSync("package.json", "utf8")) as {
    name: string;
    version: string;
  };
}

function parseSemver(version: string): [number, number, number] {
  const core = version.trim().replace(/^v/, "").split("-")[0];
  const [major, minor, patch] = core.split(".").map(Number);
  if (
    Number.isNaN(major) ||
    Number.isNaN(minor) ||
    Number.isNaN(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return [major, minor, patch];
}

function compareSemver(a: string, b: string): number {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function npmLatestVersion(packageName: string): string {
  const output = run("npm", ["view", packageName, "version", "--json"], "npm view");
  const parsed = JSON.parse(output) as string | string[];
  return Array.isArray(parsed) ? parsed.at(-1) ?? "" : parsed;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpArg = args.find((arg) => arg === "patch" || arg === "minor" || arg === "major");
const bumpType: BumpType = (bumpArg as BumpType | undefined) ?? "patch";
const otpArg = args.find((arg) => arg.startsWith("--otp="));
const otp = otpArg ? otpArg.slice("--otp=".length) : process.env.NPM_OTP;

console.log("Running CI checks...");
run("bun", ["run", "ci"], "CI checks");

const originalPkg = readPackageJson();
const publishedVersion = npmLatestVersion(originalPkg.name);
let releaseVersion = originalPkg.version;

if (compareSemver(releaseVersion, publishedVersion) <= 0) {
  console.log(
    `Local version ${releaseVersion} is not ahead of npm (${publishedVersion}). Bumping ${bumpType}...`,
  );
  run("npm", ["version", bumpType, "--no-git-tag-version"], "npm version");
  releaseVersion = readPackageJson().version;
}

if (compareSemver(releaseVersion, publishedVersion) <= 0) {
  throw new Error(
    `Release version ${releaseVersion} is still not ahead of npm ${publishedVersion}.`,
  );
}

const publishArgs = ["publish", "--access", "public"];
if (dryRun) publishArgs.push("--dry-run");
if (otp) publishArgs.push(`--otp=${otp}`);

console.log(
  `${dryRun ? "Dry-run publishing" : "Publishing"} ${originalPkg.name}@${releaseVersion}...`,
);
run("npm", publishArgs, "npm publish");
console.log(
  dryRun
    ? `Dry-run complete for ${originalPkg.name}@${releaseVersion}.`
    : `Published ${originalPkg.name}@${releaseVersion}.`,
);
