#!/usr/bin/env node
/**
 * check-citation-cards.mjs — adapted from vela's `audit:citation-cards` (donor source not
 * available locally; reimplemented from spec). THESIS: every claim we publish ships with
 * the measurement that would falsify it. README.md makes quantitative/superlative claims
 * ("45+ live services", "first mainstream book") with no falsifier attached anywhere in
 * the repo. This scans for claim-shaped text and requires a matching, non-empty entry in
 * a new `.claim-ledger.json` (same declare-it-or-it-fails discipline as
 * .artifact-contracts.json). No ledger = every claim is uncovered.
 *
 *   node scripts/kit/check-citation-cards.mjs [--file <readme>] [--ledger <path>]
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : path.join(process.cwd(), "README.md");
const ledgerPath = process.argv.includes("--ledger") ? process.argv[process.argv.indexOf("--ledger") + 1] : path.join(path.dirname(file), ".claim-ledger.json");

let text;
try { text = fs.readFileSync(file, "utf8"); }
catch { console.error(`CANNOT-MEASURE: cannot read ${file}`); process.exit(1); }

const CLAIM_PATTERNS = [/\b\d+(\.\d+)?[KMB]?\+/g, /\bfirst\b[^.]{0,40}\b(book|mainstream)\b/gi, /\b(proven|grounded in research|evidence-based)\b/gi];
const claims = [];
for (const re of CLAIM_PATTERNS) { let m; while ((m = re.exec(text))) claims.push(m[0]); }

let ledger = { claims: [] };
if (fs.existsSync(ledgerPath)) {
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { ledger = { claims: [] }; }
}

function covered(claim) {
  return (ledger.claims ?? []).some((c) => c.pattern && claim.includes(c.pattern) && c.falsifier && c.lastVerified && !Number.isNaN(Date.parse(c.lastVerified)));
}

const uncovered = [...new Set(claims)].filter((c) => !covered(c));

console.log(`[check-citation-cards] ${new Set(claims).size} distinct claim-shaped string(s) found in ${path.basename(file)}`);
for (const c of new Set(claims)) console.log(`  ${covered(c) ? "✓" : "✖"} "${c}"`);
console.log("");
console.log(uncovered.length ? `✖ ${uncovered.length} claim(s) ship with no declared falsifier in ${path.basename(ledgerPath)}.` : "✓ every claim-shaped string has a declared falsifier.");
process.exit(uncovered.length ? 1 : 0);
