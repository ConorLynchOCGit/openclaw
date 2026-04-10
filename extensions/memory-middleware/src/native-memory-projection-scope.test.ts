import { describe, expect, it } from "vitest";
import type { MemoryObjectRecord } from "./db/runtime.js";
import {
  isAgentProjectionScope,
  isProjectProjectionScope,
  isSharedProjectionScope,
  resolveNativeMemoryProjectionScope,
} from "./native-memory-projection-scope.js";

function createRecord(overrides: Partial<MemoryObjectRecord> = {}): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: "approved_memory_view",
    id: "memory-1",
    memoryKind: "feedback",
    reviewState: "approved",
    content: "Keep responses concise.",
    updatedAt: "2026-04-10T03:00:00.000Z",
    createdAt: "2026-04-10T03:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("native memory projection scope", () => {
  it("treats main-agent feedback as shared projection scope", () => {
    const scope = resolveNativeMemoryProjectionScope(
      createRecord({
        metadata: {
          candidateMetadata: {
            autoCapture: {
              agentExternalKey: "main",
            },
          },
        },
      }),
    );

    expect(isSharedProjectionScope(scope)).toBe(true);
  });

  it("treats project-scoped records without specialized agent routing as project scope", () => {
    const scope = resolveNativeMemoryProjectionScope(
      createRecord({
        memoryKind: "project",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              facets: {
                projectScope: "maintenance",
              },
            },
          },
        },
      }),
    );

    expect(isProjectProjectionScope(scope)).toBe(true);
    expect(scope.projectScoped).toBe(true);
  });

  it("treats specialized agent records as agent scope even when they also carry project scope", () => {
    const scope = resolveNativeMemoryProjectionScope(
      createRecord({
        memoryKind: "project",
        metadata: {
          candidateMetadata: {
            autoCapture: {
              agentExternalKey: "x-manager",
              projectScope: "maintenance",
            },
          },
        },
      }),
    );

    expect(isAgentProjectionScope(scope)).toBe(true);
    expect(scope.agentKey).toBe("x-manager");
    expect(scope.projectScoped).toBe(true);
  });

  it("treats explicit session continuity records as session scope", () => {
    const scope = resolveNativeMemoryProjectionScope(
      createRecord({
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              tags: ["session_continuity"],
            },
          },
          candidateMetadata: {
            autoCapture: {
              sessionKey: "agent:web-researcher:proof",
            },
          },
        },
      }),
    );

    expect(scope.kind).toBe("session");
    expect(scope.sessionKey).toBe("agent:web-researcher:proof");
  });
});
