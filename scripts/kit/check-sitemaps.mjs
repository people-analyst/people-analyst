#!/usr/bin/env node
/**
 * check-sitemaps.mjs — adapted from devplane's `check:sitemaps` (donor source not
 * available locally; reimplemented from spec). THESIS: machine retrieval is the only
 * distribution channel. This repo is a GitHub profile README, not a deployed site — it
 * git-tracks no public/, no next.config, no sitemap.xml of its own. That is reported
 * honestly as CANNOT-MEASURE (this instrument has no site surface to examine here), never
 * as a pass, per the site's own gitignore history (dist/ is unrelated generated output,
 * explicitly excluded from this repo's primary content by DP-623). The mechanism is still
 * proven against a fixture that DOES have a site surface.
 *
 *   node scripts/kit/check-sitemaps.mjs [--root <dir>]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : process.cwd());
const PUBLIC = path.join(ROOT, "public");

if (!fs.existsSync(PUBLIC)) {
  console.error(`CANNOT-MEASURE: no public/ directory in ${ROOT} — this repo owns no deployable site surface for sitemap/robots to be checked against.`);
  process.exit(1);
}

const sitemapPath = path.join(PUBLIC, "sitemap.xml");
const robotsPath = path.join(PUBLIC, "robots.txt");

if (!fs.existsSync(sitemapPath)) { console.error(`✖ NO-SITEMAP: public/ exists but public/sitemap.xml does not.`); process.exit(1); }
const sitemap = fs.readFileSync(sitemapPath, "utf8");
const urlCount = (sitemap.match(/<url>/g) || []).length;
if (urlCount === 0) { console.error(`✖ EMPTY-SITEMAP: public/sitemap.xml declares zero <url> entries.`); process.exit(1); }

if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8");
  if (/Disallow:\s*\/\s*$/m.test(robots)) { console.error(`✖ ROBOTS-BLOCKS-ALL: robots.txt disallows / — the sitemap points at pages nothing can crawl.`); process.exit(1); }
}

console.log(`✓ public/sitemap.xml declares ${urlCount} URL(s), robots.txt does not blanket-disallow.`);
process.exit(0);
