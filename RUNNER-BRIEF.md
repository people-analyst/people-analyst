# Context: our cloud runner (set up 2026-09-17) — read this before doing any work

We created a Linux cloud machine on Hetzner called **`devplane-runner`** (8 cores, 16 GiB RAM, Ubuntu 24.04,
Falkenstein, about €82/month, hourly billed). It exists because the laptop has 8 GiB and sleeps, which starved
agents and dropped scheduled jobs. **The box is now where all unattended, heavy and long-running work runs:**
builds, tests, scheduled programs, and coding-agent workers. **The laptop is the cockpit only:** conversations,
the browser, reading diffs.

**What is on it:** every one of our 34 registered repos, cloned at the same paths as the laptop
(`/Users/mikewest` is a symlink to `/home/mikewest` there); node 22; the Cursor CLI (`cursor-agent`), Codex
(`codex`), Claude Code (`claude`), GitHub (`gh`) and Vercel CLIs, all logged in as Mike on his existing
subscriptions; the 66 scheduled jobs that used to run on the laptop, now systemd timers there; and the devplane
server. **No cloud agents of any kind:** they cost extra, and the box replaces them.

**How to use it from the laptop** (alias and SSH key are already installed):

| Do this | Command |
|---|---|
| Open a shell there | `ssh runner` |
| Run a command in devplane there | `node ~/devplane/bin/runner.mjs -- '<command>'` |
| Run a command in another repo there | `node ~/devplane/bin/runner.mjs --repo <repo-name> -- <command>` |
| Start a Claude fleet worker there | `node ~/devplane/bin/fleet.mjs run --repo <dir> --prompt-file <f> ...` (routes automatically) |
| Start a Cursor worker there | `node ~/devplane/bin/runner.mjs cursor --repo <repo-name> --prompt-file <f> --label <slug> --branch <b>` |
| List workers / box health | `node ~/devplane/bin/runner.mjs runs` · `node ~/devplane/bin/runner.mjs status` |
| Interactive Codex / Claude / Cursor CLI on the box | `runner codex` · `runner claude` · `runner cursor-agent` |

Repo names are the ones in `~/devplane/infra/runner/repos.json`. Full reference:
`~/devplane/docs/OPERATIONS/RUNNER.md`. Decision record: `~/devplane/docs/DECISIONS/2026-09-17-off-laptop-agent-runner.md`.

**Rules**
1. Do not build, test, install or run agents on the laptop; do it on the box.
2. Commit on the box, on a branch, by explicit file paths. **Never push:** Mike's policy is one batched push per
   repo per day, because every push costs a Vercel build. The conductor pushes.
3. The box is the only scheduler. Never load launchd jobs on the laptop (its job wrapper refuses to run anyway).
4. Screen work (browser, screenshots, the Cursor app) stays on the laptop.
5. If the box lacks something, say so instead of working around it on the laptop.
