import { describe, expect, it } from "vitest";
import { InMemoryRetrievalStore } from "./retrieval-store.ts";
import { executeRetrieval } from "./retrieval.ts";

describe("retrieval", () => {
  it("selects and orders current canonical objects deterministically", async () => {
    const store = new InMemoryRetrievalStore();
    const result = await executeRetrieval({
      envelope: {
        queryText: "Find deployment information for project-001",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        sessionId: "session-001",
        maxResults: 2,
      },
      modelId: "retrieval-model-001",
      interpreter: {
        async interpret() {
          return {
            action: "retrieve",
            request: {
              goal: "project facts for active scope",
              canonicalClasses: ["project"],
              kinds: ["fact"],
              scopeConstraints: { projectId: "project-001" },
              subjectHints: ["deployment region"],
              contentHints: ["region-001"],
              desiredResultCount: 2,
              requestConfidence: "strong",
            },
          };
        },
      },
      memoryObjects: [
        {
          id: "memory-001",
          sourceWindowId: "window-001",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment region", value: "region-001" },
          normalizedSubject: "deployment region",
          normalizedTitle: undefined,
          normalizedSearchText: "deployment region region-001",
          scope: { projectId: "project-001", projectScope: "project-001" },
          scopeKey: "scope-project-001",
          provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "fact-001",
          slotKey: "slot-001",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
        },
        {
          id: "memory-002",
          sourceWindowId: "window-001",
          canonicalClass: "feedback",
          kind: "procedure",
          payload: { title: "procedure-001", steps: ["run check-001"] },
          normalizedSubject: undefined,
          normalizedTitle: "procedure-001",
          normalizedSearchText: "procedure-001 run check-001",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "procedure-001",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
        },
      ],
      store,
      createdAt: new Date(0),
    });

    expect(result).toBeDefined();
    expect(result?.retrievalResultItems).toHaveLength(1);
    expect(result?.retrievalResultItems[0]?.memoryObjectId).toBe("memory-001");
    expect(result?.retrievalResultItems[0]?.retrievalReasonCodes).toContain("scope_exact_match");
    expect(result?.retrievalResultItems[0]?.retrievalReasonCodes).toContain("subject_match");
    expect(store.snapshot().retrievalRequests).toHaveLength(1);
    expect(store.snapshot().retrievalRequests[0]?.queryText).toMatch(/^sha256:/);
    expect(store.snapshot().retrievalRequests[0]?.queryText).not.toContain(
      "Find deployment information",
    );
    expect(store.snapshot().retrievalRequests[0]?.scope.rawQueryPersisted).toBe(false);
  });

  it("keeps broad workflow queries from collapsing to a single over-constrained result", async () => {
    const store = new InMemoryRetrievalStore();
    const result = await executeRetrieval({
      envelope: {
        queryText: "What should I read before planning or roadmap work?",
        requestPurpose: "workflow_guidance",
        sessionId: "session-002",
        maxResults: 5,
      },
      modelId: "retrieval-model-001",
      interpreter: {
        async interpret() {
          return {
            action: "retrieve",
            request: {
              goal: "Identify recommended reading before roadmap work.",
              canonicalClasses: ["reference", "project"],
              kinds: ["reference", "procedure", "rule"],
              scopeConstraints: {},
              subjectHints: ["planning", "roadmap", "strategy"],
              contentHints: ["reading list", "frameworks", "guides"],
              desiredResultCount: 1,
              requestConfidence: "medium",
            },
          };
        },
      },
      memoryObjects: [
        {
          id: "memory-010",
          sourceWindowId: "window-010",
          canonicalClass: "user",
          kind: "rule",
          payload: {
            subject: "Planning prerequisites",
            recommendedAction: "Read roadmap and planning docs before roadmap work.",
          },
          normalizedSubject: "planning prerequisites",
          normalizedTitle: undefined,
          normalizedSearchText:
            "planning prerequisites read roadmap and planning docs before roadmap work",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-010", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "rule-010",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-010",
          createdAt: new Date(0),
        },
        {
          id: "memory-011",
          sourceWindowId: "window-011",
          canonicalClass: "reference",
          kind: "reference",
          payload: {
            task: "Read planning guidance",
            primaryResource: "docs/projects/model-memory/roadmap.md",
          },
          normalizedSubject: undefined,
          normalizedTitle: undefined,
          normalizedSearchText:
            "read planning guidance docs/projects/model-memory/roadmap.md roadmap planning",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-011", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "reference-011",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-011",
          createdAt: new Date(0),
        },
      ],
      store,
      createdAt: new Date(0),
    });

    expect(result).toBeDefined();
    expect(result?.interpretedRequest.canonicalClasses).toEqual([]);
    expect(result?.interpretedRequest.kinds).toBeUndefined();
    expect(result?.interpretedRequest.desiredResultCount).toBe(5);
    expect(result?.retrievalResultItems).toHaveLength(2);
  });

  it("emits baseline live-context retrieval and ranks source-lineage marker matches over unrelated broad memories when interpreter skips", async () => {
    const store = new InMemoryRetrievalStore();
    const result = await executeRetrieval({
      envelope: {
        queryText:
          "SOAKQUAR-2026-04-21-RECALL: Based on durable memory evidence, what is my durable preference for validation reports and the current project fact?",
        requestPurpose: "live_context_injection",
        sessionId: "session-recall",
        maxResults: 5,
      },
      modelId: "retrieval-model-001",
      interpreter: {
        async interpret() {
          return { action: "skip" };
        },
      },
      memoryObjects: [
        {
          id: "memory-old-directive",
          sourceWindowId: "window-old-directive",
          canonicalClass: "user",
          kind: "rule",
          payload: {
            subject: "validation reports",
            recommendedAction: "include skipped validations",
          },
          normalizedSubject: "validation reports",
          normalizedTitle: undefined,
          normalizedSearchText: "validation reports include skipped validations",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-old-directive", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "directive-old-validation-reports",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-old-directive",
          createdAt: new Date(0),
        },
        {
          id: "memory-pref",
          sourceWindowId: "window-pref",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", value: "concise outcome first" },
          normalizedSubject: "validation reports",
          normalizedTitle: undefined,
          normalizedSearchText:
            "validation reports durable preference concise outcome first detailed evidence exact artifact paths",
          sourceEvidenceSearchText:
            "SOAKQUAR-2026-04-21-PREF For future validation reports in this workspace, I prefer concise status first.",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-pref", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "pref-validation-reports",
          slotKey: "slot-pref-validation-reports",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-pref",
          createdAt: new Date(0),
        },
        {
          id: "memory-project-fact",
          sourceWindowId: "window-project-fact",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "model-memory soak", value: "validates retrieval telemetry" },
          normalizedSubject: "model-memory soak",
          normalizedTitle: undefined,
          normalizedSearchText:
            "current project fact model-memory soak validates direct mmv2 retrieval telemetry memory pack injection no-dark-data checks",
          sourceEvidenceSearchText:
            "SOAKQUAR-2026-04-21-PROJECTFACT Durable workspace project fact: the current model-memory semantic-quarantine soak validates structural correction targets.",
          scope: {},
          scopeKey: "scope-global",
          provenance: [{ sourceId: "window-project-fact", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "fact-model-memory-soak",
          slotKey: "slot-fact-model-memory-soak",
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-project-fact",
          createdAt: new Date(0),
        },
      ],
      store,
      createdAt: new Date(0),
    });

    expect(result).toBeDefined();
    expect(result?.interpretedRequest.canonicalClasses).toEqual([]);
    expect(result?.interpretedRequest.kinds).toBeUndefined();
    const selectedIds = result?.retrievalResultItems.map((item) => item.memoryObjectId) ?? [];
    expect(selectedIds.slice(0, 2)).toEqual(
      expect.arrayContaining(["memory-project-fact", "memory-pref"]),
    );
    expect(selectedIds.indexOf("memory-old-directive")).toBeGreaterThan(1);
    expect(result?.retrievalResultItems[0]?.retrievalReasonCodes).toContain("source_lineage_match");
    expect(store.snapshot().retrievalRequests).toHaveLength(1);
    expect(store.snapshot().retrievalRequests[0]?.queryText).toMatch(/^sha256:/);
    expect(store.snapshot().retrievalRequests[0]?.queryText).not.toContain("SOAKQUAR");
  });
});
