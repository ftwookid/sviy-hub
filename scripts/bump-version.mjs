import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const bumpType = process.argv[2];
const versionPath = resolve(process.cwd(), "version.json");

if (!["minor", "patch"].includes(bumpType)) {
  console.error("Usage: node scripts/bump-version.mjs <minor|patch>");
  process.exit(1);
}

const versionData = JSON.parse(readFileSync(versionPath, "utf8"));
const version = versionData.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

if (!match) {
  console.error(`Invalid version format in version.json: ${version}`);
  process.exit(1);
}

let [, major, minor, patch] = match.map(Number);

if (bumpType === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

writeFileSync(versionPath, `${JSON.stringify({ version: `${major}.${minor}.${patch}` }, null, 2)}\n`);
