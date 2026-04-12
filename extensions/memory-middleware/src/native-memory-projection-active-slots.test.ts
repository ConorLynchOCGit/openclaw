import { describe, expect, it } from "vitest";
import type { ActiveMemorySlot } from "./active-memory-slots.js";
import {
  buildNativeMemoryProjectionCandidateFromActiveSlot,
  buildNativeMemoryProjectionCandidatesFromActiveSlots,
} from "./native-memory-projection-active-slots.js";

function createSlot(overrides: Partial<ActiveMemorySlot>): ActiveMemorySlot {
  return {
    slotKey: "slot-1",
    semanticKey: "semantic-1",
    primarySourceId: "source-1",
    sourceIds: ["source-1"],
    sourceObjectType: "memory_object",
    sourceMemoryKind: "feedback",
    category: "workflow_guidance",
    scopeKind: "shared",
    projectScoped: false,
    statement: "Run pnpm check:fast before landing docs-only changes.",
    displayText: "Run pnpm check:fast before landing docs-only changes.",
    promptText: "Run pnpm check:fast before landing docs-only changes.",
    searchText: "pnpm check fast landing docs-only changes",
    selectionKey: "workflow.docs_only_checks",
    tags: ["workflow_guidance"],
    facets: {},
    updatedAt: "2026-04-12T00:00:00.000Z",
    confidence: 0.91,
    projectionTargets: ["tool-preferences"],
    ...overrides,
  };
}

describe("native memory projection active-slot bridge", () => {
  it("builds projection candidates from normalized active slots", () => {
    const candidate = buildNativeMemoryProjectionCandidateFromActiveSlot(
      createSlot({
        sourceMemoryKind: "user",
        category: "user_preference",
        promptText: "Prefer concise answers.",
        projectionTargets: ["user-profile"],
      }),
    );

    expect(candidate).toMatchObject({
      sourceId: "source-1",
      sourceKind: "user",
      target: "user-profile",
      text: "Prefer concise answers.",
    });
  });

  it("dedupes and prefers the stronger active-slot candidate", () => {
    const candidates = buildNativeMemoryProjectionCandidatesFromActiveSlots([
      createSlot({
        primarySourceId: "older",
        updatedAt: "2026-04-10T00:00:00.000Z",
        confidence: 0.8,
      }),
      createSlot({
        primarySourceId: "newer",
        updatedAt: "2026-04-11T00:00:00.000Z",
        confidence: 0.95,
      }),
      createSlot({
        primarySourceId: "project-1",
        sourceMemoryKind: "project",
        category: "project_rule",
        projectScoped: true,
        projectSlug: "maintenance",
        promptText: "Default branch is main.",
        searchText: "default branch main",
        selectionKey: "project.maintenance.default_branch",
        projectionTargets: ["memory-digest"],
      }),
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.sourceId).toBe("newer");
    expect(candidates[1]).toMatchObject({
      sourceId: "project-1",
      target: "memory-digest",
    });
  });
});
