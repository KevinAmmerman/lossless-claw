# LOCAL_PATCHES.md

## Public-agent LCM scope restriction

Reason:
- `agent:hori-wa-public:*` and `agent:hori-wa-public-group:*` should never use cross-conversation LCM scope.
- For WhatsApp public-group participation, recall must stay bound to the current conversation even if a tool call asks for `allConversations=true` or passes an explicit `conversationId`.

Patched file:
- `src/tools/lcm-conversation-scope.ts`

Behavior:
- Session keys with prefixes `agent:hori-wa-public:` and `agent:hori-wa-public-group:` are treated as current-conversation-only.
- For those session keys, explicit `conversationId` and `allConversations=true` are ignored.
- Normal sessions keep upstream behavior.
