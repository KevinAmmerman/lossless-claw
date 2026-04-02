import { describe, expect, it, vi } from "vitest";

import { resolveLcmConversationScope } from "../src/tools/lcm-conversation-scope.js";

describe("resolveLcmConversationScope", () => {
  const getConversationStore = () => ({
    getConversationBySessionKey: vi.fn(async () => ({ conversationId: 42 })),
    getConversationBySessionId: vi.fn(async () => ({ conversationId: 42 })),
  });

  it("ignores explicit cross-conversation scope for public WhatsApp agents", async () => {
    const scope = await resolveLcmConversationScope({
      // Minimal test double for the tool helper.
      lcm: { getConversationStore } as never,
      params: { conversationId: 999, allConversations: true },
      sessionKey: "agent:hori-wa-public-group:thread-1",
    });

    expect(scope).toEqual({ conversationId: 42, allConversations: false });
  });

  it("keeps upstream behavior for normal sessions", async () => {
    const scope = await resolveLcmConversationScope({
      lcm: { getConversationStore } as never,
      params: { conversationId: 999 },
      sessionKey: "agent:hori-wa:thread-1",
    });

    expect(scope).toEqual({ conversationId: 999, allConversations: false });
  });
});
