#!/usr/bin/env node
/**
 * check-commerce-fulfillment:selftest — mutates a fixture repo and requires the flip.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, "check-commerce-fulfillment.mjs");

function git(dir, args) { execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" }); }

function repoWith(readme) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "commerce-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@t.com"]);
  git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), readme);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  return dir;
}

function run(dir) { return spawnSync(process.execPath, [CHECK, "--root", dir], { encoding: "utf8" }); }

const failures = [];

let dir = repoWith("# Fixture\n\nJust a bio page, nothing for sale.\n");
let r = run(dir);
if (r.status !== 0) failures.push(`expected PASS (no commerce surface), got ${r.status}\n${r.stdout}`);
fs.rmSync(dir, { recursive: true, force: true });

dir = repoWith("# Fixture\n\n$49 — Buy the guide now.\n");
r = run(dir);
if (r.status === 0) failures.push(`expected FAIL for an unverified $49 buy link, stayed PASS`);

fs.writeFileSync(path.join(dir, ".commerce-contracts.json"), JSON.stringify({
  verified: [{ file: "README.md", verified_by: "manual purchase test", verified_at: "2026-08-29" }],
}));
git(dir, ["add", "-A"]);
git(dir, ["commit", "-q", "-m", "verify"]);
r = run(dir);
if (r.status !== 0) failures.push(`expected PASS after declaring a buyer-side fulfillment verification, stayed FAIL\n${r.stdout}`);
fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error("check-commerce-fulfillment:selftest FAILED\n" + failures.join("\n\n"));
  process.exit(1);
}
console.log("check-commerce-fulfillment:selftest OK");
process.exit(0);
