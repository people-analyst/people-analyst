#!/usr/bin/env node
/**
 * check-gate-conflicts:selftest — proves the auditor itself can go red.
 *
 * Builds a synthetic scripts/ tree with one well-behaved check (has a selftest, refuses
 * to pass on empty input), points check-gate-conflicts.mjs at it, and expects GREEN.
 * Then mutates that tree two ways — the two bad conditions the auditor exists to catch —
 * and expects RED each time. If any expectation is wrong, this exits non-zero.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDITOR = path.join(HERE, "check-gate-conflicts.mjs");

const GOOD_CHECK = `#!/usr/bin/env node
import fs from "node:fs";
let cfg;
try { cfg = JSON.parse(fs.readFileSync("config.json", "utf8")); }
catch { console.error("CANNOT-MEASURE: no config.json"); process.exit(2); }
process.exit(cfg.shouldFail ? 1 : 0);
`;

const GOOD_SELFTEST = `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "check-good.mjs");
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "good-check-"));
fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ shouldFail: true }));
const red = spawnSync(process.execPath, [target], { cwd: dir });
fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ shouldFail: false }));
const green = spawnSync(process.execPath, [target], { cwd: dir });
fs.rmSync(dir, { recursive: true, force: true });
process.exit(red.status === 1 && green.status === 0 ? 0 : 1);
`;

const VACUOUS_CHECK = `#!/usr/bin/env node
// mutually-exclusive population filter and failure test — can never fire.
import fs from "node:fs";
let cfg;
try { cfg = JSON.parse(fs.readFileSync("config.json", "utf8")); } catch { cfg = {}; }
if (cfg.shouldFail) { /* population filter silently excludes the failing case */ process.exit(0); }
process.exit(0);
`;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "gate-conflicts-sandbox-"));
  fs.writeFileSync(path.join(dir, "check-good.mjs"), GOOD_CHECK);
  fs.writeFileSync(path.join(dir, "check-good.selftest.mjs"), GOOD_SELFTEST);
  return dir;
}

function runAuditor(root) {
  return spawnSync(process.execPath, [AUDITOR, "--root", root], { encoding: "utf8" });
}

const failures = [];

// Baseline: a well-behaved check with a real, passing sibling selftest.
let dir = sandbox();
let r = runAuditor(dir);
if (r.status !== 0) failures.push(`expected GREEN on a well-behaved check, got exit ${r.status}\n${r.stdout}${r.stderr}`);
fs.rmSync(dir, { recursive: true, force: true });

// Mutation 1: no selftest at all.
dir = sandbox();
fs.rmSync(path.join(dir, "check-good.selftest.mjs"));
r = runAuditor(dir);
if (r.status === 0) failures.push(`expected RED (NO-SELFTEST) after removing the selftest, stayed GREEN`);
fs.rmSync(dir, { recursive: true, force: true });

// Mutation 2: swap in the vacuous check (mutually-exclusive filter/failure test — can
// never fire). Its honest selftest (which expects shouldFail:true to produce exit 1)
// now correctly fails, which is exactly how the auditor is supposed to catch this class.
dir = sandbox();
fs.writeFileSync(path.join(dir, "check-good.mjs"), VACUOUS_CHECK);
r = runAuditor(dir);
if (r.status === 0) failures.push(`expected RED (SELFTEST-FAILED, since the vacuous check can't produce the exit its own selftest requires) for a mutually-exclusive check, stayed GREEN`);
fs.rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error("check-gate-conflicts:selftest FAILED\n" + failures.join("\n\n"));
  process.exit(1);
}
console.log("check-gate-conflicts:selftest OK — flips red under both bad-condition mutations, green on a well-behaved check.");
process.exit(0);
