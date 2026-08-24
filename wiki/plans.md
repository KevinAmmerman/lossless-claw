# Plans — lossless-claw

> Implementation plans from the `improve` skill that touch `lossless-claw`.
> Source: `~/plans/` (absolute: `/home/openclaw/plans/`).
> Links below use relative paths from this wiki directory to `~/plans/`.

## Status table

| # | Title | Priority | Effort | Depends on | Status |
|---|-------|----------|--------|------------|--------|
| [027](../../plans/027-rebuild-lossless-claw-dist.md) | Rebuild lossless-claw dist to fix missing `@mariozechner/pi-ai` (renamed to `@earendil-works`) | P1 | S | — | DONE |
| [035](../../plans/035-lcm-retry-backoff.md) | LCM retry: skip on module-not-found + add backoff between same-candidate retries | P2 | S | 027 | DONE |
| [036](../../plans/036-automate-local-patches.md) | Automate LOCAL_PATCHES reapplication (lost on lossless-claw rebuild) | P3 | M | 027 | DONE |
| [061](../../plans/061-skip-lossless-claw-0.13.1-until-issue-916-fixed.md) | Skip lossless-claw 0.13.1 update until P1 regression #916 is fixed | P2 | S | — | DONE |
| [062](../../plans/062-switch-lossless-claw-compaction-model-to-umans.md) | Switch lossless-claw compaction model to umans/umans-glm-5.2 + clear stuck pending compactions | P0 | S | — | DONE |
| [063](../../plans/063-prune-lcm-db-junk.md) | Prune LCM DB junk — archived/orphaned conversations + VACUUM | P1 | M | 062 | DONE |
| [101](../../plans/101-lossless-claw-source-setup.md) | Source-Checkout aufsetzen, bauen und linken — LOCAL_PATCHES von Dist auf TypeScript migrieren | P1 | M | — | DONE |
| [102](../../plans/102-cherry-pick-967-same-turn-collapse.md) | Cherry-pick PR #967 — fix(dedup): collapse metadata-wrapped runtime copy (v0.13.2 regression #965) | P0 | S | 101 | DONE |
| [103](../../plans/103-cherry-pick-968-retry-reappend-guard.md) | Cherry-pick PR #968 — fix(reconcile): guard entry-id imports against retry re-appends (#966) | P1 | S | 101 | DONE |
| [104](../../plans/104-lossless-claw-release-update-strategy.md) | Release-Update-Strategie — nächsten Release abwarten, Cherry-Picks droppen | P2 | S | 101 | DONE _(executed via Plan 170, then 400 on 2026-08-24 — see below)_ |
| [170](../../plans/170-upgrade-lossless-claw-to-v0.14.0.md) | Upgrade workspace-patches to upstream v0.14.0 + reapply LOCAL_PATCHES | P0 | M | 101, 104 | DONE |
| [171](../../plans/171-cherry-pick-post-0.14-reliability-prs.md) | Cherry-pick post-0.14 PRs #1000, #939, #935, #981 | P1 | M | 170 | DONE (#1000 skipped) |
| [172](../../plans/172-lcm-search-sql-limit-and-index-friendly-timestamps.md) | Regex SQL LIMIT + drop julianday() on created_at | P1 | S | 170 | DONE |
| [173](../../plans/173-batch-store-deletes-and-expansion-lookups.md) | Batch deleteMessages + expand + identity-overlap N+1 | P1 | M | 170 | DONE |
| [174](../../plans/174-configurable-public-agent-lcm-scope.md) | Configurable public-agent LCM scope prefixes | P1 | S | 170 | DONE |
| [175](../../plans/175-session-queue-error-visibility.md) | Log swallowed session-queue errors | P2 | S | 170 | DONE |
| [176](../../plans/176-lcm-precision-config-tuning.md) | Live config: promptAwareEviction + summary thinking | P1 | S | 170 | DONE |
| [177](../../plans/177-lcm-ops-health-and-duplicate-audit.md) | Doctor + duplicate audit + metrics baseline | P2 | M | 170 | DONE (see 177-report.md) |
| [178](../../plans/178-monitor-and-absorb-upstream-0.14.1.md) | Monitor/absorb v0.14.1+ (#1002 …) | P2 | S–M | 170 | TODO |

## Summary

- **Total plans**: 19
- **DONE**: 18
- **TODO**: 1 (178 — wait for next upstream release)

## Wave 1: npm-installed plugin era (Plans 027–063)

### Plan 027 — dist rebuild / dependency rename fix (DONE)

The installed dist referenced `@mariozechner/pi-ai` and
`@mariozechner/pi-agent-core`, which were renamed to `@earendil-works/*`
(declared in `package.json` and installed in `node_modules`). Every LCM
compaction fired 4–6 failing `import()` attempts before falling back to
truncation, causing event-loop saturation. Fix: dist string-patched 4
occurrences `mariozechner` → `earendil-works` (no TS source to rebuild).
Marker: `LOCAL_PATCH_plan027_mariozechner_to_earendilworks`. Gateway restart
cleared the storm (health 4.7s → 16ms).

> **Note**: Plan 027 is no longer needed after Plan 101 — the source build
> uses `--external:"@earendil-works/*"` natively.

### Plan 035 — retry backoff (DONE)

Two dist patches to the LCM retry loop:
- **035a**: detect `ERR_MODULE_NOT_FOUND` / `Cannot find package` and skip the
  conservative retry (deterministic failure — guaranteed to fail identically).
- **035b**: 300ms `setTimeout` backoff before the conservative retry (was 70ms
  = just async overhead, rapid-firing API calls on transient errors).

Both marked `LOCAL_PATCH plan035a` / `LOCAL_PATCH plan035b` in `dist/index.js`.
`node --check` verified. `LOCAL_PATCHES.md` updated.

> **Note**: After Plan 101, 035a is no longer needed (source handles
  module-not-found correctly). 035b was migrated to TypeScript source
  (`src/summarize.ts`).

### Plan 036 — automate LOCAL_PATCHES reapplication (DONE)

Created `~/scripts/apply-local-patches.sh` — an idempotent script that
reapplies all LOCAL_PATCHES dist patches after a plugin reinstall/update.
Detects existing markers and skips if already applied. `node --check` verified.

> **Note**: After Plan 101, this script is no longer needed for lossless-claw
> (patches are in TypeScript source). Kept for other plugins.

### Plan 061 — skip 0.13.1 update (DONE)

Scout check on 2026-06-25 found lossless-claw 0.13.1 available (installed
0.12.0). The 0.13.x line bundles attractive fixes, but #916 (afterTurn
silent-skip on lcm self-reload) is a P1 regression. Recorded the skip in
scout's skip-list. Scout no longer surfaces 0.13.1 as an actionable update.

> **Note**: Skip-list cleared 2026-07-05 (we're now on source main beyond
> 0.13.2).

### Plan 062 — compaction model switch (DONE, P0)

The root-cause fix for the `EmbeddedAttemptSessionTakeoverError` storm (14×/24h).
Lossless-claw's compaction defaulted to `minimax-portal/MiniMax-M3` — the same
model rate-limited 4×/24h and shared across main + hori-wa + cron. When MiniMax
was rate-limited, compaction couldn't run, so the session file grew unbounded
(33 MB), and the maintenance rewrite during active turns triggered takeover
errors. Fix: set `summaryModel: "umans-glm-5.2"`, `summaryProvider: "umans"`,
added `umans/umans-glm-5.2` to `llm.allowedModels`, cleared 12 stuck pending
compactions. Result: 0 takeover errors since restart; `bytesFreed>0` observed.

### Plan 063 — LCM DB prune (DONE)

The LCM database was 2.6 GB with 224,723 messages. Deleted 1,705 junk
conversations (archived, orphaned, backfill), 87,167 messages, 2,648 summaries,
121,645 `message_parts`. `VACUUM` shrank the DB 2.6 GB → 1.8 GB. Active
conversations intact. `integrity_check=ok`.

## Wave 2: source-linked build era (Plans 101–104)

### Plan 101 — source setup + LOCAL_PATCHES migration (DONE)

Cloned upstream `main` @ `9561470f` to `~/lossless-claw-src/`. Created
`workspace-patches` branch. Migrated 2 LOCAL_PATCHES from dist to TypeScript
source:
1. Public-agent scope restriction → `src/tools/lcm-conversation-scope.ts`
2. Plan 035b retry backoff → `src/summarize.ts`

Plans 027 and 035a were NOT migrated (fixed in upstream source natively).
Backed up old npm plugin to `lossless-claw.npm-backup`. Symlinked source as
active plugin. Gateway restart: 25 plugins active, health 200, 0 errors.

### Plan 102 — cherry-pick #967: same-turn collapse fix (DONE, P0)

PR #927 (shipped in v0.13.2) introduced a regression: on hosts where inbound
messages arrive wrapped in the standard OpenClaw untrusted-metadata block
without a leading channel timestamp, the same-turn collapse no longer
recognizes the decorated runtime copy — **every inbound turn reached the
model twice**. PR #967 fixes this by adding `openClawInboundBodiesMatch()`.
Cherry-picked `32a74b693168` cleanly. 5 files changed, 107 insertions. 40 tests
pass (incl. 5 new). Build OK. Gateway restart: 0 errors.

### Plan 103 — cherry-pick #968: retry-reappend guard (DONE, P1)

When the host's retry/failover machinery re-appends the same logical inbound
event under a fresh transcript entry uuid (during provider-stall storms), the
reconcile path stored 2–5 duplicate rows per event. PR #968 adds
source-identity twin detection that skips replay duplicates. Cherry-picked
`3d295d4a5ae1` cleanly. 4 files changed, 345 insertions. 3 new tests pass.
Build OK. Gateway restart: 0 errors.

### Plan 104 — release update strategy (DONE)

> **Historical**: this prose describes the state at plan-write time (2026-07-05,
> upstream still v0.13.2, #967/#968 still OPEN). It is superseded — the
> release-update strategy was executed via Plan 170 (v0.14.0) and then Plan 400
> (v0.15.3) on 2026-08-24. See `LOCAL_PATCHES.md` for the current base and
> carried commits.

Checked upstream: latest release still v0.13.2 (no new tag). 6 unreleased
commits on `main` already in our source checkout. PRs #967 and #968 still
OPEN — cherry-picks remain necessary. Scout skip-list cleared for v0.13.1.
Re-run this plan when the next release tag appears: rebase `workspace-patches`,
drop cherry-picks that are now included, keep LOCAL_PATCHES, rebuild.

---

## Wave 75 (2026-08-24) — v0.15.3 upgrade + ops recovery + privacy tests (all DONE)

Deep-audit follow-up; full details in `~/plans/README.md` and `~/plans/400..404-*.md`.

| Plan | What | Status |
|------|------|--------|
| 400 | Upgrade onto upstream v0.15.3 (`e965ec5`); dropped absorbed cherry-picks #939/#935/#981; carried LOCAL_PATCH scope+backoff (`f7cb743`), perf commits (`67b487d`, `b42c783`) | DONE |
| 401 | summaryModel KEEP `umans-deepseek-v4-flash-0731` documented; archived debt rows 3238+3292 cancelled; `lcm.db.rotate-latest.bak` → `~/backups/plugin-archives/` | DONE |
| 402 | Privacy-guard regression tests (`test/lcm-conversation-scope.test.ts`, 6 cases) | DONE |
| 403 | Cherry-picks #1051 + #1064 (4 commits incl. changesets; still OPEN upstream — drop at next upgrade if merged) | DONE |
| 404 | Doc sync (this wiki + LOCAL_PATCHES.md) | DONE |

Branch: `workspace-patches` = v0.15.3 + 8 commits. Watch item: active pending
debt rows {3229, 3297, 3298} — if `compacted_but_still_over_target` floods
return within 48h of 2026-08-24, open a follow-up plan (root-cause hypothesis
in Plan 401 / audit OPS-01).
