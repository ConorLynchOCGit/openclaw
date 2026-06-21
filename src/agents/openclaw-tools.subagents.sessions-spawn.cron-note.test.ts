// Verifies cron-isolated sessions suppress run-mode subagent acceptance notes.
import { describe, expect, it } from "vitest";
import {
  resolveSubagentSpawnAcceptedNote,
  SUBAGENT_SPAWN_ACCEPTED_NOTE,
  SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE,
} from "./subagent-spawn-accepted-note.js";

describe("sessions_spawn: cron isolated session note suppression", () => {
  it("suppresses ACCEPTED_NOTE for cron isolated sessions (mode=run)", () => {
    expect(
      resolveSubagentSpawnAcceptedNote({
        spawnMode: "run",
        agentSessionKey: "agent:main:cron:dd871818:run:cf959c9f",
      }),
    ).toBeUndefined();
  });

  it("preserves ACCEPTED_NOTE for regular sessions (mode=run)", () => {
    expect(
      resolveSubagentSpawnAcceptedNote({
        spawnMode: "run",
        agentSessionKey: "agent:main:telegram:63448508",
      }),
    ).toBe(SUBAGENT_SPAWN_ACCEPTED_NOTE);
  });

  it("keeps regular run guidance push-based without recommending sessions_yield", () => {
    // Run-mode children announce completion asynchronously, not through polling.
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain("Auto-announce is push-based");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain("Continue independent work");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain(
      "Track expected child session keys and why each child was spawned",
    );
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain(
      "If your final answer depends on child output, wait/yield for its runtime completion event",
    );
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain(
      "A previous NO_REPLY, silent response, tool-only spawn turn, or wait/yield turn is not a final user-facing answer.",
    );
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).not.toContain("sessions_yield");
  });

  it("preserves ACCEPTED_NOTE for non-canonical cron-like keys", () => {
    expect(
      resolveSubagentSpawnAcceptedNote({
        spawnMode: "run",
        agentSessionKey: "agent:main:slack:cron:job:run:uuid",
      }),
    ).toBe(SUBAGENT_SPAWN_ACCEPTED_NOTE);
  });

  it("preserves ACCEPTED_NOTE when agentSessionKey is undefined", () => {
    expect(
      resolveSubagentSpawnAcceptedNote({
        spawnMode: "run",
        agentSessionKey: undefined,
      }),
    ).toBe(SUBAGENT_SPAWN_ACCEPTED_NOTE);
  });

  it("uses the session note for cron session-mode spawns", () => {
    expect(
      resolveSubagentSpawnAcceptedNote({
        spawnMode: "session",
        agentSessionKey: "agent:main:cron:dd871818:run:cf959c9f",
      }),
    ).toBe(SUBAGENT_SPAWN_SESSION_ACCEPTED_NOTE);
  });
});
