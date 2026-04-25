import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { createMemoryCaptureJobStore } from "./model-memory.capture-jobs.js";
import {
  buildLiveRetrievalEnvelope,
  buildProjectionBootstrapContextFiles,
  buildCompletedAssistantTurnCaptureInput,
  captureModelMemoryAssistantTurn,
  getModelMemoryRuntimeDirtySnapshot,
  hasExplicitDurableCaptureSignal,
  markModelMemoryRuntimeDirty,
  parseMmV2RawJsonOutput,
  resetModelMemoryRuntimeDirtyStateForTests,
  resolveCandidateModelRef,
  resolveLiveModelRef,
  resolveModelMemoryLiveRuntimeStatus,
  shouldAttemptLiveRetrievalContext,
  shouldSkipOrdinaryTurnCaptureForExplicitOptOut,
  shouldSkipOrdinaryTurnCaptureForToolDedupe,
} from "./model-memory.live-runtime.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveModelMemoryLiveRuntimeStatus", () => {
  it("stays disabled by default", () => {
    const status = resolveModelMemoryLiveRuntimeStatus({} as OpenClawConfig, {});

    expect(status.enabled).toBe(false);
    expect(status.databaseConfigured).toBe(false);
    expect(status.source).toBe("disabled");
  });

  it("enables live runtime from plugin config and reports cutover-safe legacy flags", () => {
    const config = {
      plugins: {
        slots: {
          memory: "none",
        },
        entries: {
          "model-memory": {
            enabled: true,
            config: {
              database: {
                url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
              },
              live: {
                enabled: true,
                includeRetrievalPacks: true,
              },
            },
          },
        },
      },
      agents: {
        defaults: {
          memorySearch: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;

    const status = resolveModelMemoryLiveRuntimeStatus(config, {});

    expect(status.enabled).toBe(true);
    expect(status.databaseConfigured).toBe(true);
    expect(status.databaseName).toBe("model_memory_live");
    expect(status.includeRetrievalPacks).toBe(true);
    expect(status.legacyMemorySlotDisabled).toBe(true);
    expect(status.legacyMemorySearchDisabled).toBe(true);
  });

  it("lets the env kill switch override enabled config", () => {
    const config = {
      plugins: {
        entries: {
          "model-memory": {
            enabled: true,
            config: {
              database: {
                url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
              },
              live: {
                enabled: true,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const status = resolveModelMemoryLiveRuntimeStatus(config, {
      MODEL_MEMORY_LIVE_ENABLED: "false",
    });

    expect(status.enabled).toBe(false);
    expect(status.source).toBe("disabled");
  });
});

describe("strict MMV2 model routing", () => {
  it("defaults strict capture to mini rather than nano", () => {
    expect(resolveLiveModelRef({} as OpenClawConfig, {})).toBe("openai-codex/gpt-5.4-mini");
  });

  it("lets explicit strict capture and candidate env overrides opt into another route", () => {
    expect(
      resolveLiveModelRef({} as OpenClawConfig, {
        MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID: "openrouter/openai/gpt-5.4-nano",
      }),
    ).toBe("openrouter/openai/gpt-5.4-nano");
    expect(
      resolveCandidateModelRef({} as OpenClawConfig, {
        MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID: "openai-codex/gpt-5.4-mini",
        MODEL_MEMORY_STRICT_CANDIDATE_MODEL_ID: "openrouter/openai/gpt-5.4-nano",
      }),
    ).toBe("openrouter/openai/gpt-5.4-nano");
  });
});

describe("buildCompletedAssistantTurnCaptureInput", () => {
  it("captures the user turn as the durable ordinary-turn text", () => {
    const capture = buildCompletedAssistantTurnCaptureInput({
      sessionId: "session-001",
      sessionKey: "main",
      agentId: "main",
      userText: "Please remember that validation reports should start with a concise summary.",
      assistantText: "Understood.",
      sourceMetadata: {
        provider: "openai",
        model: "gpt-test",
      },
    });

    expect(capture?.turn.currentTurnSpeaker).toBe("user");
    expect(capture?.turn.currentTurnText).toBe(
      "Please remember that validation reports should start with a concise summary.",
    );
    expect(capture?.turn.sourceMetadata).toMatchObject({
      sessionKey: "main",
      agentId: "main",
      liveRuntime: true,
      assistantResponseLength: "Understood.".length,
      provider: "openai",
      model: "gpt-test",
    });
    expect(capture?.turn.sourceMetadata.assistantResponseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(capture?.turn.sourceMetadata).not.toHaveProperty("assistantText");
  });

  it("attaches explicit user-turn authority metadata for live durable memory commands", () => {
    const capture = buildCompletedAssistantTurnCaptureInput({
      userText: "Please remember that the model-memory UI proof marker is VALUE-003.",
      assistantText: "Noted.",
    });

    expect(capture?.turn.sourceMetadata).toMatchObject({
      sourceAuthority: {
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
      },
      sourceAuthorityDecision: "auto_admit",
    });
  });

  it("attaches cited-soft metadata for live researcher report evidence with source refs", () => {
    const capture = buildCompletedAssistantTurnCaptureInput({
      userText:
        "Researcher report artifact. Cited fact: the model-memory UI proof soft marker is VALUE-004. Source ref: https://example.invalid/proof",
      assistantText: "Noted as lower-authority cited evidence.",
    });

    expect(capture?.turn.sourceMetadata).toMatchObject({
      sourceAuthority: {
        sourceProfileId: "researcher_report_artifact",
        authorityTier: "cited_soft",
      },
      sourceAuthorityDecision: "auto_admit",
      sourceAuthorityReasonCodes: ["lower_authority_auto_admit"],
    });
    expect(capture?.turn.sourceMetadata.softSourceRefs).toEqual([
      expect.objectContaining({ url: "https://example.invalid/proof" }),
    ]);
  });

  it("rejects cited-soft live capture without citations before durable source persistence", () => {
    expect(
      buildCompletedAssistantTurnCaptureInput({
        userText:
          "Researcher report artifact. Cited fact: the model-memory UI proof soft marker has no citation.",
        assistantText: "Noted.",
      }),
    ).toBeNull();
  });

  it("skips incomplete turns", () => {
    expect(
      buildCompletedAssistantTurnCaptureInput({
        userText: "Please remember this.",
        assistantText: "",
      }),
    ).toBeNull();
    expect(
      buildCompletedAssistantTurnCaptureInput({
        userText: "",
        assistantText: "Understood.",
      }),
    ).toBeNull();
  });

  it("skips explicit one-turn or no-store opt-outs before durable source persistence", () => {
    for (const userText of [
      "For this one answer only, reply in three bullet points.",
      "Do not remember this as a standing preference.",
      'Do not store this exact sentence as a memory: "temporary private phrase".',
      "Please don't retain this temporary test instruction.",
      "POSTPICKUP guard: Do not change durable memory while testing root file writes.",
      "Please don't change memory for this guard-only validation turn.",
    ]) {
      expect(shouldSkipOrdinaryTurnCaptureForExplicitOptOut(userText)).toBe(true);
      expect(
        buildCompletedAssistantTurnCaptureInput({
          userText,
          assistantText: "Understood.",
        }),
      ).toBeNull();
    }
  });

  it("skips non-durable tool turns so bounded tool-result capture does not duplicate ordinary capture", () => {
    const userText =
      "Inspect the projection artifact directory and report only the path and file count.";
    expect(hasExplicitDurableCaptureSignal(userText)).toBe(false);
    expect(
      shouldSkipOrdinaryTurnCaptureForToolDedupe({
        userText,
        sourceMetadata: { toolCallCount: 1 },
      }),
    ).toBe(true);
    expect(
      buildCompletedAssistantTurnCaptureInput({
        userText,
        assistantText: "Path: .openclaw/model-memory/projections. File count: 55.",
        sourceMetadata: { toolCallCount: 1 },
      }),
    ).toBeNull();
  });

  it("still allows explicit durable user capture signals on tool-assisted turns", () => {
    const userText =
      "Please remember this durable workspace project fact: projection materialization is artifact-only.";
    expect(hasExplicitDurableCaptureSignal(userText)).toBe(true);
    expect(
      shouldSkipOrdinaryTurnCaptureForToolDedupe({
        userText,
        sourceMetadata: { toolCallCount: 1 },
      }),
    ).toBe(false);
    const capture = buildCompletedAssistantTurnCaptureInput({
      userText,
      assistantText: "Recorded if durable.",
      sourceMetadata: { toolCallCount: 1 },
    });
    expect(capture?.turn.currentTurnText).toBe(userText);
  });

  it("routes completed turns through durable capture job state even when capture is skipped", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-live-capture-job-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    try {
      await captureModelMemoryAssistantTurn({
        sessionId: "session-001",
        sessionKey: "agent:main:main",
        agentId: "main",
        userText: "Do not remember this temporary private phrase.",
        assistantText: "Understood.",
      });

      const store = createMemoryCaptureJobStore({ env: process.env });
      const jobs = await store.listJobs();

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        sourceKind: "ordinary_turn",
        status: "skipped",
        stage: "disabled",
        traceId: expect.stringMatching(/^memory_trace_turn_[a-f0-9]{24}$/),
        rawContentPersisted: false,
        containsPromptText: false,
        containsTranscript: false,
        containsRawToolLog: false,
      });
      expect(JSON.stringify(jobs[0])).not.toContain("temporary private phrase");
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });
});

describe("model-memory runtime dirty state", () => {
  it("tracks deferred rebuild state durably without storing raw turn text", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-dirty-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    await resetModelMemoryRuntimeDirtyStateForTests({ env: process.env });

    const markedAt = new Date();
    const marked = await markModelMemoryRuntimeDirty({
      reason: "ordinary_turn_capture_written",
      memoryIds: ["memory-2", "memory-1", "memory-1"],
      markedAt,
      env: process.env,
    });

    expect(marked.state).toMatchObject({
      status: "dirty",
      dirtyReason: "ordinary_turn_capture_written",
      affectedMemoryIds: ["memory-1", "memory-2"],
      writeCountSinceLastRebuild: 1,
      markedAt: markedAt.toISOString(),
    });
    expect(
      JSON.stringify(await getModelMemoryRuntimeDirtySnapshot({ env: process.env })),
    ).not.toContain("Please remember");
    await fs.rm(stateDir, { recursive: true, force: true });
  });
});

describe("live retrieval context helpers", () => {
  const enabledStatus = {
    enabled: true,
    source: "config:plugins.entries.model-memory.config.live.enabled",
    includeRetrievalPacks: true,
    contextInjectionEnabled: true,
    captureWritesEnabled: true,
    legacyMemorySlotDisabled: true,
    legacyMemorySearchDisabled: true,
    databaseConfigured: true,
  } as const;

  it("only attempts retrieval when enabled, database-backed, pack-gated, and current-turn text exists", () => {
    expect(
      shouldAttemptLiveRetrievalContext({
        status: enabledStatus,
        currentTurnText: "What do I prefer for validation reports?",
      }),
    ).toBe(true);
    expect(
      shouldAttemptLiveRetrievalContext({
        status: { ...enabledStatus, includeRetrievalPacks: false },
        currentTurnText: "What do I prefer?",
      }),
    ).toBe(false);
    expect(
      shouldAttemptLiveRetrievalContext({
        status: { ...enabledStatus, databaseConfigured: false },
        currentTurnText: "What do I prefer?",
      }),
    ).toBe(false);
    expect(
      shouldAttemptLiveRetrievalContext({
        status: enabledStatus,
        currentTurnText: "   ",
      }),
    ).toBe(false);
  });

  it("builds a live-context retrieval envelope without persisting root file proof as scope", () => {
    const envelope = buildLiveRetrievalEnvelope({
      sessionId: "session-001",
      sessionKey: "main",
      agentId: "main",
      currentTurnText: "  What is my validation report preference?  ",
      maxResults: 4,
    });

    expect(envelope).toEqual({
      queryText: "What is my validation report preference?",
      requestPurpose: "live_context_injection",
      scope: {
        liveContextPath: "bootstrap_context",
        retrievalScope: "live_ordinary_turn",
        sessionKey: "main",
        agentId: "main",
      },
      sessionId: "session-001",
      agentId: "main",
      maxResults: 4,
    });
    expect(JSON.stringify(envelope.scope)).not.toContain("USER.md");
    expect(JSON.stringify(envelope.scope)).not.toContain("MEMORY.md");
  });

  it("threads an explicit safe memory trace id into retrieval scope", () => {
    const envelope = buildLiveRetrievalEnvelope({
      sessionId: "session-001",
      sessionKey: "main",
      agentId: "main",
      currentTurnText: "What do I prefer for validation reports?",
      traceId: "memory_trace_turn_aaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(envelope.scope).toMatchObject({
      memoryTraceId: "memory_trace_turn_aaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });
});

describe("buildProjectionBootstrapContextFiles", () => {
  it("exposes memory-md and user-md as artifact context files", () => {
    const contextFiles = buildProjectionBootstrapContextFiles({
      projectionVersions: [
        {
          id: "projection-user",
          targetId: "user-md",
          contentHash: "hash-user",
          canonicalArtifactPath: ".openclaw/model-memory/projections/user-md-hash.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 1,
          builtAt: new Date(0),
        },
        {
          id: "projection-memory",
          targetId: "memory-md",
          contentHash: "hash-memory",
          canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 1,
          builtAt: new Date(0),
        },
        {
          id: "projection-agents",
          targetId: "agents-md",
          contentHash: "hash-agents",
          canonicalArtifactPath: ".openclaw/model-memory/projections/agents-md-hash.md",
          sourceObjectIds: [],
          sourceSlotKeys: [],
          sourceSetKeys: [],
          tokenEstimate: 1,
          builtAt: new Date(0),
        },
      ],
      projectionOutputs: {
        "user-md": "# USER projection",
        "memory-md": "# MEMORY projection",
        "agents-md": "# AGENTS projection",
      },
    });

    expect(contextFiles).toEqual([
      {
        path: ".openclaw/model-memory/projections/memory-md-hash.md",
        content: "# MEMORY projection",
      },
      {
        path: ".openclaw/model-memory/projections/user-md-hash.md",
        content: "# USER projection",
      },
    ]);
  });
});

describe("parseMmV2RawJsonOutput", () => {
  it("parses direct and fenced MMV2 phase JSON without requiring the v1 action envelope", () => {
    expect(
      parseMmV2RawJsonOutput(
        '{"schema_version":"capture_routing.v1","event_id":"event-001","routing_decisions":[]}',
      ),
    ).toEqual({
      schema_version: "capture_routing.v1",
      event_id: "event-001",
      routing_decisions: [],
    });

    expect(
      parseMmV2RawJsonOutput(
        '```json\n{"schema_version":"atomic_extraction.v1","event_id":"event-001","atomic_candidates":[]}\n```',
      ),
    ).toEqual({
      schema_version: "atomic_extraction.v1",
      event_id: "event-001",
      atomic_candidates: [],
    });
  });
});
