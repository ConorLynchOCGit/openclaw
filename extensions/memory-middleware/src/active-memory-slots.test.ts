import { describe, expect, it } from "vitest";
import { buildActiveMemorySlots } from "./active-memory-slots.js";
import type { MemoryObjectRecord } from "./db/runtime.js";

function createMemoryObjectRecord(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Use concise answers.",
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("active memory slots", () => {
  it("collapses duplicate approved records into one latest slot", () => {
    const older = createMemoryObjectRecord({
      id: "memory-old",
      updatedAt: "2026-04-09T00:00:00.000Z",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            subject: "response style",
            statement: "Use plain English.",
            tags: ["response_style"],
            facets: {},
          },
          identity: {
            dedupeKey: "user.response.plain_english",
          },
        },
      },
    });
    const newer = createMemoryObjectRecord({
      id: "memory-new",
      updatedAt: "2026-04-11T00:00:00.000Z",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            subject: "response style",
            statement: "Use plain English.",
            tags: ["response_style"],
            facets: {},
          },
          identity: {
            dedupeKey: "user.response.plain_english",
          },
        },
      },
    });

    const slots = buildActiveMemorySlots([older, newer]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      primarySourceId: "memory-new",
      sourceIds: ["memory-new", "memory-old"],
      category: "user_preference",
      scopeKind: "shared",
      promptText: "Use plain English.",
      projectionTargets: ["user-profile"],
    });
  });

  it("derives project-rule slots with project scope and memory-digest projections", () => {
    const projectRule = createMemoryObjectRecord({
      id: "project-rule-1",
      memoryKind: "project",
      content: "Default branch is main.",
      projectId: "maintenance",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            subject: "default branch",
            statement: "main",
            tags: ["project_rule"],
            facets: {
              projectScope: "maintenance",
              fieldKey: "default_branch",
            },
          },
          identity: {
            dedupeKey: "project.maintenance.default_branch",
          },
        },
      },
    });

    const slots = buildActiveMemorySlots([projectRule]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      primarySourceId: "project-rule-1",
      category: "project_rule",
      scopeKind: "project",
      projectScoped: true,
      projectSlug: "maintenance",
      displayText: "default branch: main",
      promptText: "Default branch is main.",
      projectionTargets: ["memory-digest"],
    });
  });

  it("renders workflow guidance slots from canonical facets instead of generic storage text", () => {
    const workflowGuidance = createMemoryObjectRecord({
      id: "workflow-guidance-1",
      content: "for commit flow, use scripts/committer instead of manual git add / git commit",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            subject: "commit flow",
            statement:
              "for commit flow, use scripts/committer instead of manual git add / git commit",
            tags: ["workflow_guidance", "feedback"],
            facets: {
              subjectKey: "commit_flow",
              guidancePattern: "use_instead_of",
              recommendedAction: 'scripts/committer "<msg>" <file...>',
              avoidAction: "manual git add / git commit",
            },
          },
          identity: {
            dedupeKey: "workflow.commit_flow",
            subjectKey: "commit_flow",
          },
        },
      },
    });

    const slots = buildActiveMemorySlots([workflowGuidance]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      category: "workflow_guidance",
      promptText:
        'For commit flow, use scripts/committer "<msg>" <file...> instead of manual git add / git commit.',
    });
  });

  it("canonicalizes response-style templates into stronger directive text", () => {
    const responseStyle = createMemoryObjectRecord({
      id: "response-style-1",
      content: "Use bullet points.",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            subject: "response format",
            statement: "Use bullet points.",
            tags: ["response_style"],
            facets: {},
          },
          identity: {
            dedupeKey: "user.response.bullets",
          },
          compatibility: {
            template: "responses_bullets",
          },
        },
      },
    });

    const slots = buildActiveMemorySlots([responseStyle]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      category: "user_preference",
      compatibilityTemplate: "responses_bullets",
      promptText: "Use bullet points when listing items.",
    });
  });
});
