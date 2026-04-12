import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { loadSessionStore } from "../../config/sessions.js";
import { updateSessionStoreAfterAgentRun } from "./session-store.js";

function acpMeta() {
  return {
    backend: "acpx",
    agent: "codex",
    runtimeSessionName: "runtime-1",
    mode: "persistent" as const,
    state: "idle" as const,
    lastActivityAt: Date.now(),
  };
}

describe("updateSessionStoreAfterAgentRun", () => {
  it("preserves ACP metadata when caller has a stale session snapshot", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-store-"));
    const storePath = path.join(dir, "sessions.json");
    const sessionKey = `agent:codex:acp:${randomUUID()}`;
    const sessionId = randomUUID();

    const existing: SessionEntry = {
      sessionId,
      updatedAt: Date.now(),
      acp: acpMeta(),
    };
    await fs.writeFile(storePath, JSON.stringify({ [sessionKey]: existing }, null, 2), "utf8");

    const staleInMemory: Record<string, SessionEntry> = {
      [sessionKey]: {
        sessionId,
        updatedAt: Date.now(),
      },
    };

    await updateSessionStoreAfterAgentRun({
      cfg: {} as never,
      sessionId,
      sessionKey,
      storePath,
      sessionStore: staleInMemory,
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      result: {
        payloads: [],
        meta: {
          aborted: false,
          agentMeta: {
            provider: "openai",
            model: "gpt-5.4",
          },
        },
      } as never,
    });

    const persisted = loadSessionStore(storePath, { skipCache: true })[sessionKey];
    expect(persisted?.acp).toBeDefined();
    expect(staleInMemory[sessionKey]?.acp).toBeDefined();
  });

  it("persists latest systemPromptReport for downstream warning dedupe", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-store-"));
    const storePath = path.join(dir, "sessions.json");
    const sessionKey = `agent:codex:report:${randomUUID()}`;
    const sessionId = randomUUID();

    const sessionStore: Record<string, SessionEntry> = {
      [sessionKey]: {
        sessionId,
        updatedAt: Date.now(),
        systemPromptReport: {
          source: "run",
          generatedAt: Date.now() - 60_000,
          promptArtifacts: {
            fullSystemPromptHash: "full-a",
            fullSystemPromptChars: 9,
            baseSystemPromptHash: "base-a",
            baseSystemPromptChars: 8,
            injectedFilesHash: "inject-a",
            injectedFilesChars: 3,
            skillsHash: "skills-a",
            skillsChars: 1,
            toolsListHash: "tools-list-a",
            toolsListChars: 1,
            toolsSchemaHash: "tools-schema-a",
            toolsSchemaChars: 1,
          },
          systemPrompt: {
            chars: 9,
            projectContextChars: 1,
            nonProjectContextChars: 8,
          },
          injectedWorkspaceFiles: [],
          skills: { promptChars: 0, entries: [] },
          tools: { listChars: 0, schemaChars: 0, entries: [] },
        },
      },
    };
    await fs.writeFile(storePath, JSON.stringify(sessionStore, null, 2), "utf8");

    const report = {
      source: "run" as const,
      generatedAt: Date.now(),
      promptArtifacts: {
        fullSystemPromptHash: "full-b",
        fullSystemPromptChars: 10,
        baseSystemPromptHash: "base-b",
        baseSystemPromptChars: 8,
        memoryPackPromptHash: "memory-b",
        memoryPackPromptChars: 2,
        injectedFilesHash: "inject-b",
        injectedFilesChars: 3,
        skillsHash: "skills-b",
        skillsChars: 1,
        toolsListHash: "tools-list-b",
        toolsListChars: 1,
        toolsSchemaHash: "tools-schema-b",
        toolsSchemaChars: 1,
      },
      bootstrapTruncation: {
        warningMode: "once" as const,
        warningSignaturesSeen: ["sig-a", "sig-b"],
      },
      systemPrompt: {
        chars: 1,
        projectContextChars: 1,
        nonProjectContextChars: 0,
      },
      injectedWorkspaceFiles: [],
      skills: { promptChars: 0, entries: [] },
      tools: { listChars: 0, schemaChars: 0, entries: [] },
    };

    await updateSessionStoreAfterAgentRun({
      cfg: {} as never,
      sessionId,
      sessionKey,
      storePath,
      sessionStore,
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      result: {
        payloads: [],
        meta: {
          agentMeta: {
            provider: "openai",
            model: "gpt-5.4",
          },
          systemPromptReport: report,
        },
      } as never,
    });

    const persisted = loadSessionStore(storePath, { skipCache: true })[sessionKey];
    expect(persisted?.systemPromptReport?.bootstrapTruncation?.warningSignaturesSeen).toEqual([
      "sig-a",
      "sig-b",
    ]);
    expect(persisted?.systemPromptReport?.promptArtifactChanges).toEqual({
      comparedToGeneratedAt: expect.any(Number),
      changed: true,
      changedTailOnly: false,
      stablePrefixReusable: false,
      reasons: [
        "base_prompt_changed",
        "memory_pack_presence_changed",
        "injected_files_changed",
        "skills_prompt_changed",
        "tools_list_changed",
        "tools_schema_changed",
      ],
    });
    expect(sessionStore[sessionKey]?.systemPromptReport?.bootstrapTruncation?.warningMode).toBe(
      "once",
    );
  });
});
