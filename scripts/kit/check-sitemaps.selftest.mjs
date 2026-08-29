#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-sitemaps.mjs");
function run(dir) { return spawnSync(process.execPath, [CHECK, "--root", dir], { encoding: "utf8" }); }
function mk() { const d = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sitemaps-")); return d; }
const failures = [];

let dir = mk();
let r = run(dir);
if (r.status === 0) failures.push(`expected CANNOT-MEASURE (nonzero) with no public/ dir at all, got 0`);
fs.rmSync(dir, { recursive: true, force: true });

dir = mk(); fs.mkdirSync(path.join(dir, "public"));
r = run(dir);
if (r.status === 0) failures.push(`expected FAIL (NO-SITEMAP) with public/ but no sitemap.xml, got 0`);

fs.writeFileSync(path.join(dir, "public", "sitemap.xml"), "<urlset></urlset>");
r = run(dir);
if (r.status === 0) failures.push(`expected FAIL (EMPTY-SITEMAP) with zero <url> entries, got 0`);

fs.writeFileSync(path.join(dir, "public", "sitemap.xml"), "<urlset><url><loc>https://x/</loc></url></urlset>");
r = run(dir);
if (r.status !== 0) failures.push(`expected PASS with one real <url>, got ${r.status}\n${r.stdout}${r.stderr}`);

fs.writeFileSync(path.join(dir, "public", "robots.txt"), "User-agent: *\nDisallow: /\n");
r = run(dir);
if (r.status === 0) failures.push(`expected FAIL (ROBOTS-BLOCKS-ALL) after adding a blanket disallow, got 0`);
fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) { console.error("check-sitemaps:selftest FAILED\n" + failures.join("\n\n")); process.exit(1); }
console.log("check-sitemaps:selftest OK"); process.exit(0);
