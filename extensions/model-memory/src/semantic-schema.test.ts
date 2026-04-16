import { describe, expect, it } from "vitest";
import {
  FactMemoryObjectSchema,
  MemoryKindSchema,
  ModelMemoryObjectSchema,
  PreferenceMemoryObjectSchema,
} from "./semantic-schema.ts";

describe("semantic-schema", () => {
  it("exposes the fixed internal kinds", () => {
    expect(MemoryKindSchema.options).toEqual([
      "preference",
      "fact",
      "rule",
      "procedure",
      "reference",
    ]);
  });

  it("accepts a valid preference object", () => {
    const parsed = PreferenceMemoryObjectSchema.parse({
      canonicalClass: "user",
      kind: "preference",
      payload: {
        subject: "response style",
        instruction: "keep answers concise",
        operation: "prefer",
      },
      provenance: [{ sourceId: "source-001", segmentIndex: 0 }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(parsed.payload.subject).toBe("response style");
  });

  it("accepts a valid fact object", () => {
    const parsed = FactMemoryObjectSchema.parse({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-001",
      },
      provenance: [{ sourceId: "source-001", lineStart: 1, lineEnd: 1 }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(parsed.payload.value).toBe("region-001");
  });

  it("rejects a canonical class and kind mismatch", () => {
    const result = ModelMemoryObjectSchema.safeParse({
      canonicalClass: "user",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-001",
      },
      provenance: [{ sourceId: "source-001", segmentIndex: 0 }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(result.success).toBe(false);
  });
});
