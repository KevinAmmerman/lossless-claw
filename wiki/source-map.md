# Source Map

> File tree of the source-linked `lossless-claw` build at
> `~/lossless-claw-src/` (symlinked from `~/.openclaw/extensions/lossless-claw/`).
> This is a full upstream source checkout on branch `workspace-patches` with
> 2 LOCAL_PATCHES and 2 cherry-picks on top of upstream `main` @ `9561470f`.

```
lossless-claw-src/                      # Source root (git repo, branch: workspace-patches)
├── index.ts                            # Plugin entry point and registration
├── src/
│   ├── engine.ts                       # LcmContextEngine — implements ContextEngine interface
│   ├── assembler.ts                    # Context assembly (summaries + messages → model context)
│   ├── compaction.ts                   # CompactionEngine — leaf passes, condensation, sweeps
│   ├── summarize.ts                    # Depth-aware summarization ★ LOCAL_PATCH plan035b (300ms backoff)
│   ├── retrieval.ts                    # RetrievalEngine — grep, describe, expand
│   ├── expansion.ts                    # DAG expansion logic for lcm_expand_query
│   ├── expansion-auth.ts               # Delegation grants for sub-agent expansion
│   ├── expansion-policy.ts             # Depth/token policy for expansion
│   ├── large-files.ts                  # File interception, storage, exploration summaries
│   ├── batch-dedup.ts                  # Batch deduplication (whitespace-divergent faces upstream since v0.15.0)
│   ├── transcript-reconciler.ts        # Transcript reconciliation (decoration-adoption upstream since v0.15.0)
│   ├── transcript.ts                   # Transcript reading utilities
│   ├── transcript-repair.ts            # Tool-use/result pairing sanitization
│   ├── types.ts                        # Core type definitions
│   ├── openclaw-bridge.ts              # Bridge utilities
│   ├── openclaw-inbound-metadata.ts    # OpenClaw inbound metadata parsing
│   ├── openclaw-sender-metadata.ts     # WhatsApp sender identity (messages.openclaw_sender_metadata column, allowlisted fields)
│   ├── stable-event-key.ts             # Stable per-event dedup keys (responseId→toolCallId→role+conversation+ms) + partial unique index
│   ├── value-utils.ts                  # Shared utility functions
│   ├── plugin/
│   │   └── openclaw-agent-ids.ts       # Resolves configured agent ids from command-time config (doctor cleaners use exact prefix match)
│   ├── db/
│   │   ├── config.ts                   # LcmConfig resolution from env vars
│   │   ├── connection.ts               # SQLite connection management
│   │   └── migration.ts                # Schema migrations
│   ├── store/
│   │   ├── conversation-store.ts       # Message persistence and retrieval (sender-metadata + stable-event-key columns; batched deletes/search bounds are workspace-local)
│   │   ├── summary-store.ts            # Summary DAG persistence and context item management
│   │   ├── message-identity.ts        # Message identity hash computation
│   │   └── fts5-sanitize.ts            # FTS5 query sanitization
│   └── tools/
│       ├── lcm-grep-tool.ts            # lcm_grep tool implementation
│       ├── lcm-describe-tool.ts        # lcm_describe tool implementation
│       ├── lcm-expand-tool.ts          # lcm_expand tool (sub-agent only)
│       ├── lcm-expand-query-tool.ts    # lcm_expand_query tool (main agent wrapper)
│       ├── lcm-describe-id.ts          # lcm_describe id/reference-string parsing helpers
│       ├── lcm-conversation-scope.ts   # Conversation scoping ★ LOCAL_PATCH (public-agent restriction; regression-tested in test/lcm-conversation-scope.test.ts)
│       └── common.ts                   # Shared tool utilities
├── dist/                               # Bundled output (rebuilt from source via npm run build)
│   ├── index.js                        # Plugin entry — esbuild ESM, minified
│   └── migrate-sessions.js             # Standalone CLI: lossless-claw-migrate-sessions
├── test/                               # Vitest test suite (84 files, 1494+ tests)
├── specs/                              # Design specifications
├── tui/                                # Interactive terminal UI (Go, bubbletea) + prompts/
├── docs/                               # Upstream documentation
├── skills/lossless-claw/               # Bundled skill + references/
├── wiki/                               # ★ Workspace-specific agent docs (this directory)
├── AGENTS.md                           # Upstream repo instructions + workspace wiki pointer
├── LOCAL_PATCHES.md                    # ★ Workspace patches (in TS source, not dist)
├── openclaw.plugin.json                # Plugin manifest: id, kind, contracts, configSchema, uiHints
├── package.json                        # npm metadata, build/test/typecheck scripts
├── package-lock.json                   # Lockfile
├── README.md                           # Upstream user docs
└── LICENSE                             # MIT
```

★ = workspace-specific modification (LOCAL_PATCH or cherry-pick)

## Key external paths

| Path | Role |
|------|------|
| `~/.openclaw/lcm.db` | LCM SQLite database (messages, summaries, context items, large-file metadata). ~1.8 GB. |
| `~/.openclaw/lcm.db-wal` | SQLite WAL file. |
| `~/.openclaw/lcm.db-shm` | SQLite shared-memory file. |
| `~/.openclaw/lcm-files/` | Externalized large-file payloads. |
| `~/.openclaw/openclaw.json` | OpenClaw master config; plugin config at `plugins.entries.lossless-claw`. |
| `~/.openclaw/runtime-secrets/openclaw-gateway.env` | Gateway runtime secrets (env file). |
| `~/.openclaw/extensions/lossless-claw.npm-backup/` | Old npm-installed plugin — moved to `~/backups/plugin-archives/lossless-claw.npm-backup-0.13.2-20260714`. |
| `~/backups/plugin-archives/lcm.db.rotate-latest.bak-20260731` | Rotated DB snapshot (relocated 2026-08-24, Plan 401; manual deletion only). |
| `~/plans/101-lossless-claw-source-setup.md` | Plan: source setup + LOCAL_PATCHES migration. |
| `~/plans/102-cherry-pick-967-same-turn-collapse.md` | Plan: cherry-pick #967 (same-turn collapse fix). |
| `~/plans/103-cherry-pick-968-retry-reappend-guard.md` | Plan: cherry-pick #968 (retry-reappend guard). |
| `~/plans/104-lossless-claw-release-update-strategy.md` | Plan: release update strategy (recurring). |

## Git state (workspace-patches branch)

```
b095913 chore: add changeset for lcm_grep missing-pattern fix            ← #1064 pick
6c54dda fix(lcm_grep): report a missing pattern instead of throwing      ← #1064 pick
dba684a fix(session-rotation): preserve ambiguous relative session paths ← #1051 pick
e353719 fix(session-rotation): skip opaque sessionFile locators          ← #1051 pick
26ca162 LOCAL_PATCH: docs — base v0.15.3, carried commits, dropped picks  ← workspace docs
b42c783 fix(retrieval): type-safe getMessagesByIds fallback               ← workspace perf
67b487d perf+feat: search bounds, batched store ops, configurable scope   ← workspace perf
f7cb743 LOCAL_PATCH: public-agent scope restriction + retry backoff 035b  ← workspace patches
e965ec5 fix: publish npm releases through OIDC                            ← upstream tag v0.15.3
```

8 commits ahead of `v0.15.3`. #1051/#1064 are still OPEN upstream — drop these
picks at the next release upgrade if merged by then (Plan-104 cycle rule).

## Plugin manifest highlights (`openclaw.plugin.json`)

- `id`: `lossless-claw`
- `name`: "Lossless Context Management"
- `kind`: `context-engine`
- `activation.onStartup`: `true`
- `skills`: `["skills/lossless-claw"]`
- `contracts.tools`: `lcm_grep`, `lcm_describe`, `lcm_expand`, `lcm_expand_query`
- `configSchema`: JSON Schema object with ~50 config keys (see
  [operations/environment.md](operations/environment.md) for the grouped
  reference).
- `uiHints`: label + help text for every config key (used by OpenClaw UI).
