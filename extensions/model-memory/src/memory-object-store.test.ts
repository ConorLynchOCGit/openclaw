import { describe, expect, it } from "vitest";
import { InMemoryMemoryObjectStore } from "./memory-object-store.ts";

function capturedFact(value: string, sourceWindowId: string) {
  return {
    sourceWindowId,
    contractName: "semantic_extraction",
    contractVersion: "v1",
    modelId: "model-turn-001",
    object: {
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject: "deployment region",
        value,
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: [{ sourceId: sourceWindowId, segmentIndex: 0, headingPath: [] }],
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "auto_accept" as const,
    },
  };
}

describe("memory-object-store", () => {
  it("dedupes exact normalized duplicates from the audited corpus", () => {
    const store = new InMemoryMemoryObjectStore();

    const first = store.writeCapturedObject(capturedFact("region-001", "window-001"));
    const duplicate = store.writeCapturedObject(capturedFact("region-001", "window-002"));
    const snapshot = store.snapshot();

    expect(first.decision).toBe("write");
    expect(duplicate.decision).toBe("dedupe");
    expect(snapshot.memoryObjects).toHaveLength(1);
    expect(snapshot.writeEvents).toHaveLength(2);
  });

  it("creates explicit supersession links for same-slot fact corrections", () => {
    const store = new InMemoryMemoryObjectStore();

    const original = store.writeCapturedObject(capturedFact("region-001", "window-001"));
    const correction = store.writeCapturedObject(capturedFact("region-002", "window-002"));
    const snapshot = store.snapshot();

    expect(original.decision).toBe("write");
    expect(correction.decision).toBe("supersede");
    expect(snapshot.memoryObjects).toHaveLength(2);
    expect(snapshot.supersessionLinks).toHaveLength(1);
    expect(snapshot.memoryObjects[0].supersededAt).toBeInstanceOf(Date);
    expect(snapshot.supersessionLinks[0].priorObjectId).toBe(snapshot.memoryObjects[0].id);
    expect(snapshot.supersessionLinks[0].replacementObjectId).toBe(snapshot.memoryObjects[1].id);
  });
});
