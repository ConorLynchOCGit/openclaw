import { describe, expect, it } from "vitest";
import type { MemoryObjectRecord } from "./db/runtime.js";
import {
  buildNativeMemoryProjectionCandidate,
  buildNativeMemoryProjectionCandidates,
  isProjectionEligibleMemoryObject,
} from "./native-memory-projection-eligibility.js";

function createRecord(overrides: Partial<MemoryObjectRecord>): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Use concise responses.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    ...overrides,
  };
}

describe("native memory projection eligibility", () => {
  it("requires approved approved-memory-view records", () => {
    expect(
      isProjectionEligibleMemoryObject(
        createRecord({
          reviewState: "candidate",
        }),
      ),
    ).toBe(false);
    expect(
      isProjectionEligibleMemoryObject(
        createRecord({
          readSurface: "reviewable_candidates_view",
        }),
      ),
    ).toBe(false);
  });

  it("maps user memory into USER.md projections", () => {
    const candidate = buildNativeMemoryProjectionCandidate(
      createRecord({
        memoryKind: "user",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              subject: "Response style",
              statement: "Prefer concise answers",
              tags: ["user", "preference"],
            },
          },
        },
      }),
    );

    expect(candidate?.target).toBe("user-profile");
    expect(candidate?.text).toBe("Response style: Prefer concise answers");
  });

  it("routes project-scoped feedback into the memory digest instead of tool preferences", () => {
    const candidate = buildNativeMemoryProjectionCandidate(
      createRecord({
        memoryKind: "feedback",
        projectId: "project-1",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              subject: "Localization",
              statement: "Keep docs/zh-CN generated only",
              tags: ["project_rule", "feedback"],
            },
          },
        },
      }),
    );

    expect(candidate?.target).toBe("memory-digest");
  });

  it("keeps workflow feedback in tool preferences by default", () => {
    const candidate = buildNativeMemoryProjectionCandidate(
      createRecord({
        memoryKind: "feedback",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              statement: "Run pnpm check:fast before landing docs-only changes",
              tags: ["workflow_guidance", "feedback"],
            },
          },
        },
      }),
    );

    expect(candidate?.target).toBe("tool-preferences");
  });

  it("excludes reference memory from bootstrap projections", () => {
    expect(
      buildNativeMemoryProjectionCandidate(
        createRecord({
          memoryKind: "reference",
        }),
      ),
    ).toBeNull();
  });

  it("dedupes and orders projection candidates by target, priority, and recency", () => {
    const records = [
      createRecord({
        id: "a",
        memoryKind: "feedback",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              statement: "Run pnpm check:fast before landing docs-only changes",
              tags: ["workflow_guidance", "feedback"],
            },
          },
        },
      }),
      createRecord({
        id: "b",
        memoryKind: "feedback",
        updatedAt: "2026-04-10T04:00:00.000Z",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              statement: "Run pnpm check:fast before landing docs-only changes",
              tags: ["workflow_guidance", "feedback"],
            },
          },
        },
      }),
      createRecord({
        id: "c",
        memoryKind: "user",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              statement: "Prefer concise answers",
              tags: ["response_style", "preference"],
            },
          },
        },
      }),
    ];

    const candidates = buildNativeMemoryProjectionCandidates(records);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.target).toBe("user-profile");
    expect(candidates[1]?.sourceId).toBe("b");
  });
});
