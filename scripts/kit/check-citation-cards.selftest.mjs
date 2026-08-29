#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-citation-cards.mjs");
function setup(ledger) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "citations-"));
  fs.writeFileSync(path.join(dir, "README.md"), "We run 45+ services for our customers.\n");
  if (ledger) fs.writeFileSync(path.join(dir, ".claim-ledger.json"), JSON.stringify(ledger));
  return dir;
}
function run(dir) { return spawnSync(process.execPath, [CHECK, "--file", path.join(dir, "README.md")], { encoding: "utf8" }); }
const failures = [];
let dir = setup(null);
let r = run(dir);
if (r.status === 0) failures.push(`expected FAIL with no ledger at all, stayed PASS\n${r.stdout}`);
fs.rmSync(dir, { recursive: true, force: true });

dir = setup({ claims: [{ pattern: "45+", falsifier: "count services in the registry", lastVerified: "2026-08-29" }] });
r = run(dir);
if (r.status !== 0) failures.push(`expected PASS with a covering ledger entry, got ${r.status}\n${r.stdout}`);

fs.writeFileSync(path.join(dir, ".claim-ledger.json"), JSON.stringify({ claims: [{ pattern: "45+", falsifier: "", lastVerified: "2026-08-29" }] }));
r = run(dir);
if (r.status === 0) failures.push(`expected FAIL after blanking the falsifier field, stayed PASS`);
fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) { console.error("check-citation-cards:selftest FAILED\n" + failures.join("\n\n")); process.exit(1); }
console.log("check-citation-cards:selftest OK"); process.exit(0);
