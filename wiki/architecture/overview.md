# Architecture Overview

> How `lossless-claw` works internally. Grounded in `docs/architecture.md`,
> `docs/agent-tools.md`, and the bundled skill references.

## Mental model

LCM is two layers:

1. **Durable storage** — every message ever seen, persisted in SQLite, organized
   by conversation. This is the ground truth.
2. **Summary DAG** — a directed acyclic graph of summaries used to present
   compacted context efficiently within model token limits.

The summary DAG is **not** the source of truth. Raw messages remain the ground
truth. Summaries are lossy by design; the recall tools recover exact detail on
demand.

## Data model

### Conversations and messages

Every OpenClaw session maps to a **conversation** keyed by `sessionKey`
(stable identity) with a `sessionId` (runtime). Messages are stored with:

- `seq` — monotonically increasing sequence number within the conversation.
- `role` — `user`, `assistant`, `system`, or `tool`.
- `content` — plain text extraction.
- `tokenCount` — estimated (~4 chars/token).
- `createdAt` — insertion timestamp.
- `message_parts` — structured content blocks (text, tool calls, tool results,
  reasoning, file content) preserving the original shape for rich assembly.

### The summary DAG

Two node types:

| Type | Depth | Kind | Created from | Links | Typical tokens |
|------|-------|------|--------------|-------|----------------|
| Leaf | 0 | `"leaf"` | A chunk of raw messages | `summary_messages` → source messages | 800–1200 |
| Condensed | 1+ | `"condensed"` | A chunk of same-depth summaries | `summary_parents` → parent summaries | 1500–2000 |

Every summary carries: `summaryId` (`sum_` + 16 hex), `conversationId`,
`depth`, `earliestAt`/`latestAt` (time range), `descendantCount`,
`fileIds` (large files mentioned), `tokenCount`.

### Context items

The `context_items` table maintains the ordered list of what the model sees
for each conversation. Each entry is either a message reference or a summary
reference, identified by ordinal. When compaction creates a summary from a
range, the source items are replaced by a single summary item — keeping the
context list compact while preserving ordering.

### Database schema (key tables)

```
conversations (PK: conversation_id)
  ├── messages (FK: conversation_id)
  │    └── message_parts (FK: message_id → messages.rowid)
  ├── summaries (FK: conversation_id)
  │    ├── summary_messages (FK: summary_id, message_id)
  │    └── summary_parents (FK: summary_id → summaries)
  ├── context_items (FK: conversation_id)
  ├── large_files (FK: conversation_id)
  ├── conversation_compaction_telemetry (FK: conversation_id)
  ├── conversation_compaction_maintenance (FK: conversation_id)
  ├── conversation_bootstrap_state (FK: conversation_id)
  └── focus_briefs / focus_brief_sources (FK: conversation_id)
```

FTS virtual tables: `messages_fts`, `summaries_fts`, `summaries_fts_cjk`
(require SQLite FTS5 — see [operations/build-test-lint.md](../operations/build-test-lint.md#fts5)).

## Compaction lifecycle

### Lifecycle hooks

OpenClaw calls the context engine's hooks each turn:

1. **bootstrap** — On session start, reconciles the JSONL session file with the
   LCM database. Imports messages in the file but not in LCM (crash recovery).
2. **ingest** / **ingestBatch** — Persists new messages, appends to
   `context_items`.
3. **afterTurn** — After the model responds, ingests new messages, then
   evaluates whether `contextThreshold` requires compaction.

### Leaf compaction (depth 0)

1. Identify the oldest contiguous chunk of raw messages outside the **fresh
   tail** (protected recent messages, `freshTailCount`).
2. Cap the chunk at `leafChunkTokens` (default 20k).
3. Concatenate message content with timestamps.
4. Resolve the most recent prior summary for continuity (passed as
   `previous_context`).
5. Send to OpenClaw's `runtime.llm.complete` with the leaf prompt.
6. Normalize the response; if empty, log diagnostics and fall back to
   deterministic truncation.
7. If the summary is larger than the input (LLM failure), retry with the
   aggressive prompt; if still too large, fall back to truncation.
8. Persist the summary, link to source messages, replace the message range in
   `context_items`.

### Condensation (depth 1+)

1. Find the shallowest depth with enough contiguous same-depth summaries
   (≥ `leafMinFanout` for d0, ≥ `condensedMinFanout` for d1+).
2. Concatenate their content with time range headers.
3. Send to the LLM with the depth-appropriate prompt (d1, d2, or d3+).
4. Apply the same escalation strategy (normal → aggressive → truncation).
5. Persist with `depth = targetDepth + 1`, link to parents, replace the range.

### Compaction modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Automatic threshold sweep | After each turn, if context crosses `contextThreshold` | Deferred: records one `"threshold"` maintenance row for background/pre-assembly. Inline (live config): runs a full sweep before `afterTurn()` completes. |
| Full sweep | Threshold, manual `/compact`, or overflow | Phase 1: repeated leaf passes. Phase 2: condensation passes from shallowest eligible depth, respecting `sweepMaxDepth`. Pressure phase: may go deeper using hard fanout floor. |
| Budget-targeted (`compactUntilUnder`) | Overflow recovery | Up to `maxRounds` (default 10) full sweeps; stops when under target tokens. |

### Three-level escalation

Every summarization attempt escalates:

1. **Normal** — standard prompt, temperature 0.2.
2. **Aggressive** — tighter prompt (durable facts only), temperature 0.1,
   lower target tokens.
3. **Fallback** — deterministic truncation to ~512 tokens with
   `[Truncated for context management]` marker.

This guarantees compaction always makes progress, even if the LLM produces poor
output.

## Context assembly

Runs before each model turn:

```
[summary₁, summary₂, ..., summaryₙ, message₁, message₂, ..., messageₘ]
 ├── budget-constrained ──┤  ├──── fresh tail (always included) ────┤
```

1. Fetch all `context_items` ordered by ordinal.
2. Resolve each item — summaries become user messages with XML wrappers;
   messages reconstructed from parts.
3. Split into evictable prefix and protected fresh tail (last `freshTailCount`
   raw messages).
4. Compute fresh tail token cost (always included, even if over budget).
5. Fill remaining budget from the evictable set. Default: keep newest older
   items, drop oldest. With `promptAwareEviction`: rank evictable prefix by
   prompt relevance, then restore to chronological order.
6. Normalize assistant content to array blocks (Anthropic API compatibility).
7. Sanitize tool-use/result pairing (every `tool_result` has a matching
   `tool_use`).

### XML summary format

Summaries are presented to the model as user messages wrapped in XML:

```xml
<summary id="sum_abc123" kind="leaf" depth="0" descendant_count="0"
         earliest_at="2026-02-17T07:37:00" latest_at="2026-02-17T08:23:00">
  <content>
    ...summary text with timestamps...
    Expand for details about: exact error messages, full config diff, ...
  </content>
</summary>
```

Condensed summaries also include `<parents>` with `<summary_ref>` elements,
enabling targeted expansion of specific source summaries.

## Expansion system

When summaries are too compressed, agents use `lcm_expand_query` to recover
detail:

1. Agent calls `lcm_expand_query` with a `prompt` and either `summaryIds` or
   a `query`.
2. If `query` is provided, `lcm_grep` finds matching summaries first.
3. A **delegation grant** is created, scoping the sub-agent to the relevant
   conversation(s) with a token cap.
4. A sub-agent session is spawned with the expansion task.
5. The sub-agent walks the DAG: reads summary content, follows parent links,
   accesses source messages, inspects stored files.
6. The sub-agent returns a focused answer (default ≤ 2000 tokens) with cited
   summary IDs.
7. The grant is revoked and the sub-agent session cleaned up.

### Security model

- **Grants** are scoped to specific conversation IDs at spawn time.
- **Token caps** limit how much content the sub-agent can access.
- **TTL** ensures grants expire even if cleanup fails.
- **Revocation** happens on completion, cancellation, or sweep.
- The sub-agent only gets `lcm_expand` (low-level), not `lcm_expand_query` —
  preventing recursive sub-agent spawning.

## Large file handling

Files embedded in user messages (via `<file>` blocks from tool output) are
checked at ingestion:

1. Parse file blocks from message content.
2. For each block exceeding `largeFileTokenThreshold` (default 25k tokens):
   - Generate a unique file ID (`file_` prefix).
   - Store content to `largeFilesDir/<conversation_id>/<file_id>.<ext>`
     (default `~/.openclaw/lcm-files/...`).
   - Generate a ~200 token exploration summary.
   - Insert a `large_files` record with metadata.
   - Replace the file block in the message with a compact reference.
3. `lcm_describe` can retrieve full file content by ID.

## Session reconciliation (crash recovery)

1. On session start, read the JSONL session file (OpenClaw's ground truth).
2. Compare against the LCM database.
3. Find the most recent message in both (the "anchor").
4. Import messages after the anchor that are in JSONL but not in LCM.
5. If the session key moved to a different transcript file with no anchor,
   treat the new file as a bounded transcript epoch and import its recoverable
   messages (flood-capped).
6. Advance the bootstrap checkpoint only after an overlap is found or a
   bounded epoch import succeeds.

For forked child sessions, LCM imports only the newest messages that fit within
`bootstrapMaxTokens` to keep child LCM state bounded.

## Session lifecycle

| Command | LCM effect |
|---------|-----------|
| `/new` | Prunes `context_items` (per `newSessionRetainDepth`) but keeps the same LCM conversation row and all stored summaries. Next turn rebuilds context from retained summaries. |
| `/reset` | Archives the active conversation row and creates a new active row for the same stable `sessionKey`. Prior history preserved on the archived row. |
| `/lcm rotate` | Does NOT create a fresh conversation row. Forces leaf-only compaction for raw context outside the preserved live tail, replaces the rolling `rotate-latest` SQLite backup, rewrites the current transcript to a compact suffix-preserving form, and refreshes the bootstrap frontier on the same active conversation. Durable messages, summaries, context items, and conversation identity stay in place. |

Conversation resolution: look up by `sessionKey` first, fall back to
`sessionId` only when no `sessionKey` match exists. Cron scheduler keys
(`agent:<agent>:cron:<job>...`) are isolated per runtime run — when a new
`sessionId` reuses the same `sessionKey`, the prior active row is archived and
a fresh one created.

## Operation serialization

All mutating operations (ingest, compact) are serialized per-session using a
promise queue. This prevents races between concurrent `afterTurn`/`compact`
calls for the same conversation without blocking operations on different
conversations.

## Runtime LLM boundary

LCM needs model inference for summarization but does **not** resolve provider
credentials, base URLs, or provider transport settings directly. Summarization
calls go through OpenClaw's `runtime.llm.complete` capability, which owns model
preparation, credential resolution, OAuth refresh, provider dispatch, and usage
attribution.

Configured summary model overrides (`summaryModel`, `largeFileSummaryModel`,
`fallbackProviders`) are sent as runtime LLM model override requests. OpenClaw
enforces them with `plugins.entries.lossless-claw.llm.allowModelOverride` and
`llm.allowedModels`; denied overrides fail closed (no silent fallback to a
different model).

### Summary model priority

1. `LCM_SUMMARY_MODEL` / `LCM_SUMMARY_PROVIDER` (env vars)
2. Plugin config `summaryModel` / `summaryProvider`
3. OpenClaw's default compaction model/provider
4. Runtime/session model/provider hints

In this workspace, `summaryModel` = `umans-glm-5.2`, `summaryProvider` =
`umans` (set via Plan 062). Do not revert to empty — that defaults to
MiniMax-M3, which is rate-limited and causes compaction failure storms.

## Recall tools

| Tool | Available to | Use for | Cost |
|------|-------------|---------|------|
| `lcm_grep` | Main agent | Keyword/regex/full-text search across messages and/or summaries | Fast (direct DB query) |
| `lcm_describe` | Main agent | Inspect a specific summary or stored file by ID | Fast (direct DB query) |
| `lcm_expand_query` | Main agent | Deep recall: spawn a bounded sub-agent to expand the DAG and answer a focused question | ~30–120s, bounded sub-agent |
| `lcm_expand` | Sub-agents only | Low-level DAG walking (used internally by `lcm_expand_query`) | — |

**Escalation pattern**: `lcm_grep` → `lcm_describe` → `lcm_expand_query`. Start
with grep for discovery. Use describe when you have an ID. Use expand_query
when you need precise detail (exact commands, file paths, root-cause chains)
recovered from compacted summaries.

See `docs/agent-tools.md` for full parameter tables and examples.

## v0.15.x mechanisms (upstream additions, present since workspace base v0.15.3)

- **Stable event keys** — `src/stable-event-key.ts`: every persisted message
  gets a dedup identity (`responseId` → `toolCallId` → role+conversation+ms,
  timestamp-only fallback removed) enforced by a partial unique index on
  `(conversation_id, stable_event_key)`. Idempotent re-ingest even when the
  host redacted the transcript differently than the live batch.
- **Sender metadata** — `src/openclaw-sender-metadata.ts`: WhatsApp sender
  identity (senderId/senderName/senderUsername, allowlisted) is persisted in
  `messages.openclaw_sender_metadata` so group-message replay keeps who-said-what.
- **Compaction maintenance store** — pending debt rows live in
  `conversation_compaction_maintenance` (pending flag, retry_attempts,
  next_attempt_after). Rows of archived conversations must be cancelled
  manually (done 2026-08-24 via Plan 401); active wedged rows indicate
  unreachable sweep targets — check `last_failure_summary`.
- **Gateway-restart recovery** — the plugin lifecycle resets initialization
  state and reopens a stopped engine when OpenClaw reuses a cached
  registration (`resetInitializationState` / `reinitializeAfterGatewayStop`
  in `src/plugin/index.ts`). A restart no longer leaves the engine dead.

## Module map (upstream source structure)

The installed plugin ships only `dist/index.js` (bundled). The upstream source
structure (from `README.md`) maps to these responsibilities:

| Module | Role |
|--------|------|
| `index.ts` | Plugin entry point and registration. |
| `src/engine.ts` | `LcmContextEngine` — implements the `ContextEngine` interface. |
| `src/assembler.ts` | Context assembly (summaries + messages → model context). |
| `src/compaction.ts` | `CompactionEngine` — leaf passes, condensation, sweeps. |
| `src/summarize.ts` | Depth-aware prompt generation and LLM summarization. |
| `src/retrieval.ts` | `RetrievalEngine` — grep, describe, expand operations. |
| `src/expansion.ts` | DAG expansion logic for `lcm_expand_query`. |
| `src/expansion-auth.ts` | Delegation grants for sub-agent expansion. |
| `src/expansion-policy.ts` | Depth/token policy for expansion. |
| `src/large-files.ts` | File interception, storage, exploration summaries. |
| `src/integrity.ts` | DAG integrity checks and repair utilities. |
| `src/transcript-repair.ts` | Tool-use/result pairing sanitization. |
| `src/types.ts` | Core type definitions (dependency-injection contracts). |
| `src/openclaw-bridge.ts` | Bridge utilities. |
| `src/db/config.ts` | `LcmConfig` resolution from env vars. |
| `src/db/connection.ts` | SQLite connection management. |
| `src/db/migration.ts` | Schema migrations. |
| `src/store/conversation-store.ts` | Message persistence and retrieval. |
| `src/store/summary-store.ts` | Summary DAG persistence and context item management. |
| `src/store/fts5-sanitize.ts` | FTS5 query sanitization. |
| `src/tools/lcm-grep-tool.ts` | `lcm_grep` tool implementation. |
| `src/tools/lcm-describe-tool.ts` | `lcm_describe` tool implementation. |
| `src/tools/lcm-expand-tool.ts` | `lcm_expand` tool (sub-agent only). |
| `src/tools/lcm-expand-query-tool.ts` | `lcm_expand_query` tool (main agent wrapper). |
| `src/tools/lcm-conversation-scope.ts` | Conversation scoping utilities. |
| `src/tools/common.ts` | Shared tool utilities. |
| `tui/` | Interactive terminal UI (Go, bubbletea). Not shipped in this install. |
