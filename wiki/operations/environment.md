# Environment & Configuration

> Env vars, plugin config keys, secrets, and file paths for `lossless-claw`.

## Config file locations

| File | Role |
|------|------|
| `~/.openclaw/openclaw.json` | OpenClaw master config. Plugin config lives at `plugins.entries.lossless-claw`. |
| `~/.openclaw/lcm.db` | LCM SQLite database (messages, summaries, context items, large files metadata). ~1.8 GB. |
| `~/.openclaw/lcm.db-wal` | SQLite WAL file (can be large during active operation). |
| `~/.openclaw/lcm.db-shm` | SQLite shared-memory file. |
| `~/.openclaw/lcm-files/` | Externalized large-file payloads (`<conversation_id>/<file_id>.<ext>`). |
| `~/.openclaw/extensions/lossless-claw/` | Installed plugin directory. |
| `~/.openclaw/extensions/lossless-claw/dist/index.js` | Bundled plugin entry point. |
| `~/.openclaw/extensions/lossless-claw/LOCAL_PATCHES.md` | Workspace-specific dist patches (reapply after reinstall). |
| `~/.openclaw/extensions/lossless-claw/openclaw.plugin.json` | Plugin manifest with `configSchema` and `uiHints`. |
| `~/.openclaw/runtime-secrets/openclaw-gateway.env` | Gateway runtime secrets (env file sourced by the systemd service). |

## Secrets

No secret values are documented here. Secrets are referenced by env var name
and type only.

| Secret | Type | Location | Used for |
|--------|------|----------|----------|
| `UMANS_API_KEY` | env var (API key) | `~/.openclaw/runtime-secrets/openclaw-gateway.env` | Auth for the `umans` provider, used by `summaryModel: umans-deepseek-v4-flash-0731` (compaction summarization; kept + documented via Plan 401, 2026-08-24). Configured as a SecretRef in `models.providers.umans.apiKey`. |

The `umans` provider is configured at `models.providers.umans` with
`baseUrl: https://api.code.umans.ai/v1`, `api: "openai-completions"`,
`timeoutSeconds: 600`.

## Environment variables

Environment variables take precedence over plugin config for backward
compatibility. Plugin config equivalents are listed where applicable.

| Variable | Default | Description |
|----------|---------|-------------|
| `LCM_ENABLED` | `true` | Enable/disable the plugin. |
| `LCM_DATABASE_PATH` | `~/.openclaw/lcm.db` | Path to the SQLite database. |
| `LCM_IGNORE_SESSION_PATTERNS` | `""` | Comma-separated glob patterns for session keys to exclude from LCM storage. |
| `LCM_STATELESS_SESSION_PATTERNS` | `""` | Comma-separated glob patterns for session keys that may read from LCM but never write to it. |
| `LCM_SKIP_STATELESS_SESSIONS` | `true` | Enable stateless-session write skipping for matching session keys. |
| `LCM_CONTEXT_THRESHOLD` | `0.75` | Fraction of context window that triggers compaction (0.0–1.0). |
| `LCM_FRESH_TAIL_COUNT` | `64` | Number of recent messages protected from compaction. |
| `LCM_NEW_SESSION_RETAIN_DEPTH` | `2` | Context retained after `/new` (`-1` keeps all, `2` keeps d2+). |
| `LCM_LEAF_MIN_FANOUT` | `8` | Minimum raw messages per leaf summary. |
| `LCM_CONDENSED_MIN_FANOUT` | `4` | Minimum summaries per condensed node. |
| `LCM_CONDENSED_MIN_FANOUT_HARD` | `2` | Relaxed fanout for forced compaction sweeps. |
| `LCM_INCREMENTAL_MAX_DEPTH` | `1` | How deep incremental compaction goes (0 = leaf only, 1 = one condensed pass, -1 = unlimited). Deprecated alias of `sweepMaxDepth`. |
| `LCM_LEAF_CHUNK_TOKENS` | `20000` | Max source tokens per leaf compaction chunk. |
| `LCM_LEAF_TARGET_TOKENS` | `1200` | Target token count for leaf summaries. |
| `LCM_CONDENSED_TARGET_TOKENS` | `2000` | Target token count for condensed summaries. |
| `LCM_MAX_EXPAND_TOKENS` | `4000` | Token cap for sub-agent expansion queries. |
| `LCM_LARGE_FILE_TOKEN_THRESHOLD` | `25000` | File blocks above this size are intercepted and stored separately. |
| `LCM_LARGE_FILE_SUMMARY_PROVIDER` | `""` | Provider override for large-file summarization. |
| `LCM_LARGE_FILE_SUMMARY_MODEL` | `""` | Model override for large-file summarization. |
| `LCM_SUMMARY_MODEL` | `""` | Model override for compaction summarization; falls back to OpenClaw's default when unset. |
| `LCM_SUMMARY_PROVIDER` | `""` | Provider override for compaction summarization. |
| `LCM_SUMMARY_BASE_URL` | *(from OpenClaw)* | Base URL override for summarization API calls. |
| `LCM_EXPANSION_MODEL` | *(from OpenClaw)* | Model override for `lcm_expand_query` sub-agent. |
| `LCM_EXPANSION_PROVIDER` | *(from OpenClaw)* | Provider override for `lcm_expand_query` sub-agent. |
| `LCM_DELEGATION_TIMEOUT_MS` | `120000` | Max time to wait for delegated `lcm_expand_query` sub-agent completion. |
| `LCM_SUMMARY_TIMEOUT_MS` | `60000` | Max time to wait for a single model-backed LCM summarizer call. |
| `LCM_SUMMARY_CALL_WINDOW_MS` | `600000` | Rolling window for the per-session summarization spend guard. |
| `LCM_SUMMARY_MAX_CALLS_PER_WINDOW` | `24` | Max model-backed summarization calls per session/window before spend backoff. |
| `LCM_SUMMARY_SPEND_BACKOFF_MS` | `1800000` | Cooldown after the summarization spend guard opens. |
| `LCM_PRUNE_HEARTBEAT_OK` | `false` | Retroactively delete `HEARTBEAT_OK` turn cycles from LCM storage. |
| `LCM_TRANSCRIPT_GC_ENABLED` | `false` | Enable transcript rewrite GC during `maintain()`. |
| `LCM_PROACTIVE_THRESHOLD_COMPACTION_MODE` | `deferred` | `deferred` or `inline` for proactive threshold compaction. |
| `LCM_CACHE_TTL_SECONDS` | `300` | Cache TTL for cache-aware deferred compaction (deprecated setting). |

## Plugin config keys

Configured under `plugins.entries.lossless-claw.config` in `openclaw.json`.
The full schema is in `openclaw.plugin.json` → `configSchema`. Key groups:

### Core compaction

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `contextThreshold` | number 0–1 | 0.75 | Fraction of context window that triggers compaction. |
| `sweepMaxDepth` | integer ≥ -1 | — | Preferred max condensation source depth during full sweeps (0 = leaf only, -1 = unlimited). |
| `incrementalMaxDepth` | integer ≥ -1 | 1 | Deprecated alias for `sweepMaxDepth`. |
| `freshTailCount` | integer ≥ 1 | 64 | Recent messages protected from compaction. |
| `freshTailMaxTokens` | integer ≥ 0 | — | Optional token cap for the protected fresh tail. |
| `leafChunkTokens` | integer ≥ 1 | 20000 | Max source tokens per leaf compaction chunk. |
| `leafTargetTokens` | integer ≥ 1 | 1200 | Target tokens for leaf summaries. |
| `condensedTargetTokens` | integer ≥ 1 | 2000 | Target tokens for condensed summaries. |
| `leafMinFanout` | integer ≥ 2 | 8 | Min raw messages before a leaf pass runs. |
| `condensedMinFanout` | integer ≥ 2 | 4 | Same-depth summaries before condensation. |
| `condensedMinFanoutHard` | integer ≥ 2 | 2 | Hard floor for condensation during maintenance/repair. |
| `summaryPrefixTargetTokens` | integer ≥ 1 | — | Optional target for summarized-prefix tokens after a full sweep. |
| `maxSweepIterations` | integer ≥ 1 | 12 | Hard cap on summarizer passes within a single full sweep. |
| `sweepDeadlineMs` | integer ≥ 1 | 120000 | Wall-clock budget for a single full sweep. |
| `compactUntilUnderDeadlineMs` | integer ≥ 1 | 300000 | Wall-clock budget for a whole compact-until-under operation. |
| `maxAssemblyTokenBudget` | integer ≥ 1000 | — | Hard ceiling for assembly token budget. |
| `summaryMaxOverageFactor` | number ≥ 1 | 3 | Max overage factor for summaries vs target; exceeding → deterministic truncation. |

### Model overrides

| Key | Type | Description |
|-----|------|-------------|
| `summaryModel` | string | Runtime LLM model override for summarization. Requires `llm.allowModelOverride` + `llm.allowedModels`. |
| `summaryProvider` | string | Provider override (used only when `summaryModel` is a bare model name). |
| `largeFileSummaryModel` | string | Model override for large-file summarization. |
| `largeFileSummaryProvider` | string | Provider override for large-file summarization. |
| `expansionModel` | string | Model override for `lcm_expand_query` sub-agent. Requires `subagent.allowModelOverride`. |
| `expansionProvider` | string | Provider override for `lcm_expand_query` sub-agent. |
| `fallbackProviders` | array of `{provider, model}` | Explicit runtime LLM fallback pairs for compaction. |
| `customInstructions` | string | Natural language instructions injected into all summarization prompts. |

### Timeouts & spend guards

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `delegationTimeoutMs` | integer ≥ 1 | 120000 | Max wait for delegated `lcm_expand_query` sub-agent. |
| `summaryTimeoutMs` | integer ≥ 1 | 60000 | Per-call timeout for model-backed summarization. |
| `summaryCallWindowMs` | integer ≥ 1 | 600000 | Rolling window for the spend guard. |
| `summaryMaxCallsPerWindow` | integer ≥ 1 | 24 | Max summarization calls per session/window. |
| `summarySpendBackoffMs` | integer ≥ 1 | 1800000 | Cooldown after the spend guard opens. |
| `circuitBreakerThreshold` | integer ≥ 1 | — | Consecutive auth failures before the circuit breaker trips. |
| `circuitBreakerCooldownMs` | integer ≥ 1 | — | Cooldown before the circuit breaker auto-resets. |

### Session management

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `newSessionRetainDepth` | integer ≥ -1 | 2 | Context retained after `/new`. |
| `bootstrapMaxTokens` | integer ≥ 1 | — | Max raw parent-history tokens imported into a new conversation bootstrap. |
| `ignoreSessionPatterns` | string[] | — | Glob patterns for session keys excluded from LCM entirely. |
| `statelessSessionPatterns` | string[] | — | Glob patterns for session keys that read but never write. |
| `skipStatelessSessions` | boolean | — | Enable stateless-session write skipping. |
| `pruneHeartbeatOk` | boolean | false | Delete `HEARTBEAT_OK` turn cycles from LCM storage. |
| `transcriptGcEnabled` | boolean | false | Enable transcript rewrite GC during `maintain()`. |
| `proactiveThresholdCompactionMode` | `deferred` \| `inline` | deferred | Proactive threshold compaction mode. |
| `timezone` | string | — | IANA timezone for summary timestamps. |

### Auto-rotate session files

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoRotateSessionFiles.enabled` | boolean | — | Auto-rotate oversized LCM-managed session JSONL files. |
| `autoRotateSessionFiles.createBackups` | boolean | false | Create the rolling `rotate-latest` SQLite backup before rotation. |
| `autoRotateSessionFiles.sizeBytes` | integer ≥ 1 | 2097152 | Session JSONL byte threshold for rotation. |
| `autoRotateSessionFiles.startup` | `rotate` \| `warn` \| `off` | — | Startup behavior for oversized session files. |
| `autoRotateSessionFiles.runtime` | `rotate` \| `warn` \| `off` | — | Runtime behavior for oversized session files. |

### Assembly & eviction

| Key | Type | Description |
|-----|------|-------------|
| `promptAwareEviction` | boolean | When enabled, budget-constrained assembly ranks evictable prefix by prompt relevance. Can reduce prompt-cache hit rates. |
| `stubLargeToolPayloads` | boolean | When enabled, evictable tool-result rows externalized via `lcm-blob-migrate` are stubbed at assemble time. Requires running `scripts/lcm-blob-migrate.mjs` first. |
| `stripInjectedContextTags` | string[] | XML tag names stripped from messages before summarization (e.g. `active-memory`, `memory-lancedb`, `hindsight-openclaw`). Set to `[]` to disable. |

### Large files

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `largeFileThresholdTokens` | integer ≥ 1000 | 25000 | Token threshold routing text attachments into large-file summarization. |
| `largeFileTokenThreshold` | integer ≥ 1000 | — | Legacy alias of `largeFileThresholdTokens`. |
| `largeFilesDir` | string | `~/.openclaw/lcm-files` | Directory for externalized large files. |
| `dbPath` / `databasePath` | string | `~/.openclaw/lcm.db` | Path to the LCM SQLite database. `databasePath` is the preferred key. |

### Deprecated (cache-aware compaction)

All `cacheAwareCompaction.*` keys are deprecated. Automatic compaction is now
threshold-only and does not use prompt-cache hot/cold state. Kept for config
compatibility only.

## Live session patterns (this workspace)

Configured in `~/.openclaw/openclaw.json` → `plugins.entries.lossless-claw.config`:

**Stateless** (read from LCM, never write):
- `agent:*:*:heartbeat`
- `agent:*:**:heartbeat`
- `agent:*:**:active-memory:**`
- `agent:*:active-memory:**`
- `agent:*:commitments:**`
- `agent:*:cron:**`
- `agent:*:subagent:**`
- `agent:*:**:subagent:**`

**Ignored** (no LCM interaction at all):
- `agent:*:*:heartbeat`
- `agent:*:**:heartbeat`

Pattern rules: `*` matches any characters except `:`; `**` matches anything
including `:`; patterns match the full session key.

## LLM policy

Under `plugins.entries.lossless-claw.llm`:

| Key | Type | Description |
|-----|------|-------------|
| `allowModelOverride` | boolean | Required for OpenClaw to honor plugin-requested model overrides. |
| `allowedModels` | string[] | Allowlist of `provider/model` targets. Use `"*"` to trust any (not recommended). |

For `expansionModel` overrides, a parallel `subagent` policy is required under
`plugins.entries.lossless-claw.subagent` with the same `allowModelOverride` /
`allowedModels` shape. `openclaw doctor --fix` can add the required policy
automatically.

Live config (verified 2026-08-24): `llm.allowModelOverride = true`,
`llm.allowedModels` = 11-entry list led by `umans/umans-deepseek-v4-flash-0731`
(plus kilocode, synthetic and crof fallbacks — read the live value from
`plugins.entries.lossless-claw.llm.allowedModels` in `~/.openclaw/openclaw.json`
before relying on it; this list changes more often than this wiki).
