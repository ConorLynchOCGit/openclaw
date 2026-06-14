import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveNativeExecutionSessionFilePath,
  resolveNativeExecutionSessionTranscriptsDir,
} from "./native-execution-session-paths.js";

describe("native execution session paths", () => {
  it("stores mutable native transcripts under runtime state, not agent assets", () => {
    const env = { OPENCLAW_STATE_DIR: "/runtime-state" } as NodeJS.ProcessEnv;

    expect(
      resolveNativeExecutionSessionTranscriptsDir({
        agentId: "execution-orchestrator",
        env,
      }),
    ).toBe(
      path.join(
        "/runtime-state",
        "runtime",
        "native-execution",
        "agents",
        "execution-orchestrator",
        "sessions",
      ),
    );
    expect(
      resolveNativeExecutionSessionFilePath({
        agentId: "execution-orchestrator",
        sessionId: "native-session-1",
        env,
      }),
    ).toBe(
      path.join(
        "/runtime-state",
        "runtime",
        "native-execution",
        "agents",
        "execution-orchestrator",
        "sessions",
        "native-session-1.jsonl",
      ),
    );
  });
});
