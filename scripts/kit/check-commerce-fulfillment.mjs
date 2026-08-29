#!/usr/bin/env node
/**
 * check-commerce-fulfillment.mjs — Delivery & Commerce Integrity, adapted from vela's
 * `check:commerce-fulfillment` (donor source not available locally; reimplemented from
 * spec). This repo sells nothing directly, but if that ever changes silently — a price
 * or buy link added to a README nobody wired a fulfillment check into — it must be
 * caught before it ships, not discovered by a buyer. Scans every git-tracked file for
 * commerce signals; any signal found without a matching entry in .commerce-contracts.json
 * (declaring how fulfillment was verified from the BUYER's position) fails. Zero signals
 * found is a legitimate, distinct pass — not the same as being unable to look.
 *
 *   node scripts/kit/check-commerce-fulfillment.mjs [--root <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argRoot = process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : process.cwd();
const ROOT = path.resolve(argRoot);

function trackedFiles() {
  try {
    const out = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch { return null; }
}

const files = trackedFiles();
if (files === null) {
  console.error(`CANNOT-MEASURE: ${ROOT} is not a git repo (or git failed) — cannot enumerate tracked files to search for commerce signals.`);
  process.exit(1);
}

const SIGNAL_RE = /\$\s?\d|(\bbuy now\b)|(\bpurchase\b)|(\bcheckout\b)|(\bprice[sd]?\b)|(\bsubscribe\b)/i;
const signals = [];
for (const rel of files) {
  const full = path.join(ROOT, rel);
  let text;
  try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
  if (path.basename(rel) === ".commerce-contracts.json") continue;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (SIGNAL_RE.test(line)) signals.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120) });
  });
}

if (signals.length === 0) {
  console.log(`[check-commerce-fulfillment] scanned ${files.length} tracked file(s) — no commerce signal found.`);
  console.log("✓ NO-COMMERCE-SURFACE: nothing here asks anyone to pay, so there is no fulfillment path to verify.");
  process.exit(0);
}

let contracts = { verified: [] };
const contractsPath = path.join(ROOT, ".commerce-contracts.json");
if (fs.existsSync(contractsPath)) {
  try { contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8")); } catch { contracts = { verified: [] }; }
}
const verifiedFiles = new Set((contracts.verified ?? []).filter((v) => v.verified_by && v.verified_at).map((v) => v.file));

const unverified = signals.filter((s) => !verifiedFiles.has(s.file));

console.log(`[check-commerce-fulfillment] ${signals.length} commerce signal(s) found across ${new Set(signals.map((s) => s.file)).size} file(s)`);
for (const s of signals) {
  const ok = verifiedFiles.has(s.file);
  console.log(`  ${ok ? "✓" : "✖"} ${s.file}:${s.line}  ${s.text}`);
}
if (unverified.length) {
  console.log(`\n✖ ${unverified.length} commerce signal(s) with no .commerce-contracts.json entry verifying fulfillment from the buyer's position.`);
} else {
  console.log(`\n✓ every commerce signal has a declared, buyer-side fulfillment verification.`);
}
process.exit(unverified.length ? 1 : 0);
