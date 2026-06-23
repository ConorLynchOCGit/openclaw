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

  it("keeps regular run guidance push-based without finality workflow law", () => {
    // Run-mode children announce completion asynchronously, not through polling.
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain("Auto-announce is push-based");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain("continue useful independent work");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain(
      "Do not poll sessions_list, sessions_history, exec sleep, or any polling loop",
    );
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain("use sessions_yield");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).toContain(
      "Treat completion events as context for your task",
    );
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).not.toContain("Track expected child session keys");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).not.toContain("final answer depends");
    expect(SUBAGENT_SPAWN_ACCEPTED_NOTE).not.toContain("NO_REPLY");
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
