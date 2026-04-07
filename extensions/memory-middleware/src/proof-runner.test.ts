import { describe, expect, it } from "vitest";
import { parseMemoryProofPlan } from "./proof-runner.js";

describe("parseMemoryProofPlan", () => {
  it("accepts bounded transcript-to-search proof plans", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "workflow tool gotcha proof",
      steps: [
        {
          id: "capture",
          kind: "transcript_capture",
          text: "Do not use git stash in this repo during multi-agent work.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "workflow_improvement",
            key: "workflow_tool_gotcha:git_stash_unsafe",
            subjectKey: "workflow_tool_gotcha:git_stash_unsafe",
            projectId: "project-1",
          },
        },
        {
          id: "review",
          kind: "candidate_review",
          candidateIdFromStep: "capture",
          outcome: "accepted",
        },
        {
          id: "promote",
          kind: "candidate_promote_memory",
          candidateIdFromStep: "capture",
        },
        {
          id: "search",
          kind: "hybrid_search",
          query: "can i temporarily shelve my changes while someone else edits this repo",
          kindFilter: "project",
          projectId: "project-1",
          expectation: {
            recordIdFromStep: "promote",
            matchedFieldsInclude: ["semantic_embedding", "semantic_fallback"],
          },
        },
      ],
    });

    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0]?.kind).toBe("transcript_capture");
    expect(plan.steps[3]?.kind).toBe("hybrid_search");
  });

  it("accepts transcript steps that explicitly expect no lifecycle writes", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "generic workflow ambiguity proof",
      steps: [
        {
          id: "capture_vague_complaint",
          kind: "transcript_capture",
          text: "Build and rollout stuff has felt noisy lately.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectNoLifecycle: true,
        },
      ],
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectNoLifecycle: true,
    });
  });

  it("accepts workflow phrase-pattern transcript capture expectations", () => {
    const plan = parseMemoryProofPlan({
      mode: "isolated",
      label: "workflow phrase induction proof",
      steps: [
        {
          id: "capture_phrase",
          kind: "transcript_capture",
          text: "Prefer bulletized proof IDs for release proof notes instead of paraphrased rollout summaries.",
          sessionFile: "/tmp/proof.jsonl",
          sessionKey: "agent:test:proof",
          agentExternalKey: "chief",
          attribution: {
            agentId: "agent-1",
            sessionId: "session-1",
            projectId: "project-1",
          },
          expectation: {
            family: "workflow_phrase_pattern",
            key: "pattern-key-1",
            subjectKey: "target-key-1",
            normalizedPhrase:
              "prefer bulletized proof ids for release proof notes instead of paraphrased rollout summaries.",
            projectId: "project-1",
          },
        },
      ],
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      kind: "transcript_capture",
      expectation: {
        family: "workflow_phrase_pattern",
        key: "pattern-key-1",
      },
    });
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "production",
        label: "bad plan",
        steps: [
          {
            id: "dup",
            kind: "hybrid_search",
            query: "git stash unsafe",
          },
          {
            id: "dup",
            kind: "hybrid_search",
            query: "git stash unsafe",
          },
        ],
      }),
    ).toThrow(/duplicate proof step id/i);
  });

  it("requires a candidate reference for candidate review", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "isolated",
        label: "missing candidate ref",
        steps: [
          {
            id: "review",
            kind: "candidate_review",
            outcome: "accepted",
          },
        ],
      }),
    ).toThrow(/candidate_review requires candidateId or candidateIdFromStep/i);
  });

  it("requires transcript capture to declare either expectation or ignore mode", () => {
    expect(() =>
      parseMemoryProofPlan({
        mode: "isolated",
        label: "missing capture expectation",
        steps: [
          {
            id: "capture",
            kind: "transcript_capture",
            text: "Use this instead.",
            sessionFile: "/tmp/proof.jsonl",
            sessionKey: "agent:test:proof",
            agentExternalKey: "chief",
            attribution: {
              agentId: "agent-1",
              sessionId: "session-1",
              projectId: "project-1",
            },
          },
        ],
      }),
    ).toThrow(/transcript_capture requires expectation or expectNoLifecycle/i);
  });
});
