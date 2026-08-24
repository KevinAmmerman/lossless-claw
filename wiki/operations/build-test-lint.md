# Build, Test, Lint & Operate

> Exact commands for the `lossless-claw` plugin. This is a **source-linked
> build** at `~/lossless-claw-src/` on branch `workspace-patches`. Full
> TypeScript source, tests, specs, and TUI source are available.

## Build / test / typecheck

These commands run from `~/lossless-claw-src/`:

| Purpose | Command | Notes |
|---------|---------|-------|
| Build (bundle TS → `dist/index.js`) | `npm run build` | esbuild: `--platform=node --target=node22 --format=esm --external:openclaw --external:"@earendil-works/*" --minify-whitespace`. Also builds `dist/migrate-sessions.js`. |
| Test | `npm test` | `vitest run --dir test` (84 files, 1494+ tests) |
| Test (single file) | `npx vitest test/engine.test.ts` | — |
| Typecheck | `npm run typecheck` | `tsc --noEmit --pretty false` |
| Release verify | `npm run release:verify` | typecheck + build + test + `npm pack --dry-run` |
| Plugin inspector (CI) | `npm run plugin-inspector:ci` | Runs `@openclaw/plugin-inspector` against the plugin root. |

### Prerequisites

- Node.js 22+ (workspace has v24.16.0)
- `npm` (workspace has npm, not pnpm)
- OpenClaw `>= 2026.5.28` (peer dependency)
- An LLM provider configured in OpenClaw (used for summarization)
- For FTS5 search: a Node runtime with SQLite FTS5 compiled in (see below)

## FTS5

`lossless-claw` works without FTS5 but falls back to slower `LIKE`-based
search and loses FTS ranking/snippet quality. To check whether the gateway
runtime has FTS5:

```bash
node --input-type=module - <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
const options = db.prepare('pragma compile_options').all().map((row) => row.compile_options);
console.log(options.filter((v) => v.includes('FTS')).join('\n') || 'no fts compile options');
try {
  db.exec("CREATE VIRTUAL TABLE t USING fts5(content)");
  console.log("fts5: ok");
} catch (err) {
  console.log("fts5: fail");
  console.log(err instanceof Error ? err.message : String(err));
}
NODE
```

Expected: `ENABLE_FTS5` + `fts5: ok`. See `docs/fts5.md` for building an
FTS5-capable Node runtime.

## Operational workflows (installed plugin)

### Change plugin config

1. Back up: `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak-<reason>-$(date -u +%Y%m%dT%H%M%SZ)`
2. Edit `~/.openclaw/openclaw.json` → `plugins.entries.lossless-claw`.
3. Validate: `openclaw config validate` → "Config valid".
4. Restart gateway: `systemctl --user restart openclaw-gateway.service`
5. Confirm: `systemctl --user is-active openclaw-gateway.service` → `active`

### Restart the gateway

```bash
systemctl --user restart openclaw-gateway.service
sleep 10
systemctl --user is-active openclaw-gateway.service   # → active
curl -sS -m 10 http://127.0.0.1:18789/health            # → 200
```

### Back up the LCM database

```bash
# Via plugin command (timestamped):
#   /lcm backup     (in an OpenClaw chat surface)

# Via shell:
cp ~/.openclaw/lcm.db ~/.openclaw/lcm.db.bak-<reason>-$(date -u +%Y%m%dT%H%M%SZ)
```

The DB is large (~1.8 GB). Always back up before direct SQL.

### Inspect LCM state (read-only SQL)

```bash
# Conversation / message / summary counts
sqlite3 ~/.openclaw/lcm.db "
SELECT 'conversations' AS t, count(*) FROM conversations
UNION ALL SELECT 'messages', count(*) FROM messages
UNION ALL SELECT 'summaries', count(*) FROM summaries
UNION ALL SELECT 'summary_messages', count(*) FROM summary_messages
UNION ALL SELECT 'context_items', count(*) FROM context_items
UNION ALL SELECT 'large_files', count(*) FROM large_files;
"

# Stuck pending compactions
sqlite3 ~/.openclaw/lcm.db "SELECT count(*) FROM conversation_compaction_maintenance WHERE pending=1;"

# DB size
ls -lh ~/.openclaw/lcm.db
```

### Clear stuck pending compactions

```bash
sqlite3 ~/.openclaw/lcm.db "UPDATE conversation_compaction_maintenance SET pending=0 WHERE pending=1;"
```

### Rebuild after source changes

```bash
cd ~/lossless-claw-src
npm run build
node --check dist/index.js
systemctl --user restart openclaw-gateway.service
```

LOCAL_PATCHES are in TypeScript source — they survive `npm run build`. No
dist patching needed.

### Update to a new upstream release (Plan 104)

```bash
cd ~/lossless-claw-src
git fetch origin --tags
git rebase <new-tag> workspace-patches
# Drop cherry-picks now included upstream:
#   git rebase --skip  (for each redundant cherry-pick)
# Re-apply LOCAL_PATCHES if conflicts (re-add guards in TS source)
npm install
npm run typecheck && npm test && npm run build
systemctl --user restart openclaw-gateway.service
```

### Diagnostics

| Check | Command |
|-------|---------|
| Plugin health snapshot | `/lcm` or `/lossless` (chat surface) |
| Summary corruption scan | `/lcm doctor` |
| Junk diagnostics (read-only) | `/lcm doctor clean` |
| Plugin + maintenance state | `/lcm status` |
| Compaction model in logs | `journalctl --user -u openclaw-gateway.service --since "2 min ago" --no-pager \| grep "Compaction summarization model"` |
| Takeover errors | `journalctl --user -u openclaw-gateway.service --since "2 h ago" --no-pager \| grep -c "EmbeddedAttemptSessionTakeoverError"` |
| Compaction errors | `journalctl --user -u openclaw-gateway.service --since "15 min ago" --no-pager \| grep -E "completeSimple error\|all extraction attempts exhausted"` |
| Bytes freed by compaction | `journalctl --user -u openclaw-gateway.service --since "15 min ago" --no-pager \| grep "bytesFreed"` |

### Install / reinstall / link

```bash
# Install from npm (recommended upstream):
openclaw plugins install @martian-engineering/lossless-claw

# Link a local source checkout for development:
cd /path/to/lossless-claw && pnpm build
openclaw plugins install --link /path/to/lossless-claw
```

After any install/reinstall in this workspace, reapply LOCAL_PATCHES (see
above) and restart the gateway.

## Lint / format

No dedicated lint or format script is defined in `package.json`. Typecheck
(`tsc --noEmit`) is the static-analysis gate.
