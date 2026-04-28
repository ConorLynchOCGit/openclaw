import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  buildHeartbeatProactivityReviewText,
  buildModelMemoryProactivityRuntimeState,
  createSkillifierDraftForCandidate,
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
  it("builds same-session opportunities from authoritative assistant transcript history", async () => {
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
    expect(state.extractionReport.telemetry.candidateCount).toBeGreaterThan(0);
    expect(state.growthLoopReport.reversePrompts.length).toBeGreaterThan(0);
    expect(state.productSurfacingReport.queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending_review",
          layer: "actionable",
          sourceRefs: expect.arrayContaining([
            "chat://main/assistant_turn/msg_final_runtime_reset",
          ]),
        }),
      ]),
    );
  });

  it("builds a bounded heartbeat review from recent authoritative opportunities", async () => {
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

    expect(review).not.toBeNull();
    expect(review?.prompt).toContain("What would help this user today?");
    expect(review?.prompt).toContain("Reply with up to 3 concise items.");
    expect(review?.prompt).not.toContain("Read HEARTBEAT.md");
    expect(review?.items[0]?.title?.toLowerCase()).toContain("runtime seam reset");
    expect(review?.items.some((item) => item.opportunityClass === "delight")).toBe(true);
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
    const heartbeatItem = state.heartbeatReport.surface.topItems.find(
      (item) => item.skillCandidate?.skillCandidateId === skillCandidateId,
    );
    expect(heartbeatItem?.skillCandidate?.skillCandidateId).toBe(skillCandidateId);
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
    expect(state.productSurfacingReport.queue.items.map((item) => item.planTitle)).toEqual(
      expect.arrayContaining(["Runtime seam reset for authoritative proactivity capture"]),
    );
  });
});
