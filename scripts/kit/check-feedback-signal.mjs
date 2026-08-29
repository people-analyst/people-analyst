#!/usr/bin/env node
/**
 * check-feedback-signal.mjs — Feedback Signal: can we tell whether a link from here worked?
 *
 * ADAPTED FROM: devplane `analytics:conformance` (donor source not available locally;
 * reimplemented from the pillar spec for this repo's actual shape). This repo has no
 * analytics package to audit — its only outbound signal is the "What I'm building" link
 * list in README.md. Installing a tracker would be "the pipe is not the signal"; the
 * concern that IS live here is narrower and cheaper to check: an unattributed link is a
 * link nobody could ever attribute a visit back to, which is indistinguishable from a
 * link that does nothing. And any published rate must disclose the population it was
 * computed over, so a tiny-N rate can't pass as a real one.
 *
 *   node scripts/kit/check-feedback-signal.mjs [--file <readme>]
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : path.join(process.cwd(), "README.md");

let text;
try { text = fs.readFileSync(file, "utf8"); }
catch { console.error(`CANNOT-MEASURE: cannot read ${file}`); process.exit(1); }

const sectionMatch = text.match(/###\s*What I'm building([\s\S]*?)(\n###|\n---|\n$|$)/);
if (!sectionMatch) {
  console.error(`CANNOT-MEASURE: no "### What I'm building" section found in ${file} — the link roster this check exists to audit isn't where expected.`);
  process.exit(1);
}
const section = sectionMatch[1];

const ATTR_KEYS = ["utm_source", "utm_campaign", "ref", "via", "source"];
const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const unattributed = [];
let m;
while ((m = linkRe.exec(section))) {
  const [, text_, url] = m;
  let hasAttr = false;
  try { hasAttr = ATTR_KEYS.some((k) => new URL(url).searchParams.has(k)); } catch { /* leave false */ }
  if (!hasAttr) unattributed.push({ text: text_, url });
}

const rateRe = /\b\d{1,3}%/g;
const floorRe = /\b(n\s*=\s*\d+|N\s*=\s*\d+|\d+\s+(raters|responses|respondents|samples|users|customers))\b/;
const ratesWithoutFloor = [];
let rm;
while ((rm = rateRe.exec(text))) {
  const window = text.slice(Math.max(0, rm.index - 80), rm.index + 80);
  if (!floorRe.test(window)) ratesWithoutFloor.push(rm[0] + " @ " + window.replace(/\s+/g, " ").trim());
}

const fail = unattributed.length > 0 || ratesWithoutFloor.length > 0;

console.log(`[check-feedback-signal] ${path.relative(process.cwd(), file)}`);
console.log(`  product links: ${[...section.matchAll(linkRe)].length}, unattributed: ${unattributed.length}`);
for (const u of unattributed) console.log(`    ✖ UNATTRIBUTED  [${u.text}](${u.url}) — no utm_source/ref/via param, so a click here can never be told apart from any other traffic`);
console.log(`  rate-shaped claims: ${[...text.matchAll(/\b\d{1,3}%/g)].length}, without a stated population: ${ratesWithoutFloor.length}`);
for (const r of ratesWithoutFloor) console.log(`    ✖ RATE-WITHOUT-FLOOR ${r}`);
console.log("");
console.log(fail ? "✖ we ship links and rates we cannot yet tell worked." : "✓ every product link is attributable and every rate discloses its population.");
process.exit(fail ? 1 : 0);
