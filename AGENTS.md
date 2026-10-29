# Agent orientation


## The cloud runner (2026-09-17) — read before doing any work

All unattended, heavy and long-running work runs on our Hetzner box `devplane-runner`, not the laptop. Read **[RUNNER-BRIEF.md](RUNNER-BRIEF.md)** in this repo (canonical: `~/devplane/docs/OPERATIONS/RUNNER-BRIEF.md`). No cloud agents. Commit on the box and push to GitHub; only Vercel builds are capped (≤2/repo/day).
