#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-one-source-of-truth.mjs");
const CLEAN = `### What I'm building\n\n- **[Thing](https://example.com/thing)** — a thing.\n- **[Other](https://example.com/other)** — another.\n`;
const DUP = CLEAN + `- **[Thing](https://example.com/thing-mirror)** — same name, second URL.\n`;
function run(text) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "osot-"));
  const f = path.join(dir, "README.md"); fs.writeFileSync(f, text);
  const r = spawnSync(process.execPath, [CHECK, "--file", f], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true }); return r;
}
const failures = [];
let r = run(CLEAN);
if (r.status !== 0) failures.push(`expected PASS on a clean roster, got ${r.status}\n${r.stdout}`);
r = run(DUP);
if (r.status === 0) failures.push(`expected FAIL after "Thing" was given a second URL, stayed PASS`);
if (failures.length) { console.error("check-one-source-of-truth:selftest FAILED\n" + failures.join("\n\n")); process.exit(1); }
console.log("check-one-source-of-truth:selftest OK"); process.exit(0);
