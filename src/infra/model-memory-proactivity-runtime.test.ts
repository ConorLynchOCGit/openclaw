import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkEpisodeOutcomePack,
  writeWorkEpisodeOutcomePackArtifact,
} from "../../extensions/model-memory/runtime-api.ts";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  buildHeartbeatProactivityReviewText,
  buildCandidateReviewRecentEpisodeActivities,
  buildModelMemoryProactivityRuntimeState,
  createSkillifierDraftForCandidate,
  loadLatestWorkEpisodeOutcomePack,
  readPersistedModelMemoryProactivityProjection,
  selectCandidateReviewEventActivities,
  transcriptMessagesToHighContextCandidateReviewActivities,
} from "./model-memory-proactivity-runtime.js";

async function createRuntimeSandbox() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-proactivity-runtime-"));
  const storePath = path.join(tmpDir, "sessions.json");
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const transcriptPath = path.join(tmpDir, `${sessionId}.jsonl`);
  const cfg: OpenClawConfig = {
    agents: {
      defaults: {
        workspace: tmpDir,
      },
    },
    session: {
      store: storePath,
    },
  };
  return { tmpDir, storePath, transcriptPath, sessionId, cfg };
}

async function seedMainSessionTranscript(params: {
  storePath: string;
  transcriptPath: string;
  sessionId: string;
}) {
  await fs.writeFile(
    params.storePath,
    `${JSON.stringify({
      main: {
        sessionId: params.sessionId,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        messageCount: 2,
        lastMessageAt: Date.now(),
      },
    })}\n`,
    "utf8",
  );
  const transcriptLines = [
    {
      id: "entry-user-1",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Review the roadmap and active work to generate potential proactivity plans.",
          },
        ],
        timestamp: Date.parse("2026-04-27T16:00:00.000Z"),
      },
    },
    {
      id: "entry-assistant-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Thinking through runtime noise…",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_commentary_runtime_reset",
              phase: "commentary",
            }),
          },
          {
            type: "text",
            text: "Plan a runtime seam reset for authoritative proactivity capture.\nInvestigate why the heartbeat still returns HEARTBEAT_OK in live runtime.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_final_runtime_reset",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-27T16:00:15.000Z"),
      },
    },
  ];
  await fs.writeFile(
    params.transcriptPath,
    `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8",
  );
}

async function seedSkillCandidateTranscript(params: {
  storePath: string;
  transcriptPath: string;
  sessionId: string;
}) {
  await fs.writeFile(
    params.storePath,
    `${JSON.stringify({
      main: {
        sessionId: params.sessionId,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        messageCount: 4,
        lastMessageAt: Date.now(),
      },
    })}\n`,
    "utf8",
  );
  const transcriptLines = [
    {
      id: "entry-user-skill-1",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Review recurring work in this repo that should eventually become reusable skills.",
          },
        ],
        timestamp: Date.parse("2026-04-28T09:00:00.000Z"),
      },
    },
    {
      id: "entry-assistant-skill-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_final_skill_candidate_1",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-28T09:00:10.000Z"),
      },
    },
    {
      id: "entry-user-skill-2",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Stay on the same skill candidate area and identify the next implementation step.",
          },
        ],
        timestamp: Date.parse("2026-04-28T09:01:00.000Z"),
      },
    },
    {
      id: "entry-assistant-skill-2",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_final_skill_candidate_2",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-28T09:01:15.000Z"),
      },
    },
  ];
  await fs.writeFile(
    params.transcriptPath,
    `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8",
  );
}

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("model-memory proactivity runtime", () => {
  it("reads persisted proactivity projections without rebuilding runtime state", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    const projection = {
      schemaVersion: "phase2_proactivity_read_projection.v1",
      generatedAt: "2026-05-02T02:00:00.000Z",
      projectId: "openclaw",
      sessionKey: "main",
      productSurfacingReport: {
        reportId: "projection-product-report",
        decision: "product_queue_enabled",
        queue: {
          queueId: "projection-queue",
          surface: "chat",
          items: [{ queueItemId: "projection-item", workItemId: "work-item-1" }],
          generatedAt: "2026-05-02T02:00:00.000Z",
        },
      },
      inboxReport: {
        reportId: "projection-inbox-report",
        decision: "inbox_visible",
        digest: { items: [{ itemId: "projection-inbox-item" }] },
      },
      heartbeatReport: {
        reportId: "projection-heartbeat-report",
        decision: "heartbeat_proactivity_ready",
        surface: { topItems: [] },
      },
    };
    await fs.writeFile(
      path.join(sandbox.tmpDir, "model-memory-proactivity-state.json"),
      `${JSON.stringify({
        schemaVersion: "phase2_proactivity_activity_store.v1",
        records: [],
        liveEvents: [],
        lifecycleOverrides: [],
        authoritativeSyncBySessionKey: {},
        workEpisodeOutcomePacks: [
          {
            episodeId: "episode-1",
            contentHash: "hash-1",
            packPath: "/tmp/work-episode-outcome-pack.json",
            projectId: "openclaw",
            runtime: "codex",
            outcomeStatus: "completed",
            completedAt: "2026-05-02T01:00:00.000Z",
            indexedAt: "2026-05-02T01:01:00.000Z",
            reviewStatus: "reviewed",
            eligibilityStatus: "eligible",
            eligibilityReasonCodes: [],
          },
        ],
        readProjection: projection,
      })}\n`,
      "utf8",
    );

    const report = await readPersistedModelMemoryProactivityProjection({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
    });

    expect(report.decision).toBe("projection_ready");
    expect(report.projection?.productSurfacingReport.queue.queueId).toBe("projection-queue");
    expect(report.workEpisodeOutcomePackIndex).toHaveLength(1);
  });

  it("keeps authoritative assistant transcript history as structural candidate-review input", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(state.activityStoreReport.store.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey: "main",
          sourceKind: "assistant_turn",
          sourceLabel: "authoritative_transcript",
          sourceMessageId: "msg_final_runtime_reset",
        }),
      ]),
    );
    expect(
      state.activityStoreReport.store.records.find(
        (record) => record.sourceMessageId === "msg_commentary_runtime_reset",
      ),
    ).toBeUndefined();
    expect(state.extractionReport.telemetry.candidateCount).toBe(0);
    expect(state.growthLoopReport.reversePrompts).toHaveLength(0);
    expect(state.productSurfacingReport.queue.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceRefs: expect.arrayContaining([
            "chat://main/assistant_turn/msg_final_runtime_reset",
          ]),
        }),
      ]),
    );
    expect(state.productSurfacingReport.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
    });
  });

  it("does not build a visible heartbeat review from deterministic-only card text", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);

    const review = await buildHeartbeatProactivityReviewText({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(review).toBeNull();
  });

  it("creates one canonical skill candidate across ledger, queue, and heartbeat state", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedSkillCandidateTranscript(sandbox);

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(state.skillCandidateReport.decision).toBe("skill_candidates_ready");
    expect(state.skillCandidateReport.records).toHaveLength(1);
    const skillCandidateId = state.skillCandidateReport.records[0]?.skillCandidateId;
    expect(skillCandidateId).toBeTruthy();
    const queueItem = state.productSurfacingReport.queue.items.find(
      (item) => item.opportunityClass === "skill_candidate",
    );
    expect(queueItem?.skillCandidate?.skillCandidateId).toBe(skillCandidateId);
    expect(queueItem?.layer).toBe("diagnostic");
    expect(queueItem?.status).toBe("blocked");
    expect(queueItem?.blockedReasonCodes).toContain(
      "presentation:model_authored_visible_copy_required",
    );
    expect(
      state.heartbeatReport.surface.topItems.some(
        (item) => item.skillCandidate?.skillCandidateId === skillCandidateId,
      ),
    ).toBe(false);
  });

  it("keeps model-reviewed proactive plans available on normal queue reloads", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);
    await fs.writeFile(
      path.join(path.dirname(sandbox.storePath), "model-memory-proactivity-state.json"),
      `${JSON.stringify({
        schemaVersion: "phase2_proactivity_activity_store.v1",
        records: [],
        liveEvents: [],
        lifecycleOverrides: [],
        authoritativeSyncBySessionKey: {},
        modelReviewedOpportunities: [
          {
            sourceFamily: "pattern_or_followup",
            opportunityClass: "proactive_plan",
            opportunityId: "model-reviewed-plan-1",
            projectId: "openclaw",
            sessionKey: "main",
            title: "Review persisted model-owned proactivity plan",
            whyNow: "A previous model review found a bounded follow-up plan.",
            proposedNextStep: "Inspect the persisted plan before running another review.",
            expectedUserValue: "Avoids losing model-reviewed work between UI refreshes.",
            evidenceSummary: "Model-reviewed bounded episode proposal from OpenClaw activity.",
            confidence: "high",
            sourceRefs: ["candidate-review-packet://persisted-plan"],
            sourceProfileIds: ["cited_assistant_answer"],
            authorityTiers: ["cited_soft"],
            contentHashes: ["persisted-plan-content"],
            proofHashes: ["persisted-plan-proof"],
            noDarkDataStatus: "pass",
            blockedReasonCodes: ["model_reviewed_candidate", "high_context_review"],
            workItemKind: "planning_request",
            generatedAt: "2026-04-28T09:05:00.000Z",
          },
        ],
        skillCandidates: [],
        skillPackageDrafts: [],
        candidateReviewEpisodeKeys: [],
      })}\n`,
      "utf8",
    );

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(state.ledgerReport.ledger.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunityId: "model-reviewed-plan-1",
          sourceFamily: "pattern_or_followup",
          opportunityClass: "proactive_plan",
        }),
      ]),
    );
    expect(state.productSurfacingReport.queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunityId: "model-reviewed-plan-1",
        }),
      ]),
    );
  });

  it("persists one bounded skillifier draft and surfaces it through the same candidate id", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedSkillCandidateTranscript(sandbox);

    const initial = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });
    const skillCandidateId = initial.skillCandidateReport.records[0]?.skillCandidateId;
    expect(skillCandidateId).toBeTruthy();

    const created = await createSkillifierDraftForCandidate({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
      skillCandidateId,
    });

    expect(created.report.decision).toBe("draft_ready");
    expect(created.report.draft.skillDirectoryPath).toContain(path.join(sandbox.tmpDir, "skills"));

    const refreshed = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });
    const queueItem = refreshed.productSurfacingReport.queue.items.find(
      (item) => item.skillCandidate?.skillCandidateId === skillCandidateId,
    );
    expect(queueItem?.draftReady).toBe(true);
    expect(queueItem?.skillifierDraft).toMatchObject({
      skillPackageId: created.report.skillPackageId,
      skillifierReportId: created.report.reportId,
      draftPath: created.report.draft.skillDirectoryPath,
    });
    expect(refreshed.skillifierDrafts).toHaveLength(1);
    expect(refreshed.skillifierDrafts[0]?.skillCandidateId).toBe(skillCandidateId);
  });

  it("excludes operational assistant messages and placeholder fallbacks from authoritative records", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await fs.writeFile(
      sandbox.storePath,
      `${JSON.stringify({
        main: {
          sessionId: sandbox.sessionId,
          updatedAt: Date.now(),
          createdAt: Date.now(),
          messageCount: 5,
          lastMessageAt: Date.now(),
        },
      })}\n`,
      "utf8",
    );
    const transcriptLines = [
      {
        id: "entry-user-1",
        message: {
          role: "user",
          content: [{ type: "text", text: "Give me the next concrete fix." }],
          timestamp: Date.parse("2026-04-27T16:10:00.000Z"),
        },
      },
      {
        id: "entry-assistant-turn-activity",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Turn activity: model started" }],
          model: "turn-activity",
          __openclaw: { kind: "turn_activity" },
          timestamp: Date.parse("2026-04-27T16:10:01.000Z"),
        },
      },
      {
        id: "entry-assistant-memory-activity",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "[Memory Activity] retrieval started" }],
          model: "memory-activity",
          __openclaw: { kind: "model_memory_activity" },
          timestamp: Date.parse("2026-04-27T16:10:02.000Z"),
        },
      },
      {
        id: "entry-assistant-commentary-only",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Thinking through options",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_commentary_only",
                phase: "commentary",
              }),
            },
          ],
          timestamp: Date.parse("2026-04-27T16:10:03.000Z"),
        },
      },
      {
        id: "entry-assistant-final",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Commentary that should not be used",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_commentary_2",
                phase: "commentary",
              }),
            },
            {
              type: "text",
              text: "Investigate the authoritative final capture filter and remove operational noise.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_final_filter_fix",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-04-27T16:10:05.000Z"),
        },
      },
    ];
    await fs.writeFile(
      sandbox.transcriptPath,
      `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf8",
    );

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    const assistantRecords = state.activityStoreReport.store.records.filter(
      (record) => record.sourceKind === "assistant_turn",
    );
    expect(assistantRecords).toEqual([
      expect.objectContaining({
        sourceMessageId: "msg_final_filter_fix",
        boundedText:
          "Investigate the authoritative final capture filter and remove operational noise.",
      }),
    ]);
  });

  it("keeps commentary-phase assistant text in the high-context candidate-review window", () => {
    const activities = transcriptMessagesToHighContextCandidateReviewActivities({
      sessionKey: "main",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Review the current test failure and decide whether it reveals a reusable workflow.",
            },
          ],
          timestamp: Date.parse("2026-04-29T17:00:00.000Z"),
          __openclaw: { id: "user-high-context" },
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "The important diagnosis is in commentary because this UI path stores useful assistant answers there.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_commentary_high_context",
                phase: "commentary",
              }),
            },
          ],
          timestamp: Date.parse("2026-04-29T17:00:10.000Z"),
        },
      ],
    });

    expect(activities.map((activity) => activity.ref)).toEqual([
      "chat://main/user_turn/user-high-context",
      "chat://main/assistant_turn/msg_commentary_high_context",
    ]);
    expect(activities[1]?.boundedText).toContain("important diagnosis is in commentary");
  });

  it("excludes operational runtime and heartbeat scaffold messages from high-context candidate review", () => {
    const activities = transcriptMessagesToHighContextCandidateReviewActivities({
      sessionKey: "main",
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "[Memory Activity] ordinary turn capture started" }],
          model: "memory-activity",
          __openclaw: { kind: "model_memory_activity" },
          timestamp: Date.parse("2026-05-01T11:00:00.000Z"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What would help this user today?\nReply with up to 3 concise items.\nIf the untrusted heartbeat context includes proactivityItems, choose from those items.",
            },
          ],
          timestamp: Date.parse("2026-05-01T11:00:05.000Z"),
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Turn activity: model started" }],
          model: "turn-activity",
          __openclaw: { kind: "turn_activity" },
          timestamp: Date.parse("2026-05-01T11:00:06.000Z"),
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "- **Add a packet quality gate before candidate review**\n- Why now: this is a heartbeat-generated card and should not become the next review input.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_heartbeat_card_response",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-05-01T11:00:07.000Z"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "The Work Queue candidate input should use the current bounded episode, not broad mixed tails.",
            },
          ],
          timestamp: Date.parse("2026-05-01T11:01:00.000Z"),
          __openclaw: { id: "user-real-input" },
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Understood.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_real_ack",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-05-01T11:01:10.000Z"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "For candidate review evidence only, consider this repeatable workflow. Safety constraint for this chat response: do not edit files; reply with one short acknowledgement only.",
            },
          ],
          timestamp: Date.parse("2026-05-01T11:02:00.000Z"),
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Understood.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_proof_ack",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-05-01T11:02:10.000Z"),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Start a bounded open in current chat for this proactive work item.\nTitle: Memory Capture Skip Noise Suppression Decision\nPurpose: Clarifies whether this work should be rescoped.",
            },
          ],
          timestamp: Date.parse("2026-05-01T11:03:00.000Z"),
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Understood.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_handoff_ack",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-05-01T11:03:10.000Z"),
        },
      ],
    });

    expect(activities.map((activity) => activity.ref)).toEqual([
      "chat://main/user_turn/user-real-input",
      "chat://main/assistant_turn/msg_real_ack",
    ]);
  });

  it("assembles heartbeat candidate review from one bounded episode instead of unrelated Codex tails", () => {
    const result = buildCandidateReviewRecentEpisodeActivities({
      openClawActivities: [
        {
          ref: "chat://main/user_turn/recent-goal",
          role: "user",
          kind: "ask",
          boundedText: "Fix the Work Queue duplicate surfacing issue before more UX polish.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:00:00.000Z",
        },
        {
          ref: "chat://main/assistant_turn/recent-plan",
          role: "assistant",
          kind: "final",
          boundedText: "Diagnose whether candidate review packet assembly is mixing episodes.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:01:00.000Z",
        },
      ],
      codexActivities: [
        {
          ref: "codex://old-session.jsonl#41",
          role: "user",
          kind: "ask",
          boundedText: "An old unrelated Codex prompt about a different implementation.",
          sourceRuntime: "codex",
          recordedAt: "2026-05-01T08:00:00.000Z",
        },
      ],
      heartbeatActivities: [
        {
          ref: "gateway://heartbeat/last/1770000000000",
          role: "system_event",
          kind: "result_summary",
          boundedText: "Heartbeat started after the current Work Queue discussion.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:02:00.000Z",
        },
      ],
      openClawTurnWindow: 12,
      codexTurnWindow: 24,
      packetMaxChars: 160_000,
      heartbeatIsReviewTrigger: true,
    });

    expect(result.report.primaryRuntime).toBe("openclaw");
    expect(result.report.selectedCounts).toMatchObject({
      openclaw: 2,
      codex: 0,
      heartbeat: 1,
      total: 3,
    });
    expect(result.report.droppedCounts.codexOutsideEpisode).toBe(1);
    expect(result.activities.map((activity) => activity.ref)).toEqual([
      "chat://main/user_turn/recent-goal",
      "chat://main/assistant_turn/recent-plan",
      "gateway://heartbeat/last/1770000000000",
    ]);
  });

  it("keeps temporally adjacent Codex activity as same-episode evidence", () => {
    const result = buildCandidateReviewRecentEpisodeActivities({
      openClawActivities: [
        {
          ref: "chat://main/user_turn/current-goal",
          role: "user",
          kind: "ask",
          boundedText: "Use the current Codex evidence while diagnosing the Work Queue issue.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:00:00.000Z",
        },
        {
          ref: "chat://main/assistant_turn/current-summary",
          role: "assistant",
          kind: "final",
          boundedText: "The current Codex run found duplicate surfacing in the active queue.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:10:00.000Z",
        },
      ],
      codexActivities: [
        {
          ref: "codex://current-session.jsonl#8",
          role: "tool_summary",
          kind: "result_summary",
          boundedText: "Command pnpm test:file ui/src/ui/views/work-queue.test.ts passed.",
          sourceRuntime: "codex",
          recordedAt: "2026-05-01T10:05:00.000Z",
        },
      ],
      openClawTurnWindow: 12,
      codexTurnWindow: 24,
      packetMaxChars: 160_000,
      heartbeatIsReviewTrigger: true,
    });

    expect(result.report.selectedCounts.codex).toBe(1);
    expect(result.report.reasonCodes).toContain("codex_within_episode_window");
    expect(result.activities.map((activity) => activity.ref)).toEqual([
      "chat://main/user_turn/current-goal",
      "codex://current-session.jsonl#8",
      "chat://main/assistant_turn/current-summary",
    ]);
  });

  it("uses content refs rather than heartbeat ticks for heartbeat review episode identity", () => {
    const eventActivities = selectCandidateReviewEventActivities({
      heartbeatIsReviewTrigger: true,
      recentActivities: [
        {
          ref: "chat://main/user_turn/current-goal",
          role: "user",
          kind: "ask",
          boundedText: "Fix the Work Queue duplicate candidate input path.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:00:00.000Z",
        },
        {
          ref: "chat://main/assistant_turn/current-summary",
          role: "assistant",
          kind: "final",
          boundedText: "The episode identity should not change just because heartbeat ran.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:01:00.000Z",
        },
        {
          ref: "gateway://heartbeat/last/1770000000000",
          role: "system_event",
          kind: "result_summary",
          boundedText: "Heartbeat tick one.",
          sourceRuntime: "openclaw",
          recordedAt: "2026-05-01T10:02:00.000Z",
        },
      ],
    });

    expect(eventActivities.map((activity) => activity.ref)).toEqual([
      "chat://main/user_turn/current-goal",
      "chat://main/assistant_turn/current-summary",
    ]);
  });

  it("loads the latest work episode outcome pack as a structural candidate-review source", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    const previousRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = sandbox.tmpDir;
    try {
      await writeWorkEpisodeOutcomePackArtifact(
        buildWorkEpisodeOutcomePack({
          runtime: "codex",
          projectId: "openclaw",
          sessionKey: "main",
          completedAt: "2026-05-01T12:00:00.000Z",
          userGoal: "Use outcome packs for candidate review.",
          workSummary: "Older pack.",
          finalOutcome: "Older candidate-review pack written.",
          filesTouched: [],
          testsRun: [],
          failuresAndFixes: [],
          unresolvedQuestions: [],
          followUpCandidates: [],
          skillImprovementEvidence: [],
          sourceRefs: ["work-episode://older"],
        }),
        { artifactRoot: sandbox.tmpDir, timestamp: "2026-05-01T12:00:00.000Z" },
      );
      const latest = buildWorkEpisodeOutcomePack({
        runtime: "codex",
        projectId: "openclaw",
        sessionKey: "main",
        completedAt: "2026-05-01T13:00:00.000Z",
        userGoal: "Use the latest outcome pack for candidate review.",
        workSummary: "Latest pack.",
        finalOutcome: "Latest candidate-review pack written.",
        filesTouched: [],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [],
        skillImprovementEvidence: [],
        sourceRefs: ["work-episode://latest"],
      });
      await writeWorkEpisodeOutcomePackArtifact(latest, {
        artifactRoot: sandbox.tmpDir,
        timestamp: "2026-05-01T13:00:00.000Z",
      });

      const loaded = await loadLatestWorkEpisodeOutcomePack();

      expect(loaded?.episodeId).toBe(latest.episodeId);
      expect(loaded?.sourceRefs).toEqual(["work-episode://latest"]);
    } finally {
      if (previousRoot === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
      } else {
        process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousRoot;
      }
    }
  });

  it("discovers outcome packs from the mounted host-operator repo root when no explicit pack root is configured", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    const previousHostRepoRoot = process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT;
    const hostPackRoot = path.join(
      sandbox.tmpDir,
      ".artifacts",
      "model-memory",
      "work-episode-outcome-pack",
    );
    delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT = sandbox.tmpDir;
    try {
      const pack = buildWorkEpisodeOutcomePack({
        runtime: "codex",
        projectId: "openclaw",
        sessionKey: "main",
        completedAt: "2030-05-01T13:30:00.000Z",
        userGoal: "Expose host repo outcome packs to the gateway runtime.",
        workSummary: "The host-mounted repo contains a work episode outcome pack.",
        finalOutcome: "Runtime discovery should index the host-mounted pack root.",
        filesTouched: [
          {
            path: "src/infra/model-memory-proactivity-runtime.ts",
            changeKind: "modified",
            summary: "Added host repo outcome-pack root discovery.",
          },
        ],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [],
        skillImprovementEvidence: [],
        sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
      });
      await writeWorkEpisodeOutcomePackArtifact(pack, {
        artifactRoot: hostPackRoot,
        timestamp: "2030-05-01T13:30:00.000Z",
      });

      const loaded = await loadLatestWorkEpisodeOutcomePack();

      expect(loaded?.episodeId).toBe(pack.episodeId);
      expect(loaded?.sourceRefs).toEqual(["repo://src/infra/model-memory-proactivity-runtime.ts"]);
    } finally {
      if (previousPackRoot === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
      } else {
        process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousPackRoot;
      }
      if (previousHostRepoRoot === undefined) {
        delete process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT;
      } else {
        process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT = previousHostRepoRoot;
      }
    }
  });

  it("skips model-reviewed candidate generation when no outcome pack exists", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);
    const previousEnabled = process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED;
    const previousRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED = "1";
    process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = path.join(
      sandbox.tmpDir,
      "empty-outcome-packs",
    );
    try {
      const state = await buildModelMemoryProactivityRuntimeState({
        cfg: sandbox.cfg,
        sessionKey: "main",
        projectId: "openclaw",
        operatorId: "operator-conor",
        userId: "conor",
        recipientId: "conor",
        candidateReviewOverride: { forceRun: true },
      });

      expect(state.candidateReviewReport).toBeNull();
      expect(state.candidateReviewProposals).toEqual([]);
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED;
      } else {
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED = previousEnabled;
      }
      if (previousRoot === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
      } else {
        process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousRoot;
      }
    }
  });

  it("indexes multiple outcome packs and marks no-op packs ineligible without raw-session fallback", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    const packRoot = path.join(sandbox.tmpDir, "outcome-packs");
    const previousEnabled = process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED;
    const previousRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    delete process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED;
    process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = packRoot;
    try {
      const eligible = buildWorkEpisodeOutcomePack({
        runtime: "codex",
        projectId: "openclaw",
        sessionKey: "main",
        completedAt: "2026-05-01T14:00:00.000Z",
        outcomeStatus: "completed",
        workType: "implementation",
        userGoal: "Emit structured pack evidence for proactivity review.",
        workSummary:
          "A meaningful task touched runtime files and produced bounded follow-up evidence.",
        finalOutcome: "The pack is eligible for model-owned candidate review.",
        filesTouched: [
          {
            path: "src/infra/model-memory-proactivity-runtime.ts",
            changeKind: "modified",
            summary: "Indexes work episode outcome packs.",
          },
        ],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [
          {
            title: "Add Pack Runtime Proof",
            rationale: "Prove pack consumption before live gateway validation.",
            sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
          },
        ],
        skillImprovementEvidence: [],
        sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
      });
      const noOp = buildWorkEpisodeOutcomePack({
        runtime: "openclaw",
        projectId: "openclaw",
        sessionKey: "main",
        completedAt: "2026-05-01T14:05:00.000Z",
        outcomeStatus: "completed",
        workType: "other",
        userGoal: "Acknowledge a message.",
        workSummary: "Acknowledged without durable work.",
        finalOutcome: "No durable evidence was created.",
        filesTouched: [],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [],
        skillImprovementEvidence: [],
        sourceRefs: ["work-episode://noop"],
      });
      await writeWorkEpisodeOutcomePackArtifact(eligible, {
        artifactRoot: packRoot,
        timestamp: "2026-05-01T14:00:00.000Z",
      });
      await writeWorkEpisodeOutcomePackArtifact(noOp, {
        artifactRoot: packRoot,
        timestamp: "2026-05-01T14:05:00.000Z",
      });

      const state = await buildModelMemoryProactivityRuntimeState({
        cfg: sandbox.cfg,
        sessionKey: "main",
        projectId: "openclaw",
        operatorId: "operator-conor",
        userId: "conor",
        recipientId: "conor",
      });

      expect(state.candidateReviewReport).toBeNull();
      expect(state.candidateReviewCodexAdapterReport).toBeNull();
      const persistedStore = JSON.parse(
        await fs.readFile(
          path.join(path.dirname(sandbox.storePath), "model-memory-proactivity-state.json"),
          "utf8",
        ),
      ) as { workEpisodeOutcomePacks?: unknown[] };
      expect(persistedStore.workEpisodeOutcomePacks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            episodeId: eligible.episodeId,
            reviewStatus: "unreviewed",
            eligibilityStatus: "eligible",
          }),
          expect.objectContaining({
            episodeId: noOp.episodeId,
            reviewStatus: "unreviewed",
            eligibilityStatus: "ineligible",
            eligibilityReasonCodes: expect.arrayContaining(["evidence_bearing_fields_missing"]),
          }),
        ]),
      );
    } finally {
      if (previousEnabled === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED;
      } else {
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED = previousEnabled;
      }
      if (previousRoot === undefined) {
        delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
      } else {
        process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousRoot;
      }
    }
  });

  it("suppresses internal proactivity handoff and proof prompts from transcript-derived opportunities", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await fs.writeFile(
      sandbox.storePath,
      `${JSON.stringify({
        main: {
          sessionId: sandbox.sessionId,
          updatedAt: Date.now(),
          createdAt: Date.now(),
          messageCount: 4,
          lastMessageAt: Date.now(),
        },
      })}\n`,
      "utf8",
    );
    const transcriptLines = [
      {
        id: "entry-user-proof",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Operator Phase 2 staged action approval proof. Proof marker: TEST-PROOF. Approve the staged proposal for audit only. Do not execute.",
            },
          ],
          timestamp: Date.parse("2026-04-27T16:20:00.000Z"),
        },
      },
      {
        id: "entry-assistant-proof",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Acknowledged. Proof marker: TEST-PROOF. Status: staged proposal approved for audit only.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_final_proof_noise",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-04-27T16:20:10.000Z"),
        },
      },
      {
        id: "entry-user-real",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Review the roadmap and active work to generate potential proactivity plans.",
            },
          ],
          timestamp: Date.parse("2026-04-27T16:21:00.000Z"),
        },
      },
      {
        id: "entry-assistant-real",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Plan the runtime seam reset for authoritative proactivity capture.",
              textSignature: JSON.stringify({
                v: 1,
                id: "msg_final_real_followup",
                phase: "final_answer",
              }),
            },
          ],
          timestamp: Date.parse("2026-04-27T16:21:10.000Z"),
        },
      },
    ];
    await fs.writeFile(
      sandbox.transcriptPath,
      `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
      "utf8",
    );

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(
      state.activityStoreReport.store.records.find(
        (record) => record.sourceMessageId === "msg_final_proof_noise",
      ),
    ).toBeUndefined();
    expect(state.productSurfacingReport.queue.items.map((item) => item.planTitle)).not.toEqual(
      expect.arrayContaining(["Staged proposal"]),
    );
    expect(state.productSurfacingReport.queue.items.map((item) => item.planTitle)).not.toEqual(
      expect.arrayContaining(["Runtime seam reset for authoritative proactivity capture"]),
    );
    expect(state.extractionReport.telemetry.candidateCount).toBe(0);
  });
});
