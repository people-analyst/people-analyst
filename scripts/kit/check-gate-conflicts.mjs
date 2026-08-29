#!/usr/bin/env node
/**
 * check-gate-conflicts.mjs — Measurement Integrity: does this repo's checks certify anything?
 *
 * ADAPTED FROM: devplane `check:gate-conflicts`. Donor source was not available locally
 * (devplane is not checked out on this machine); this is a from-spec reimplementation
 * for THIS repo's shape — a handful of standalone scripts/kit/check-*.mjs scripts, not
 * devplane's larger check registry.
 *
 * THESIS: a check that cannot fail for any input is not a check, it is decoration. This
 * repo has exactly one bad-condition class to watch for gate authors, per DP-661:
 *   (a) a check whose population filter and failure test are mutually exclusive — no
 *       input could ever trip it. Found live elsewhere on 2026-08-29, introduced by the
 *       person hunting that exact defect, which is the argument for making this
 *       structural rather than trusting review.
 *   (b) a check that cannot reach its inputs reporting a clean pass instead of
 *       CANNOT-MEASURE — a green result standing in for an absent one.
 *
 * MECHANISM. Static review cannot settle "can this ever fail" — it has to be run. So:
 *   1. Every scripts/**\/check-*.mjs must ship a sibling check-*.selftest.mjs. No selftest
 *      = nobody has ever proven this check can go red = NO-SELFTEST (fail).
 *   2. That selftest is executed. Non-zero exit = the check did not flip red under a
 *      mutation designed to break it = SELFTEST-FAILED (fail).
 *   3. The check itself is run against a bare, empty directory (no config, no fixtures).
 *      Exit 0 there means it declared victory without anything to examine =
 *      GREEN-WITH-NO-INPUTS (fail) — this is bad condition (b) above.
 *
 * Zero check-*.mjs discovered at all is CANNOT-MEASURE, not a pass: an empty scan result
 * from a check that is supposed to audit other checks is exactly the "looked in the wrong
 * place and reported green" failure this task's own instructions warn about.
 *
 *   node scripts/kit/check-gate-conflicts.mjs [--root <dir>] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argRoot = process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : null;
const ROOT = argRoot ? path.resolve(argRoot) : path.resolve(HERE, "..", "..", "scripts");
const JSON_OUT = process.argv.includes("--json");
const SELF = fileURLToPath(import.meta.url);

function findCheckScripts(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...findCheckScripts(full)); continue; }
    if (!e.isFile()) continue;
    if (!/^check-.*\.mjs$/.test(e.name)) continue;
    if (e.name.endsWith(".selftest.mjs")) continue;
    if (path.resolve(full) === path.resolve(SELF)) continue; // don't audit itself here; its own selftest does that
    out.push(full);
  }
  return out;
}

function run(cmd, args, cwd, timeoutMs = 15000) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: timeoutMs });
  return { status: r.status ?? (r.signal ? 124 : 1), stdout: r.stdout || "", stderr: r.stderr || "" };
}

const scripts = findCheckScripts(ROOT);

if (scripts.length === 0) {
  const msg = `CANNOT-MEASURE: no scripts/**/check-*.mjs found under ${ROOT} — this instrument audits other checks and found none to audit. That is not the same as "all checks are fine."`;
  if (JSON_OUT) console.log(JSON.stringify({ verdict: "CANNOT-MEASURE", why: msg }));
  else console.error(msg);
  process.exit(1);
}

const rows = [];
for (const script of scripts) {
  const rel = path.relative(process.cwd(), script);
  const dir = path.dirname(script);
  const base = path.basename(script, ".mjs");
  const selftest = path.join(dir, `${base}.selftest.mjs`);

  if (!fs.existsSync(selftest)) {
    rows.push({ script: rel, verdict: "NO-SELFTEST", why: "no sibling *.selftest.mjs — nobody has proven this check can ever fail" });
    continue;
  }

  const st = run(process.execPath, [selftest], dir);
  if (st.status !== 0) {
    rows.push({ script: rel, verdict: "SELFTEST-FAILED", why: `selftest exited ${st.status}: ${(st.stderr || st.stdout).trim().slice(0, 300)}` });
    continue;
  }

  const emptyDir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "gate-conflicts-empty-"));
  try {
    const bare = run(process.execPath, [script], emptyDir);
    if (bare.status === 0) {
      rows.push({ script: rel, verdict: "GREEN-WITH-NO-INPUTS", why: "run against an empty directory with nothing to examine, and exited 0 anyway — a green result standing in for an absent one" });
      continue;
    }
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }

  rows.push({ script: rel, verdict: "CAN-FAIL", why: "has a selftest that passes, and refuses to pass when it has nothing to examine" });
}

const failing = rows.filter((r) => r.verdict !== "CAN-FAIL");

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failing.length === 0, rows }, null, 2));
  process.exit(failing.length ? 1 : 0);
}

console.log(`[check-gate-conflicts] audited ${rows.length} check script(s) under ${path.relative(process.cwd(), ROOT) || "."}\n`);
for (const r of rows) {
  const mark = r.verdict === "CAN-FAIL" ? "✓" : "✖";
  console.log(`  ${mark} ${r.verdict.padEnd(20)} ${r.script}${r.why ? `\n      ${r.why}` : ""}`);
}
console.log("");
if (failing.length) console.log(`✖ ${failing.length} of ${rows.length} check(s) are not provably capable of firing.`);
else console.log(`✓ every discovered check has a passing selftest and refuses to pass on an empty input.`);
process.exit(failing.length ? 1 : 0);
