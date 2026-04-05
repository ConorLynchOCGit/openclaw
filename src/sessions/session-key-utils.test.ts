import { describe, expect, it } from "vitest";
import {
  isDefaultHiddenUiSessionKey,
  resolveSessionSelectorVisibility,
} from "./session-key-utils.js";

describe("resolveSessionSelectorVisibility", () => {
  it("shows canonical durable operator sessions", () => {
    expect(resolveSessionSelectorVisibility("agent:main:main")).toBe("show");
    expect(resolveSessionSelectorVisibility("agent:chief:main")).toBe("show");
    expect(resolveSessionSelectorVisibility("agent:chief:telegram:direct:7756506076")).toBe("show");
  });

  it("shows real external direct sessions", () => {
    expect(resolveSessionSelectorVisibility("agent:main:telegram:direct:12345")).toBe("show");
    expect(resolveSessionSelectorVisibility("agent:main:discord:direct:user-1")).toBe("show");
  });

  it("hides unknown direct sessions by default", () => {
    expect(resolveSessionSelectorVisibility("agent:main:unknown:direct:+15555550125")).toBe("hide");
  });

  it("hides webchat sessions by default", () => {
    expect(resolveSessionSelectorVisibility("agent:main:webchat:direct:user-123")).toBe("hide");
    expect(resolveSessionSelectorVisibility("webchat:g-agent-main-w16-delegate-demo")).toBe("hide");
  });

  it("hides noncanonical agent-local worker and proof sessions by default", () => {
    expect(
      resolveSessionSelectorVisibility("agent:main:dashboard:w10-clawhub-15f39bc6-c02d-4b63"),
    ).toBe("hide");
    expect(resolveSessionSelectorVisibility("agent:main:w16:delegate:437eb169-2139")).toBe("hide");
    expect(resolveSessionSelectorVisibility("agent:web-researcher:page-read:0b196b12")).toBe(
      "hide",
    );
    expect(resolveSessionSelectorVisibility("agent:x-manager:proof-conor-2026-03-28")).toBe("hide");
    expect(
      resolveSessionSelectorVisibility("agent:main:slice7-smoke-1775354837185", {
        channel: "webchat",
        lastChannel: "webchat",
        origin: {
          provider: "webchat",
          surface: "webchat",
        },
      }),
    ).toBe("hide");
  });

  it("hides spawned child sessions even when the key itself looks generic", () => {
    expect(
      resolveSessionSelectorVisibility("agent:main:subagent:child", {
        spawnedBy: "agent:main:main",
      }),
    ).toBe("hide");
    expect(
      resolveSessionSelectorVisibility("agent:main:dashboard:child", {
        parentSessionKey: "agent:main:main",
      }),
    ).toBe("hide");
  });

  it("respects explicit selector visibility overrides", () => {
    expect(
      resolveSessionSelectorVisibility("agent:main:dashboard:child", {
        selectorVisibility: "show",
      }),
    ).toBe("show");
    expect(
      resolveSessionSelectorVisibility("agent:main:main", {
        selectorVisibility: "hide",
      }),
    ).toBe("hide");
  });
});

describe("isDefaultHiddenUiSessionKey", () => {
  it("matches the selector visibility classifier", () => {
    expect(isDefaultHiddenUiSessionKey("agent:main:main")).toBe(false);
    expect(isDefaultHiddenUiSessionKey("agent:main:unknown:direct:+15555550125")).toBe(true);
  });
});
