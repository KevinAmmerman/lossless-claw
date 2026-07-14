# LOCAL_PATCHES.md

## Workspace patches (applied in TypeScript source, not dist)

These patches are committed on the `workspace-patches` branch in
`~/lossless-claw-src/`. They survive `npm run build` (rebuilt from source).
Reapply after rebasing onto a new upstream release.

**Base**: upstream `v0.14.0` (`e7f4cbd`). Cherry-picks #967 and #968 are
included in this release and no longer live on the branch.

## Active post-v0.14.0 cherry-picks (workspace-patches)

| PR | Commit(s) | Notes |
|----|-----------|--------|
| #939 | `a6e34a5` | whitespace-divergent same-turn dedup |
| #935 | `b59f101` | never-ingested recovery decorated-row dedup |
| #981 | `894a4ba` + `db53448` | doctor apply by conversation id |

**Skipped**:
- **#1000** — on v0.14.0 its ENOENT `transcriptCovered` change regresses
  `engine-compaction` oversized no-overlap + auto-compaction-summary dedup.
- **#1002** — emergency-drain `force=true` breaks
  `maintain() bounds provider-fallback recursive sweeps` (14 > maxSweepIterations 10).
  Wait for upstream revision / v0.14.1.

## Ops notes (workspace)

- `lossless-claw.npm-backup` moved out of `~/.openclaw/extensions/` to
  `~/backups/plugin-archives/` so it is not discovered as a second plugin.
- WhatsApp still loads from both `extensions/whatsapp` (2026.6.11, preferred)
  and npm package path (older) — host warning is benign override, not fixed
  here (needs OpenClaw install-path cleanup).

1. **Public-agent LCM scope restriction** — `src/tools/lcm-conversation-scope.ts`
   - Forces `agent:hori-wa-public:*`, `agent:hori-wa-public-group:*`, and
     `agent:hori-wa-public-group-kletter:*` sessions to current-conversation-only.
   - `allConversations=true` and explicit `conversationId` are ignored for these
     session keys (privacy: prevents cross-conversation context leakage in
     WhatsApp public groups).
   - Marker: `// LOCAL_PATCH: public-agent LCM scope restriction`

2. **Plan 035b — 300ms backoff before conservative retry** — `src/summarize.ts`
   - Adds `await new Promise((r) => setTimeout(r, 300))` before the conservative
     retry `attemptSummarizerCall("retry", ...)` call.
   - Prevents rapid-fire API calls on transient errors.
   - Marker: `// LOCAL_PATCH plan035b: 300ms backoff before conservative retry`

## No longer needed (fixed in upstream source or not applicable)

- **Plan 027** (`@mariozechner/*` → `@earendil-works/*`): The upstream build
  script already uses `--external:"@earendil-works/*"`.
- **Plan 035a** (skip retry on `ERR_MODULE_NOT_FOUND`): Upstream source handles
  module-resolution errors correctly.
- **PR #967 / #968**: Shipped in v0.14.0 (`8664c6e`, `3e05747`).

## OpenClaw core dist patches (not in lossless-claw-src)

These patches modify the compiled OpenClaw npm package dist files directly.
They are lost on `npm install -g openclaw`. Re-run
`node ~/scripts/patch-telegram-rich-fallback.mjs` after every OpenClaw
update. The script is idempotent.

1. **Plan 165 — Telegram rich message send/edit fallback** —
   `dist/send-C7dCVFUG.js`, `dist/delivery-CpWKd4cN.js`
   - Script: `~/scripts/patch-telegram-rich-fallback.mjs`
