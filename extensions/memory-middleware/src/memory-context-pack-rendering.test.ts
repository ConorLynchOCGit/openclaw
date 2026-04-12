import { describe, expect, it } from "vitest";
import type { ActiveMemorySlot } from "./active-memory-slots.js";
import {
  renderCompiledMemoryPack,
  renderCompiledMemoryPromptContext,
} from "./memory-context-pack-rendering.js";

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

describe("memory context pack rendering", () => {
  it("renders a compiled pack with deterministic hashes and omitted slots", () => {
    const pack = renderCompiledMemoryPack({
      kind: "user",
      title: "User Memory Pack",
      maxChars: 60,
      slots: [
        createSlot({
          slotKey: "slot-1",
          promptText: "Use concise answers.",
        }),
        createSlot({
          slotKey: "slot-2",
          semanticKey: "semantic-2",
          primarySourceId: "source-2",
          sourceIds: ["source-2"],
          promptText: "Use plain English instead of jargon.",
          selectionKey: "user.response.plain_english",
        }),
      ],
    });

    expect(pack).not.toBeNull();
    expect(pack?.text).toContain("## User Memory Pack");
    expect(pack?.text).toContain("Lower-priority active entries omitted");
    expect(pack?.slotKeys).toEqual(["slot-1"]);
    expect(pack?.omittedSlotKeys).toEqual(["slot-2"]);
    expect(pack?.hash).toMatch(/^[a-f0-9]{16}$/u);
  });

  it("renders the outer prompt context from compiled packs", () => {
    const pack = renderCompiledMemoryPack({
      kind: "project",
      title: "Project Memory Pack",
      maxChars: 200,
      slots: [
        createSlot({
          slotKey: "project-1",
          semanticKey: "project.default_branch",
          sourceMemoryKind: "project",
          category: "project_rule",
          projectScoped: true,
          projectSlug: "maintenance",
          promptText: "Default branch is main.",
          searchText: "default branch main",
          selectionKey: "project.maintenance.default_branch",
          projectionTargets: ["memory-digest"],
        }),
      ],
    });

    const context = renderCompiledMemoryPromptContext(pack ? [pack] : []);
    expect(context).not.toBeNull();
    expect(context?.text).toContain("## Approved Durable Memory Context");
    expect(context?.text).toContain("## Project Memory Pack");
    expect(context?.attachedSlotCount).toBe(1);
    expect(context?.omittedSlotCount).toBe(0);
  });
});
