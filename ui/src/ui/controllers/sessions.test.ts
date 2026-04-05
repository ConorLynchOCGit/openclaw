import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteSessionsAndRefresh,
  loadSessions,
  subscribeSessions,
  type SessionsState,
} from "./sessions.ts";

type RequestFn = (method: string, params?: unknown) => Promise<unknown>;

if (!("window" in globalThis)) {
  Object.assign(globalThis, {
    window: {
      confirm: () => false,
    },
  });
}

function createState(request: RequestFn, overrides: Partial<SessionsState> = {}): SessionsState {
  return {
    client: { request } as unknown as SessionsState["client"],
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "0",
    sessionsFilterLimit: "0",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeSessions", () => {
  it("registers for session change events", async () => {
    const request = vi.fn(async () => ({ subscribed: true }));
    const state = createState(request);

    await subscribeSessions(state);

    expect(request).toHaveBeenCalledWith("sessions.subscribe", {});
    expect(state.sessionsError).toBeNull();
  });
});

describe("deleteSessionsAndRefresh", () => {
  it("deletes multiple sessions and refreshes", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sessions.delete") {
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a", "key-b"]);

    expect(deleted).toEqual(["key-a", "key-b"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(1, "sessions.delete", {
      key: "key-a",
      deleteTranscript: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, "sessions.delete", {
      key: "key-b",
      deleteTranscript: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, "sessions.list", {
      includeGlobal: true,
      includeUnknown: true,
    });
    expect(state.sessionsLoading).toBe(false);
  });

  it("returns empty array when user cancels", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a"]);

    expect(deleted).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("returns partial results when some deletes fail", async () => {
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "sessions.delete") {
        const p = params as { key: string };
        if (p.key === "key-b" || p.key === "key-c") {
          throw new Error(`delete failed: ${p.key}`);
        }
        return { ok: true };
      }
      if (method === "sessions.list") {
        return undefined;
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const state = createState(request);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const deleted = await deleteSessionsAndRefresh(state, ["key-a", "key-b", "key-c", "key-d"]);

    expect(deleted).toEqual(["key-a", "key-d"]);
    expect(state.sessionsError).toBe("Error: delete failed: key-b; Error: delete failed: key-c");
    expect(state.sessionsLoading).toBe(false);
  });

  it("returns empty array when already loading", async () => {
    const request = vi.fn(async () => undefined);
    const state = createState(request, { sessionsLoading: true });

    const deleted = await deleteSessionsAndRefresh(state, ["key-a"]);

    expect(deleted).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("loadSessions", () => {
  it("normalizes a hidden active session back to the main session", async () => {
    const applySettings = vi.fn();
    const state = createState(
      vi.fn(async (method: string) => {
        if (method === "sessions.list") {
          return {
            ts: 0,
            path: "",
            count: 2,
            defaults: { modelProvider: null, model: null, contextTokens: null },
            sessions: [
              { key: "agent:main:main", kind: "direct", updatedAt: 0, selectorVisibility: "show" },
              {
                key: "agent:main:unknown:direct:+15555550125",
                kind: "direct",
                updatedAt: 0,
                selectorVisibility: "hide",
              },
            ],
          };
        }
        throw new Error(`unexpected method: ${method}`);
      }),
      {
        sessionKey: "agent:main:unknown:direct:+15555550125",
        settings: {
          gatewayUrl: "",
          token: "",
          locale: "en",
          sessionKey: "agent:main:unknown:direct:+15555550125",
          lastActiveSessionKey: "agent:main:unknown:direct:+15555550125",
          theme: "claw",
          themeMode: "dark",
          splitRatio: 0.6,
          navCollapsed: false,
          navGroupsCollapsed: {},
          borderRadius: 50,
          chatFocusMode: false,
          chatShowThinking: false,
          chatShowToolCalls: true,
        },
        applySettings,
        hello: { snapshot: { sessionDefaults: { mainSessionKey: "agent:main:main" } } },
      } as Partial<SessionsState>,
    ) as SessionsState & {
      sessionKey: string;
      settings: NonNullable<unknown>;
      applySettings: typeof applySettings;
      hello: { snapshot: { sessionDefaults: { mainSessionKey: string } } };
    };

    await loadSessions(state);

    expect(state.sessionKey).toBe("agent:main:main");
    expect(applySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:main",
        lastActiveSessionKey: "agent:main:main",
      }),
    );
  });
});
