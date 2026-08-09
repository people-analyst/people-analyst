#!/usr/bin/env node
/**
 * check-artifacts.mjs — the portable artifact-integrity kit. AGE and DRIFT, in one pass.
 *
 * KIT_VERSION: 1.2.0
 *
 * WHY ONE KIT AND NOT TWO. Two repos independently built a "freshness" checker in the same week,
 * with the same filename, answering DIFFERENT questions — and neither knew about the other:
 *
 *   · people-analytics-toolbox (MEJ-14) fingerprints an artifact's declared `inputs` and asks
 *     "does this still match what it was built FROM?" — CONTENT DRIFT.
 *   · devplane (HO-1577) compares an embedded `generated_at` against a declared max age and asks
 *     "did the producer stop running?" — WALL-CLOCK AGE.
 *
 * NEITHER CATCHES THE OTHER'S FAILURE, and this is the whole argument for the kit. A drift gate is
 * blind to a producer that died, because if nothing rebuilt the artifact its inputs still match — and
 * that is exactly HO-1577, where a feed sat 105h stale while consumers were gated at 48h and no
 * scheduled refresh existed at all. An age gate is blind to an artifact rebuilt WRONG, because a
 * fresh timestamp says nothing about whether the content still follows from its sources — and that is
 * exactly MEJ-14, where one artifact was rebuilt three times with materially different logic while
 * its edition label never moved. One label, three meanings.
 *
 * So an artifact may declare either or both. Declaring neither is UNTRACKED, which is reported and is
 * not a pass — an artifact nobody declared is one nobody will notice rotting.
 *
 * PORTABILITY. No cross-repo registry, no network, no model, no imports outside node builtins. It
 * reads `.artifact-contracts.json` from the repo it is run in and checks only that repo's artifacts.
 * You can only be accountable for what you produce or consume; sweeping another repo's directory is
 * how a gate ends up crying wolf about someone else's files and gets switched off.
 *
 * VERDICTS. Seven, and only two are failures — keeping the rest apart is the point:
 *   FRESH            within max age, and fingerprints match
 *   STALE-BY-AGE     older than its declared max age            → FAILURE
 *   STALE-BY-DRIFT   an input's fingerprint no longer matches   → FAILURE
 *   FROZEN           max_age_hours: null — old BY DESIGN (a baseline, a one-off report)
 *   MISSING          declared and not on disk — "never produced" ≠ "produced long ago"
 *   UNVERIFIABLE     present but carries no timestamp/fingerprint we can trust
 *   PENDING-UPSTREAM declared dependency another repo has not shipped yet — never a failure here
 *
 * File mtime is NOT a fallback for age: git does not store it, so after a clone every file reads as
 * "just now" and every check on it is a lie. Timestamps must live INSIDE the payload.
 *
 *   node scripts/kit/check-artifacts.mjs             # exit 1 on STALE-BY-AGE or STALE-BY-DRIFT
 *   node scripts/kit/check-artifacts.mjs --json
 *   node scripts/kit/check-artifacts.mjs --init      # scaffold .artifact-contracts.json from what it finds
 *   node scripts/kit/check-artifacts.mjs --fingerprint <artifact>   # print current input hashes
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const KIT_VERSION = "1.2.0";

const ROOT = process.cwd();
const CONTRACTS = path.join(ROOT, ".artifact-contracts.json");
const JSON_OUT = process.argv.includes("--json");
const INIT = process.argv.includes("--init");
const FP = process.argv.includes("--fingerprint") ? process.argv[process.argv.indexOf("--fingerprint") + 1] : null;

const TS_KEYS = ["generated_at", "generatedAt", "generated", "ran_at", "ranAt", "built_at", "builtAt", "checkedAt", "updated_at", "updatedAt"];
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function readTimestamp(file) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return { state: "MISSING" }; }
  let obj;
  try { obj = JSON.parse(raw); } catch { return { state: "UNVERIFIABLE", why: "not JSON" }; }
  const key = TS_KEYS.find((k) => obj && typeof obj === "object" && obj[k]);
  if (!key) return { state: "UNVERIFIABLE", why: `no embedded timestamp (looked for ${TS_KEYS.slice(0, 3).join(", ")})` };
  const t = Date.parse(obj[key]);
  if (Number.isNaN(t)) return { state: "UNVERIFIABLE", why: `${key} is not a parseable date` };
  return { state: "OK", at: t, key, iso: String(obj[key]), obj };
}

/** Hash each declared input. A missing input is its own answer, never a silent pass. */
function fingerprintInputs(inputs) {
  const out = {};
  for (const rel of inputs ?? []) {
    const f = path.join(ROOT, rel);
    try { out[rel] = sha(fs.readFileSync(f)); }
    catch { out[rel] = "MISSING"; }
  }
  return out;
}

if (FP) {
  const c = JSON.parse(fs.readFileSync(CONTRACTS, "utf8")).artifacts.find((a) => a.path === FP || a.id === FP);
  if (!c) { console.error(`no contract for ${FP}`); process.exit(2); }
  console.log(JSON.stringify(fingerprintInputs(c.inputs), null, 2));
  process.exit(0);
}

if (INIT) {
  const found = [];
  // RECURSIVE, capped. The first version scanned four directories one level deep and reported
  // "0 artifacts" for 21 repos — including performix, whose artifacts sit in data/research/ at depth
  // two. A scaffold that finds nothing installs a gate that watches nothing, which is
  // presence-without-capability at scale. Depth 4 with the usual excludes covers every layout seen
  // in this portfolio; anything deeper should be declared by hand rather than discovered.
  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".vercel", "tmp", ".cache"]);
  const walk = (dir, depth) => {
    if (depth > 4) return [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const out = [];
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(full, depth + 1));
      else if (e.name.endsWith(".json")) out.push(full);
    }
    return out;
  };
  for (const sub of ["data", "docs", "content", "public"]) {
    const d = path.join(ROOT, sub);
    if (!fs.existsSync(d)) continue;
    for (const full of walk(d, 1)) {
      const f = path.relative(ROOT, full);
      const ts = readTimestamp(full);
      // SCAFFOLD NOTHING IT CANNOT JUSTIFY. An earlier version wrote max_age_hours: 168 as a
      // placeholder and two repos went RED ON ARRIVAL — corpus-library 4 of 4, pa-site 1 of 2 —
      // purely from a number this tool invented. A gate that is red the day it lands gets bypassed
      // rather than filled in, which is how SKIP_ flags are born. So the scaffold records WHAT WAS
      // FOUND and declares NOTHING: no max_age, no inputs. That yields UNTRACKED — reported on every
      // run, never a failure — which is the honest state: we found an artifact and nobody has said
      // yet what freshness means for it.
      if (ts.state === "OK") found.push({ id: path.basename(f).replace(/\.json$/, ""), path: f, producer: "TODO", observedTimestamp: ts.iso, note: `auto-scaffolded ${new Date().toISOString().slice(0, 10)}. UNTRACKED until someone declares max_age_hours (or null for frozen-by-design) and/or inputs[]. Do not invent a number — pick one a consumer actually depends on.` });
    }
  }
  const doc = { kitVersion: KIT_VERSION, note: "Artifact integrity contracts. AGE (max_age_hours + embedded generated_at) and DRIFT (inputs[] fingerprints) are independent — declare either or both. max_age_hours: null means FROZEN BY DESIGN. Neither declared = UNTRACKED, which is reported and is not a pass.", artifacts: found };
  if (fs.existsSync(CONTRACTS)) { console.error(`${CONTRACTS} already exists — refusing to overwrite. Merge by hand.`); process.exit(2); }
  fs.writeFileSync(CONTRACTS, JSON.stringify(doc, null, 2));
  console.log(`scaffolded .artifact-contracts.json with ${found.length} artifact(s), all UNTRACKED by design — the scaffold declares nothing it cannot justify. Fill in max_age_hours and/or inputs[] per artifact; UNTRACKED is reported every run and never fails the gate.`);
  process.exit(0);
}

let contracts;
try { contracts = JSON.parse(fs.readFileSync(CONTRACTS, "utf8")); }
catch { console.error(`no .artifact-contracts.json in ${ROOT}\n  scaffold one:  node scripts/kit/check-artifacts.mjs --init`); process.exit(2); }

/**
 * BORN TRACKED — adopted from people-analytics-toolbox's MEJ-14, which is the better half of this idea.
 *
 * Their discipline: register an artifact in the contracts table BEFORE its first commit, so it cannot
 * exist for even one commit without staleness being detectable. Their own notes record what happens
 * without it — `occupation-grain.json` carried a published magazine headline ("84 detailed SOCs, mean
 * 11.4") and was fingerprinted but UNVERIFIABLE for weeks, in a directory discovery never scanned. It
 * was stale when finally checked.
 *
 * Checkable rather than aspirational: compare the contract's `declaredAt` against the artifact's
 * first-commit date from git. Retro-fitted contracts are NORMAL for artifacts that predate the kit and
 * are reported, never failed — the point is that "we declared this late" stays visible instead of
 * being indistinguishable from "this was always covered".
 */
function firstCommitDate(rel) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%aI", "--", rel],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? Date.parse(lines[lines.length - 1]) : null;
  } catch { return null; }
}

const rows = [];
for (const c of contracts.artifacts ?? []) {
  const base = { id: c.id, path: c.path, note: c.note };
  if (c.declaredAt) {
    const born = firstCommitDate(c.path);
    if (born !== null) {
      base.bornTracked = Date.parse(c.declaredAt) <= born;
      if (!base.bornTracked) base.trackedLateBy = `${Math.round((Date.parse(c.declaredAt) - born) / 8.64e7)}d`;
    }
  }

  if (c.pendingUpstream) { rows.push({ ...base, verdict: "PENDING-UPSTREAM", why: c.pendingUpstream.why, askedFor: c.pendingUpstream.askedFor }); continue; }

  const declaresAge = c.max_age_hours !== undefined;
  const declaresDrift = Array.isArray(c.inputs) && c.inputs.length > 0;
  if (!declaresAge && !declaresDrift) { rows.push({ ...base, verdict: "UNTRACKED", why: "declares neither max_age_hours nor inputs[] — nothing about it can be checked" }); continue; }

  const file = path.join(ROOT, c.path);
  const ts = readTimestamp(file);
  if (ts.state === "MISSING") { rows.push({ ...base, verdict: "MISSING", why: "declared but not on disk" }); continue; }

  // DRIFT first: an artifact can be fresh by the clock and wrong by its inputs, and that is the
  // failure an age check structurally cannot see.
  if (declaresDrift) {
    const now = fingerprintInputs(c.inputs);
    const recorded = (ts.obj && (ts.obj.inputFingerprints || ts.obj._inputs)) || c.recordedFingerprints || null;
    if (!recorded) {
      rows.push({ ...base, verdict: "UNVERIFIABLE", why: "declares inputs[] but the artifact carries no inputFingerprints to compare against — its builder must record them at write time" });
      continue;
    }
    const drifted = Object.entries(now).filter(([k, v]) => recorded[k] !== v);
    if (drifted.length) {
      rows.push({ ...base, verdict: "STALE-BY-DRIFT", drifted: drifted.map(([k, v]) => ({ input: k, now: v === "MISSING" ? "MISSING" : v.slice(0, 12), recorded: String(recorded[k] ?? "absent").slice(0, 12) })) });
      continue;
    }
  }

  if (declaresAge) {
    if (ts.state === "UNVERIFIABLE") { rows.push({ ...base, verdict: "UNVERIFIABLE", why: ts.why }); continue; }
    if (c.max_age_hours === null) { rows.push({ ...base, verdict: "FROZEN", ageHours: Math.round((Date.now() - ts.at) / 3.6e6) }); continue; }
    const ageH = (Date.now() - ts.at) / 3.6e6;
    rows.push({ ...base, verdict: ageH <= c.max_age_hours ? "FRESH" : "STALE-BY-AGE", ageHours: Math.round(ageH * 10) / 10, maxAgeHours: c.max_age_hours, timestamp: ts.iso });
    continue;
  }

  rows.push({ ...base, verdict: "FRESH", note: "drift-tracked only; no age declared" });
}

const by = (v) => rows.filter((r) => r.verdict === v);
const failing = [...by("STALE-BY-AGE"), ...by("STALE-BY-DRIFT"), ...by("MISSING")];

if (JSON_OUT) {
  console.log(JSON.stringify({ kitVersion: KIT_VERSION, ok: failing.length === 0, counts: Object.fromEntries(["FRESH", "STALE-BY-AGE", "STALE-BY-DRIFT", "FROZEN", "MISSING", "UNVERIFIABLE", "UNTRACKED", "PENDING-UPSTREAM"].map((v) => [v, by(v).length])), rows }, null, 2));
  process.exit(failing.length ? 1 : 0);
}

console.log(`[check-artifacts ${KIT_VERSION}] age AND drift, for ${path.basename(ROOT)}\n`);
console.log(`  FRESH ${by("FRESH").length} · STALE-AGE ${by("STALE-BY-AGE").length} · STALE-DRIFT ${by("STALE-BY-DRIFT").length} · FROZEN ${by("FROZEN").length} · MISSING ${by("MISSING").length} · UNVERIFIABLE ${by("UNVERIFIABLE").length} · UNTRACKED ${by("UNTRACKED").length} · PENDING ${by("PENDING-UPSTREAM").length}   (of ${rows.length})`);

for (const r of by("STALE-BY-AGE")) console.log(`\n  ✖ STALE BY AGE   ${r.id}  ${r.path}\n      ${r.ageHours}h old, max ${r.maxAgeHours}h  (${r.timestamp})`);
for (const r of by("STALE-BY-DRIFT")) {
  console.log(`\n  ✖ STALE BY DRIFT ${r.id}  ${r.path}`);
  for (const d of r.drifted) console.log(`      ${d.input}: recorded ${d.recorded}… now ${d.now}…`);
  console.log(`      The artifact no longer follows from its inputs. Its age says nothing about this.`);
}
for (const r of by("MISSING")) console.log(`\n  ✖ MISSING        ${r.id}  ${r.path} — ${r.why}`);
if (by("UNTRACKED").length) {
  console.log(`\n  ⓘ UNTRACKED (reported, not a pass):`);
  for (const r of by("UNTRACKED")) console.log(`      ${r.id} — ${r.why}`);
}
if (by("UNVERIFIABLE").length) {
  console.log(`\n  ⓘ UNVERIFIABLE (counted as neither — an unanswerable question is not a clean bill):`);
  for (const r of by("UNVERIFIABLE")) console.log(`      ${r.id} — ${r.why}`);
}
if (by("PENDING-UPSTREAM").length) {
  console.log(`\n  ⏳ PENDING UPSTREAM (declared dependency, not our failure):`);
  for (const r of by("PENDING-UPSTREAM")) console.log(`      ${r.id} — ${r.why}`);
}
const late = rows.filter((r) => r.bornTracked === false);
const born = rows.filter((r) => r.bornTracked === true);
if (born.length || late.length) {
  console.log(`\n  ⓘ BORN TRACKED ${born.length} · declared late ${late.length} (MEJ-14 discipline — reported, never failed):`);
  for (const r of late) console.log(`      ${r.id} — contract written ${r.trackedLateBy} after the artifact's first commit; it existed unwatched for that long`);
}

if (!failing.length) console.log(`\n✓ nothing stale by age or by drift.`);
console.log("");
process.exit(failing.length ? 1 : 0);
