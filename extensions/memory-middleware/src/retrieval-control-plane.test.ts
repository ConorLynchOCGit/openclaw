import { describe, expect, it } from "vitest";
import type { RankedRetrievedMemoryRecord } from "./db/runtime.js";
import {
  buildMemoryObjectRetrievalControlDecision,
  shapeRankedRetrievedRecordsForControlPlane,
} from "./retrieval-control-plane.js";

describe("retrieval control plane", () => {
  it("narrows semantic fallback families for explicit procedure asks", () => {
    expect(
      buildMemoryObjectRetrievalControlDecision({
        input: {
          query: "deploy checklist",
          kind: "procedure",
          scope: "include_validated_procedures",
        },
      }),
    ).toMatchObject({
      kind: "procedure",
      scope: "include_validated_procedures",
      procedureHint: {
        procedureKey: "deploy_checklist",
      },
      semanticFallbackFamilies: ["procedure"],
    });
  });

  it("narrows project semantic fallback routing to the matching workflow guidance lane when possible", () => {
    expect(
      buildMemoryObjectRetrievalControlDecision({
        input: {
          query: "python is not available here, what should I use instead",
          kind: "project",
          scope: "approved_only",
        },
      }),
    ).toMatchObject({
      workflowImprovementHint: {
        lessonKey: "python_command_unavailable",
      },
      semanticFallbackFamilies: ["environment_constraint"],
    });

    expect(
      buildMemoryObjectRetrievalControlDecision({
        input: {
          query: "should I use scripts/committer instead of git add and git commit here",
          kind: "project",
          scope: "approved_only",
        },
      }),
    ).toMatchObject({
      workflowImprovementHint: {
        lessonKey: "scripts_committer_required",
      },
      semanticFallbackFamilies: ["workflow_tool_gotcha"],
    });
  });

  it("keeps broader workflow fallback eligibility when the query does not narrow to one lane", () => {
    expect(
      buildMemoryObjectRetrievalControlDecision({
        input: {
          query: "how should I land this carefully",
          kind: "project",
          scope: "approved_only",
        },
      }).semanticFallbackFamilies,
    ).toEqual(["environment_constraint", "workflow_tool_gotcha", "api_workaround"]);
  });

  it("shapes project-family ranking from the shared control decision", () => {
    const records: RankedRetrievedMemoryRecord[] = [
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "rule-1",
        memoryKind: "project",
        reviewState: "approved",
        content: "Use generated audit IDs instead of client timestamps.",
        metadata: {},
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 80,
        matchedFields: ["title_prefix"],
      },
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "fact-1",
        memoryKind: "project",
        reviewState: "approved",
        content: "Atlas staging branch is atlas-staging.",
        metadata: {},
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 60,
        matchedFields: ["title_prefix"],
      },
    ];

    const shaped = shapeRankedRetrievedRecordsForControlPlane({
      decision: buildMemoryObjectRetrievalControlDecision({
        input: {
          query: "what is the atlas staging branch",
          kind: "project",
          scope: "approved_only",
        },
      }),
      records,
      classifyProjectFamily: (record) => (record.id === "fact-1" ? "project_fact" : "project_rule"),
    });

    expect(shaped.map((record) => record.id)).toEqual(["fact-1"]);
  });
});
