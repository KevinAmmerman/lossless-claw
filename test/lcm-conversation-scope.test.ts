import { describe, expect, it } from "vitest";
import { resolveLcmConversationScope } from "../src/tools/lcm-conversation-scope.js";

type LcmInput = Parameters<typeof resolveLcmConversationScope>[0];
type LcmEngine = LcmInput["lcm"];
type LcmDeps = NonNullable<LcmInput["deps"]>;

function makeLcm(prefixes?: string[]): LcmEngine {
  return {
    configView: prefixes === undefined ? undefined : { publicAgentSessionPrefixes: prefixes },
  } as unknown as LcmEngine;
}

// Cases 1-4 and 6 pass a plain sessionKey (the tool factories pass session keys
// from closures), so `deps` stays undefined and the pre-guard code only runs
// `input.deps?.isSubagentSessionKey(...)` which short-circuits to false.
describe("resolveLcmConversationScope public-agent guard", () => {
  it("prefix match forces current-conversation-only scope", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm(),
      params: {},
      sessionKey: "agent:hori-wa-public-group:abc123",
    });
    expect(result).toEqual({ allConversations: false, delegated: false });
  });

  it("allConversations=true is ignored for public agents", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm(),
      params: { allConversations: true },
      sessionKey: "agent:hori-wa-public-group:abc123",
    });
    expect(result).toEqual({ allConversations: false, delegated: false });
  });

  it("explicit conversationId is ignored for public agents", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm(),
      params: { conversationId: 42 },
      sessionKey: "agent:hori-wa-public-group:abc123",
    });
    expect(result.allConversations).toBe(false);
    expect(result.conversationId).toBeUndefined();
    expect(result.conversationIds).toBeUndefined();
  });

  it("non-matching key proceeds through normal resolution", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm(),
      params: { conversationId: 42 },
      sessionKey: "agent:main:something",
    });
    // Normal path (source line ~214): explicit conversationId wins and is
    // reflected in the result, which the early-restricted shape never carries.
    expect(result).toEqual({
      conversationId: 42,
      conversationIds: [42],
      allConversations: false,
      delegated: false,
    });
  });

  it("delegated subagent of a public agent stays restricted (guard precedes delegation)", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm(),
      params: {},
      sessionId: "agent:hori-wa-public-group:xyz:sub-1",
      deps: {
        isSubagentSessionKey: () => true,
      } as unknown as LcmDeps,
    });
    // The sessionId qualifies as a subagent session key and is promoted to the
    // normalized session key, but the guard fires first — delegation never runs.
    expect(result).toEqual({ allConversations: false, delegated: false });
  });

  it("empty prefix list disables the guard (documented escape hatch)", async () => {
    const result = await resolveLcmConversationScope({
      lcm: makeLcm([]),
      params: { allConversations: true },
      sessionKey: "agent:hori-wa-public-group:abc123",
    });
    // Guard is inert (no prefixes to match), so the normal path honors
    // allConversations=true (source line ~223).
    expect(result).toEqual({
      conversationId: undefined,
      conversationIds: undefined,
      allConversations: true,
      delegated: false,
    });
  });
});
