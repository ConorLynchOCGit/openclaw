import { describe, expect, it } from "vitest";
import type { ActiveMemorySlot } from "./active-memory-slots.js";
import { selectCompiledMemoryPackPlans } from "./memory-context-pack-selection.js";

function createSlot(overrides: Partial<ActiveMemorySlot>): ActiveMemorySlot {
  return {
    slotKey: "slot-1",
    semanticKey: "semantic-1",
    primarySourceId: "source-1",
    sourceIds: ["source-1"],
    sourceObjectType: "memory_object",
    sourceMemoryKind: "feedback",
    category: "user_preference",
    scopeKind: "shared",
    projectScoped: false,
    statement: "Use concise answers.",
    displayText: "Use concise answers.",
    promptText: "Use concise answers.",
    searchText: "Use concise answers",
    selectionKey: "user.response.concise",
    tags: ["response_style"],
    facets: {},
    updatedAt: "2026-04-12T00:00:00.000Z",
    confidence: 0.92,
    projectionTargets: ["user-profile"],
    ...overrides,
  };
}

describe("selectCompiledMemoryPackPlans", () => {
  it("keeps pack order deterministic and filters agent-private slots", () => {
    const plans = selectCompiledMemoryPackPlans({
      slots: [
        createSlot({
          slotKey: "user-visible",
          selectionKey: "user.response.concise",
        }),
        createSlot({
          slotKey: "project-visible",
          semanticKey: "project.default_branch",
          sourceMemoryKind: "project",
          category: "project_rule",
          projectScoped: true,
          projectSlug: "maintenance",
          statement: "main",
          promptText: "Default branch is main.",
          searchText: "maintenance default branch main",
          selectionKey: "project.maintenance.default_branch",
          tags: ["project_rule"],
          projectionTargets: ["memory-digest"],
        }),
        createSlot({
          slotKey: "agent-hidden",
          semanticKey: "user.agent.pref",
          scopeKind: "agent",
          agentKey: "builder",
          promptText: "Use builder-only preferences.",
          searchText: "builder-only preferences",
          selectionKey: "agent.pref",
        }),
      ],
      prompt: "For the maintenance project, check the default branch.",
      agentId: "main",
    });

    expect(plans.map((plan) => plan.kind)).toEqual(["user", "project"]);
    expect(plans[0]?.slots.map((slot) => slot.slotKey)).toEqual(["user-visible"]);
    expect(plans[1]?.slots.map((slot) => slot.slotKey)).toEqual(["project-visible"]);
  });

  it("deduplicates overlapping workflow guidance by selection key", () => {
    const plans = selectCompiledMemoryPackPlans({
      slots: [
        createSlot({
          slotKey: "workflow-older",
          semanticKey: "workflow.commit_flow",
          category: "workflow_guidance",
          promptText:
            "For commit flow, use scripts/committer instead of manual git add / git commit.",
          searchText: "commit flow scripts committer manual git add commit",
          selectionKey: "workflow.commit_flow",
          updatedAt: "2026-04-09T00:00:00.000Z",
          confidence: 0.85,
          projectionTargets: ["tool-preferences"],
        }),
        createSlot({
          slotKey: "workflow-newer",
          semanticKey: "workflow.commit_flow",
          category: "workflow_guidance",
          promptText:
            'For commit flow, use scripts/committer "<msg>" <file...> instead of manual git add / git commit.',
          searchText: 'commit flow scripts committer "<msg>" <file...> manual git add commit',
          selectionKey: "workflow.commit_flow",
          updatedAt: "2026-04-11T00:00:00.000Z",
          confidence: 0.95,
          projectionTargets: ["tool-preferences"],
        }),
      ],
      prompt: "Please land this work without manual git add steps.",
      agentId: "main",
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]?.kind).toBe("project");
    expect(plans[0]?.slots.map((slot) => slot.slotKey)).toEqual(["workflow-newer"]);
  });
});
