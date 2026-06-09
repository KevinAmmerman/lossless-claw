import type { LcmContextEngine } from "../engine.js";
import type { LcmDependencies } from "../types.js";

export type LcmConversationScope = {
  conversationId?: number;
  allConversations: boolean;
};

const CURRENT_CONVERSATION_ONLY_SESSION_KEY_PREFIXES = [
  "agent:hori-wa-public:",
  "agent:hori-wa-public-group:",
  "agent:hori-wa-public-group-kletter:",
] as const;

function isCurrentConversationOnlySessionKey(sessionKey?: string): boolean {
  const normalizedSessionKey = sessionKey?.trim();
  if (!normalizedSessionKey) {
    return false;
  }
  return CURRENT_CONVERSATION_ONLY_SESSION_KEY_PREFIXES.some((prefix) =>
    normalizedSessionKey.startsWith(prefix),
  );
}

export function deriveHeartbeatParentSessionKey(sessionKey?: string): string | undefined {
  const normalizedSessionKey = sessionKey?.trim();
  if (!normalizedSessionKey?.startsWith("agent:")) {
    return undefined;
  }
  const parts = normalizedSessionKey.split(":");
  if (parts.length < 6) {
    return undefined;
  }
  const last = parts[parts.length - 1];
  const previous = parts[parts.length - 2];
  if (last !== "heartbeat") {
    return undefined;
  }
  if (previous === "heartbeat" || /^heartbeat(?:-[A-Za-z0-9_.-]+|-v\d+)?$/.test(previous)) {
    return parts.slice(0, -2).join(":");
  }
  return undefined;
}

type ConversationScopeStore = ReturnType<LcmContextEngine["getConversationStore"]> & {
  getConversationForSession?: (input: {
    sessionId?: string;
    sessionKey?: string;
  }) => Promise<{ conversationId: number } | null>;
  getConversationBySessionKey?: (sessionKey: string) => Promise<{ conversationId: number } | null>;
};

async function lookupConversationForSession(input: {
  lcm: LcmContextEngine;
  sessionId?: string;
  sessionKey?: string;
}): Promise<{ conversationId: number } | null> {
  const store = input.lcm.getConversationStore() as ConversationScopeStore;

  if (typeof store.getConversationForSession === "function") {
    return store.getConversationForSession({
      sessionId: input.sessionId,
      sessionKey: input.sessionKey,
    });
  }

  const normalizedSessionKey = input.sessionKey?.trim();
  if (normalizedSessionKey && typeof store.getConversationBySessionKey === "function") {
    const byKey = await store.getConversationBySessionKey(normalizedSessionKey);
    if (byKey) {
      return byKey;
    }
  }

  const normalizedSessionId = input.sessionId?.trim();
  if (!normalizedSessionId) {
    return null;
  }

  return store.getConversationBySessionId(normalizedSessionId);
}

/**
 * Parse an ISO-8601 timestamp tool parameter into a Date.
 *
 * Throws when the value is not a parseable timestamp string.
 */
export function parseIsoTimestampParam(
  params: Record<string, unknown>,
  key: string,
): Date | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} must be a valid ISO timestamp.`);
  }
  return parsed;
}

/**
 * Resolve LCM conversation scope for tool calls.
 *
 * Priority:
 * 1. Explicit conversationId parameter
 * 2. allConversations=true (cross-conversation mode)
 * 3. Current session's LCM conversation
 */
export async function resolveLcmConversationScope(input: {
  lcm: LcmContextEngine;
  params: Record<string, unknown>;
  sessionId?: string;
  sessionKey?: string;
  deps?: Pick<LcmDependencies, "resolveSessionIdFromSessionKey">;
}): Promise<LcmConversationScope> {
  const { lcm, params } = input;
  const currentConversationOnly = isCurrentConversationOnlySessionKey(input.sessionKey);

  const explicitConversationId =
    typeof params.conversationId === "number" && Number.isFinite(params.conversationId)
      ? Math.trunc(params.conversationId)
      : undefined;
  if (!currentConversationOnly && explicitConversationId != null) {
    return { conversationId: explicitConversationId, allConversations: false };
  }

  if (!currentConversationOnly && params.allConversations === true) {
    return { conversationId: undefined, allConversations: true };
  }

  const normalizedSessionKey = input.sessionKey?.trim();
  if (normalizedSessionKey) {
    const bySessionKey =
      await lcm.getConversationStore().getConversationBySessionKey(normalizedSessionKey);
    if (bySessionKey) {
      return { conversationId: bySessionKey.conversationId, allConversations: false };
    }

    const parentSessionKey = deriveHeartbeatParentSessionKey(normalizedSessionKey);
    if (parentSessionKey) {
      const byParentSessionKey =
        await lcm.getConversationStore().getConversationBySessionKey(parentSessionKey);
      if (byParentSessionKey) {
        return { conversationId: byParentSessionKey.conversationId, allConversations: false };
      }
    }
  }

  let normalizedSessionId = input.sessionId?.trim();
  if (!normalizedSessionId && normalizedSessionKey && input.deps) {
    normalizedSessionId = await input.deps.resolveSessionIdFromSessionKey(normalizedSessionKey);
  }
  if (!normalizedSessionId && !input.sessionKey?.trim()) {
    return { conversationId: undefined, allConversations: false };
  }

  const conversation = await lookupConversationForSession({
    lcm,
    sessionId: normalizedSessionId,
    sessionKey: input.sessionKey,
  });
  if (!conversation) {
    return { conversationId: undefined, allConversations: false };
  }

  return { conversationId: conversation.conversationId, allConversations: false };
}
