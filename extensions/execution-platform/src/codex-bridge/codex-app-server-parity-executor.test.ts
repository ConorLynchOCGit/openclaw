import { describe, expect, it } from "vitest";
import { __testing } from "./codex-app-server-parity-executor.ts";

describe("CodexAppServerParityExecutor scoped tool guards", () => {
  it("extracts touched files from unified diffs for scope validation", () => {
    expect(
      __testing.patchTouchedFiles(
        [
          "diff --git a/extensions/execution-platform/src/codex-bridge/example.ts b/extensions/execution-platform/src/codex-bridge/example.ts",
          "--- a/extensions/execution-platform/src/codex-bridge/example.ts",
          "+++ b/extensions/execution-platform/src/codex-bridge/example.ts",
        ].join("\n"),
      ),
    ).toEqual(["extensions/execution-platform/src/codex-bridge/example.ts"]);
  });

  it("accepts only approved editable scopes", () => {
    expect(
      __testing.isWithinScope("extensions/execution-platform/src/codex-bridge/example.ts", [
        "extensions/execution-platform/src/codex-bridge/",
      ]),
    ).toBe(true);
    expect(
      __testing.isWithinScope("src/gateway/server-methods/chat.ts", [
        "extensions/execution-platform/src/codex-bridge/",
      ]),
    ).toBe(false);
  });

  it("runs approved validation tools in test environment", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(__testing.validationProcessEnv().NODE_ENV).toBe("test");
    } finally {
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
    }
  });
});
