#!/usr/bin/env node
/**
 * check-one-source-of-truth.mjs — adapted from devplane's `check:assignment-ids` (donor
 * source not available locally; reimplemented from spec). This repo mints no ids and
 * runs no database, so the assignment-id concern doesn't transplant literally. What DOES
 * transplant: "one producer per fact." The README's own product roster is a small set of
 * facts (name -> home URL) restated by hand; if the same product ever gets asserted with
 * two different URLs, or the same URL gets claimed by two different product names, this
 * file has drifted from itself with no one else even needing to be involved.
 *
 * Deliberately NOT this pillar (per DP-661): whether a link resolves. That's
 * distribution-retrieval's vocabulary, not referential integrity's.
 *
 *   node scripts/kit/check-one-source-of-truth.mjs [--file <readme>]
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : path.join(process.cwd(), "README.md");

let text;
try { text = fs.readFileSync(file, "utf8"); }
catch { console.error(`CANNOT-MEASURE: cannot read ${file}`); process.exit(1); }

const sectionMatch = text.match(/###\s*What I'm building([\s\S]*?)(\n###|\n---|\n$|$)/);
if (!sectionMatch) {
  console.error(`CANNOT-MEASURE: no "### What I'm building" section found in ${file} — the roster this check exists to audit isn't where expected.`);
  process.exit(1);
}
const section = sectionMatch[1];

const boldNameRe = /\*\*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\*\*/g;
const nameToUrls = new Map();
const urlToNames = new Map();
let m;
while ((m = boldNameRe.exec(section))) {
  const [, name, url] = m;
  if (!nameToUrls.has(name)) nameToUrls.set(name, new Set());
  nameToUrls.get(name).add(url);
  if (!urlToNames.has(url)) urlToNames.set(url, new Set());
  urlToNames.get(url).add(name);
}

const collisions = [];
for (const [name, urls] of nameToUrls) if (urls.size > 1) collisions.push(`"${name}" points to ${urls.size} different URLs: ${[...urls].join(", ")}`);
for (const [url, names] of urlToNames) if (names.size > 1) collisions.push(`${url} is claimed as the home of ${names.size} different products: ${[...names].join(", ")}`);

console.log(`[check-one-source-of-truth] ${nameToUrls.size} product(s) named in the roster`);
for (const c of collisions) console.log(`  ✖ ${c}`);
console.log("");
console.log(collisions.length ? `✖ ${collisions.length} fact(s) restated with two different values inside the same file.` : "✓ every product name in the roster maps to exactly one URL, and vice versa.");
process.exit(collisions.length ? 1 : 0);
