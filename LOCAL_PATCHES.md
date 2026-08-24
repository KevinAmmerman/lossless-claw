# LOCAL_PATCHES.md

## Workspace patches (applied in TypeScript source, not dist)

These patches are committed on the `workspace-patches` branch in
`~/lossless-claw-src/`. They survive `npm run build` (rebuilt from source).
Reapply after rebasing onto a new upstream release.

**Base**: upstream `v0.15.3` (`e965ec5`). Cherry-picks #939, #935, #981 are
included upstream ≤ v0.15.0 and no longer live on the branch.

## Active post-v0.15.3 cherry-picks (workspace-patches)

| Commit(s) | Content |
|-----------|---------|
| `f7cb743` | LOCAL_PATCH: public-agent scope restriction + 300ms retry backoff 035b |
| `67b487d` | search bounds (julianday→ISO + SQL LIMIT), batched deleteMessages, configurable publicAgentSessionPrefixes, queue error logs |
| `b42c783` | type-safe getMessagesByIds fallback for mock stores |

**Dropped (included upstream ≤ v0.15.0):**
- **#939** — whitespace-divergent same-turn dedup (`763ad06` upstream)
- **#935** — never-ingested recovery decorated-row dedup (`2b84753` upstream)
- **#981** — doctor apply by conversation id (`189efba` upstream)

**Skipped**:
- **#1000/#1002** — previously-regressive PRs landed in revised, safe form
  upstream (v0.15.x, `d3acd24`, `8ead658`); no longer skipped.

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

3. **Search bounds + batched store ops + configurable public-agent scope + queue error logs** — `src/store/conversation-store.ts`, `src/db/config.ts`, `src/engine.ts`, `src/batch-dedup.ts`, `src/retrieval.ts`
   - Replace `julianday(created_at)` filters with direct ISO comparisons; bound
     regex search SQL with a `LIMIT` (`MAX_ROW_SCAN`).
   - Batch `deleteMessages` in a transaction; add `getMessagesByIds` for expand.
   - Make the public-agent prefix list configurable via `publicAgentSessionPrefixes`
     (secure defaults in `config.ts`).
   - Log previously-swallowed session-queue predecessor failures.
   - No upstream equivalent as of origin/main 2026-08-24.

4. **Type-safe `getMessagesByIds` fallback for mock stores** — `src/retrieval.ts`
   - Provide a type-safe `getMessagesByIds` fallback so mock stores compile
     against the new batched lookup.
   - No upstream equivalent.

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
