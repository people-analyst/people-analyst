#!/usr/bin/env node
/**
 * check-feedback-signal:selftest — mutates a fixture README and requires the check to flip.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, "check-feedback-signal.mjs");

const CLEAN = `# Fixture

### What I'm building

- **[Thing](https://example.com/thing?utm_source=github-profile)** — a thing.

Pass rate is 92% (n=40) on the golden set.
`;

function run(text) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "feedback-signal-"));
  const file = path.join(dir, "README.md");
  fs.writeFileSync(file, text);
  const r = spawnSync(process.execPath, [CHECK, "--file", file], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

const failures = [];

let r = run(CLEAN);
if (r.status !== 0) failures.push(`expected PASS on a clean, attributed, floor-disclosed fixture, got exit ${r.status}\n${r.stdout}`);

// Mutation 1: strip attribution from the link.
const noAttr = CLEAN.replace("?utm_source=github-profile", "");
r = run(noAttr);
if (r.status === 0) failures.push(`expected FAIL after stripping utm_source from the link, stayed PASS`);

// Mutation 2: strip the sample size from the rate claim.
const noFloor = CLEAN.replace(" (n=40)", "");
r = run(noFloor);
if (r.status === 0) failures.push(`expected FAIL after removing the disclosed population for the 92% claim, stayed PASS`);

if (failures.length) {
  console.error("check-feedback-signal:selftest FAILED\n" + failures.join("\n\n"));
  process.exit(1);
}
console.log("check-feedback-signal:selftest OK");
process.exit(0);
