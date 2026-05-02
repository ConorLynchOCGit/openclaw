import { describe, expect, it } from "vitest";
import type {
  BoundedCandidateAdjudicationRequest,
  CollisionAdjudicationBatchDecision,
  CollisionAdjudicationDecision,
  SemanticCollisionAdjudicator,
} from "../semantic-collision-adjudication.ts";
import { deriveMemoryIdentity } from "../semantic-identity.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./database-memory-object-store.ts";
import {
  buildCollisionCandidates,
  buildZeroCandidateRecoverySelection,
} from "./database-memory-object-store.ts";
import { applyModelMemoryMigrations } from "./migrations.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";

function capturedFact(value: string, sourceWindowId: string, subject = "deployment region") {
  return {
    sourceWindowId,
    contractName: "semantic_extraction" as const,
    contractVersion: "v1",
    modelId: "model-turn-001",
    object: {
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject,
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

function capturedRule(input: {
  sourceWindowId: string;
  canonicalClass?: "user" | "project";
  subject: string;
  recommendedAction?: string;
  avoidAction?: string;
}) {
  return {
    sourceWindowId: input.sourceWindowId,
    contractName: "semantic_extraction" as const,
    contractVersion: "v1",
    modelId: "model-turn-001",
    object: {
      canonicalClass: input.canonicalClass ?? "project",
      kind: "rule" as const,
      payload: {
        subject: input.subject,
        ...(input.recommendedAction ? { recommendedAction: input.recommendedAction } : {}),
        ...(input.avoidAction ? { avoidAction: input.avoidAction } : {}),
      },
      provenance: [{ sourceId: input.sourceWindowId, segmentIndex: 0, headingPath: [] }],
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "auto_accept" as const,
    },
  };
}

function payloadSubject(value: { payload: unknown }): string | undefined {
  const payload = value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  return typeof (payload as { subject?: unknown }).subject === "string"
    ? (payload as { subject: string }).subject
    : undefined;
}

describe("canonical-repository", () => {
  it("retains decisive-field fact matches even when the subject drifts", () => {
    const object = capturedFact(
      "OpenClaw reads an optional JSON5 config from ~/.openclaw/openclaw.json and uses safe defaults if the file is missing.",
      "window-new",
      "OpenClaw config file location",
    ).object;
    const identity = deriveMemoryIdentity(object);

    const buildRecord = (input: { id: string; subject: string; value: string }) => ({
      id: input.id,
      sourceWindowId: `${input.id}-window`,
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject: input.subject,
        value: input.value,
      },
      normalizedSubject: input.subject.toLowerCase(),
      normalizedTitle: undefined,
      normalizedSearchText: `${input.subject} ${input.value}`.toLowerCase(),
      scope: {},
      scopeKey: identity.scopeKey,
      provenance: [{ sourceId: `${input.id}-window`, segmentIndex: 0, headingPath: [] }],
      confidence: "strong" as const,
      durability: "durable" as const,
      suggestedReviewMode: "auto_accept" as const,
      executedReviewMode: "auto_accept" as const,
      rationaleCodes: [],
      identityKey: `${input.id}-identity`,
      slotKey: input.subject.toLowerCase(),
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
      lifecycleState: "active" as const,
    });

    const collisions = buildCollisionCandidates(object, identity, [
      buildRecord({
        id: "memory-match",
        subject: "OpenClaw configuration file",
        value:
          "OpenClaw reads an optional JSON5 config from ~/.openclaw/openclaw.json and uses safe defaults if the file is missing.",
      }),
      buildRecord({
        id: "memory-noise",
        subject: "config RPC write limits",
        value:
          "Control-plane write RPCs are rate-limited to 3 requests per 60 seconds per deviceId+clientIp.",
      }),
    ]);

    expect(collisions.retainedRecords.map((record) => record.id)).toContain("memory-match");
    expect(collisions.retainedRecords[0]?.id).toBe("memory-match");
  });

  it("keeps same-source rule family siblings alive on action-bundle overlap without broadening global recall", () => {
    const object = capturedRule({
      sourceWindowId: "window-new",
      canonicalClass: "user",
      subject: "Docs links in final replies",
      recommendedAction: "Reply with full docs URLs in final reports and keep them explicit.",
      avoidAction: "Do not use root-relative docs links in final user replies.",
    }).object;
    const identity = deriveMemoryIdentity(object);

    const collisions = buildCollisionCandidates(
      object,
      identity,
      [
        {
          id: "memory-same-source",
          sourceWindowId: "window-same-source",
          canonicalClass: "user",
          kind: "rule",
          payload: {
            subject: "Final docs URL reporting",
            recommendedAction: "Reply with full docs URLs in final reports.",
            avoidAction:
              "Keep them explicit and do not use root-relative docs links in final user replies.",
          },
          normalizedSubject: "final docs url reporting",
          normalizedTitle: undefined,
          normalizedSearchText:
            "final docs url reporting reply with full docs urls in final reports keep them explicit and do not use root relative docs links in final user replies",
          scope: {},
          scopeKey: identity.scopeKey,
          provenance: [{ sourceId: "window-same-source", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "memory-same-source-identity",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
          lifecycleState: "active",
        },
        {
          id: "memory-other-source",
          sourceWindowId: "window-other-source",
          canonicalClass: "user",
          kind: "rule",
          payload: {
            subject: "Docs reading workflow",
            recommendedAction: "Read docs before planning work.",
            avoidAction: "Do not skip full-document reads for long docs.",
          },
          normalizedSubject: "docs reading workflow",
          normalizedTitle: undefined,
          normalizedSearchText:
            "docs reading workflow read docs before planning work do not skip full document reads for long docs",
          scope: {},
          scopeKey: identity.scopeKey,
          provenance: [{ sourceId: "window-other-source", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "memory-other-source-identity",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
          lifecycleState: "active",
        },
      ],
      {
        currentSourceFamilyKey: "document:AGENTS.md",
        candidateSourceFamilyKeys: new Map([
          ["memory-same-source", "document:AGENTS.md"],
          ["memory-other-source", "document:docs/help/testing.md"],
        ]),
      },
    );

    expect(collisions.retainedRecords.map((record) => record.id)).toContain("memory-same-source");
    expect(collisions.retainedRecords.map((record) => record.id)).not.toContain(
      "memory-other-source",
    );
  });

  it("keeps same-source wrapper-heavy rule siblings alive on moderate action-bundle overlap", () => {
    const object = capturedRule({
      sourceWindowId: "window-new",
      canonicalClass: "project",
      subject: "GitHub newline formatting",
      recommendedAction:
        "Use literal multiline strings or a single-quoted heredoc so GitHub comment bodies keep real newlines.",
      avoidAction: "Do not embed literal \\n strings in GitHub issue, PR, or comment bodies.",
    }).object;
    const identity = deriveMemoryIdentity(object);

    const collisions = buildCollisionCandidates(
      object,
      identity,
      [
        {
          id: "memory-same-source",
          sourceWindowId: "window-same-source",
          canonicalClass: "project",
          kind: "rule",
          payload: {
            subject: "GitHub comment body newline handling",
            recommendedAction:
              "For GitHub issue, PR, and comment bodies, keep real newlines by using literal multiline strings.",
            avoidAction:
              "Never embed literal \\n strings; prefer a single-quoted heredoc when shell quoting gets tricky.",
          },
          normalizedSubject: "github comment body newline handling",
          normalizedTitle: undefined,
          normalizedSearchText:
            "github comment body newline handling for github issue pr and comment bodies keep real newlines by using literal multiline strings never embed literal n strings prefer a single quoted heredoc when shell quoting gets tricky",
          scope: {},
          scopeKey: identity.scopeKey,
          provenance: [{ sourceId: "window-same-source", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          suggestedReviewMode: "auto_accept",
          executedReviewMode: "auto_accept",
          rationaleCodes: [],
          identityKey: "memory-same-source-identity",
          slotKey: undefined,
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "model-001",
          createdAt: new Date(0),
          lifecycleState: "active",
        },
      ],
      {
        currentSourceFamilyKey: "document:AGENTS.md",
        candidateSourceFamilyKeys: new Map([["memory-same-source", "document:AGENTS.md"]]),
      },
    );

    expect(collisions.retainedRecords.map((record) => record.id)).toContain("memory-same-source");
  });

  it("round-trips sources and source windows through the live schema", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);

      const source = await repository.persistSource({
        id: "2f7f4309-3b8e-5f1e-9a86-4b6aa7f54d62",
        sourceKind: "document",
        externalSourceId: "doc-001",
        sourceFingerprint: "fingerprint-doc-001",
        projectId: "project-001",
        sourceMetadata: { path: "docs/example.md" },
        createdAt: new Date(0),
      });
      const windows = await repository.persistSourceWindows([
        {
          id: "8f300d66-2cff-5b2d-8ccd-3f6c3c2ef816",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "project-001 uses region-001",
          normalizedFingerprint: "window-fingerprint-001",
          tokenEstimate: 4,
          headingPath: ["Project"],
          blockDescriptors: [{ id: "block-001", kind: "paragraph" }],
          lineStart: 1,
          lineEnd: 2,
          createdAt: new Date(0),
        },
      ]);

      const snapshot = await repository.snapshot();

      expect(source.sourceKind).toBe("document");
      expect(windows).toHaveLength(1);
      expect(snapshot.sources).toHaveLength(1);
      expect(snapshot.sourceWindows).toHaveLength(1);
      expect(snapshot.sourceWindows[0]?.normalizedText).toContain("project-001");
    } finally {
      await database.close();
    }
  });

  it("preserves deterministic support attachment and supersession semantics on the database path", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const store = new DatabaseMemoryObjectStore(repository);

      const source = await repository.persistSource({
        id: "e4d5cd36-8af8-5d0e-a3ff-284a26df9b4d",
        sourceKind: "ordinary_turn",
        sourceFingerprint: "turn-source-001",
        sessionId: "session-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows([
        {
          id: "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a8",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "turn one",
          normalizedFingerprint: "turn-window-001",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "cc4ebaf4-1ba0-560a-a0c8-d2b6aa6d1e17",
          sourceId: source.id,
          windowIndex: 1,
          normalizedText: "turn two",
          normalizedFingerprint: "turn-window-002",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "75663d32-6052-5a98-b8f0-347c6e94f851",
          sourceId: source.id,
          windowIndex: 2,
          normalizedText: "turn three",
          normalizedFingerprint: "turn-window-003",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
      ]);

      const first = await store.writeCapturedObject(
        capturedFact("region-001", "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a8"),
      );
      const duplicate = await store.writeCapturedObject(
        capturedFact("region-001", "cc4ebaf4-1ba0-560a-a0c8-d2b6aa6d1e17"),
      );
      const correction = await store.writeCapturedObject(
        capturedFact("region-002", "75663d32-6052-5a98-b8f0-347c6e94f851"),
      );
      const snapshot = await store.snapshot();

      expect(first.decision).toBe("write");
      expect(duplicate.decision).toBe("attach_support");
      expect(correction.decision).toBe("supersede");
      expect(snapshot.memoryObjects).toHaveLength(2);
      expect(snapshot.supportItems).toHaveLength(3);
      expect(snapshot.writeEvents).toHaveLength(3);
      expect(snapshot.supersessionLinks).toHaveLength(1);
      expect(snapshot.memoryObjects[0]?.supersededAt).toBeInstanceOf(Date);
    } finally {
      await database.close();
    }
  });

  it("uses near-now timestamps for stored memory writes by default", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const store = new DatabaseMemoryObjectStore(repository);

      const source = await repository.persistSource({
        id: "e4d5cd36-8af8-5d0e-a3ff-284a26df9b4e",
        sourceKind: "ordinary_turn",
        sourceFingerprint: "turn-source-002",
        sessionId: "session-002",
        sourceMetadata: {},
        createdAt: new Date(),
      });
      await repository.persistSourceWindows([
        {
          id: "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a9",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "turn now",
          normalizedFingerprint: "turn-window-004",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(),
        },
      ]);

      const before = Date.now();
      await store.writeCapturedObject(
        capturedFact("region-now", "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a9"),
      );
      const after = Date.now();
      const snapshot = await store.snapshot();
      const objectCreatedAt = snapshot.memoryObjects[0]?.createdAt?.getTime();
      const supportCreatedAt = snapshot.supportItems[0]?.createdAt?.getTime();
      const writeCreatedAt = snapshot.writeEvents[0]?.createdAt?.getTime();

      expect(objectCreatedAt).toBeDefined();
      expect(supportCreatedAt).toBeDefined();
      expect(writeCreatedAt).toBeDefined();
      expect(objectCreatedAt).toBeGreaterThanOrEqual(before - 1_000);
      expect(writeCreatedAt).toBeGreaterThanOrEqual(before - 1_000);
      expect(supportCreatedAt).toBeGreaterThanOrEqual(before - 1_000);
      expect(objectCreatedAt).toBeLessThanOrEqual(after + 1_000);
      expect(writeCreatedAt).toBeLessThanOrEqual(after + 1_000);
      expect(supportCreatedAt).toBeLessThanOrEqual(after + 1_000);
    } finally {
      await database.close();
    }
  });

  it("skips collision adjudication when deterministic gating prunes noisy candidates", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(): Promise<CollisionAdjudicationDecision> {
          throw new Error("single collision adjudication should not be called");
        },
        async adjudicateBatch(): Promise<CollisionAdjudicationBatchDecision[]> {
          throw new Error("batch collision adjudication should not be called");
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);
      const windowIds = [
        "11111111-1111-5111-8111-111111111111",
        "22222222-2222-5222-8222-222222222222",
      ];

      const source = await repository.persistSource({
        id: "fda6fc11-b1fc-5d15-9267-5dbbdfccb6ba",
        sourceKind: "document",
        externalSourceId: "agents-rules",
        sourceFingerprint: "agents-rules-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows(
        windowIds.map((id, index) => ({
          id,
          sourceId: source.id,
          windowIndex: index,
          normalizedText: id,
          normalizedFingerprint: `${id}-fingerprint`,
          tokenEstimate: 4,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        })),
      );

      const first = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: windowIds[0],
          canonicalClass: "user",
          subject: "Chat replies",
          recommendedAction: "Use repo-root relative file references only.",
        }),
      );
      const second = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: windowIds[1],
          canonicalClass: "user",
          subject: "GitHub issue/PR comment multiline bodies",
          recommendedAction: "Use literal multiline strings or a heredoc.",
        }),
      );
      const snapshot = await store.snapshot();

      expect(first.decision).toBe("write");
      expect(second.decision).toBe("write");
      expect(snapshot.memoryObjects).toHaveLength(2);
      expect(snapshot.supportItems).toHaveLength(2);
    } finally {
      await database.close();
    }
  });

  it("batches ambiguous residual adjudication once per write batch", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const batchRequests: BoundedCandidateAdjudicationRequest[][] = [];
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(): Promise<CollisionAdjudicationDecision> {
          throw new Error("single collision adjudication should not be called");
        },
        async adjudicateBatch(): Promise<CollisionAdjudicationBatchDecision[]> {
          throw new Error("legacy batch adjudication should not be called");
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          batchRequests.push(input.requests);
          const prototypeRequest = input.requests.find(
            (request) => payloadSubject(request.object) === "gh issue/pr comment -b usage",
          );
          const lazyRequest = input.requests.find(
            (request) => payloadSubject(request.object) === "Lazy loading boundary",
          );
          return [
            {
              candidateId: prototypeRequest!.candidateId,
              sameCoreMemory: "yes" as const,
              matchedCandidateId: prototypeRequest!.candidates[0].adjudicationCandidateId,
              deltaType: "non_additive" as const,
            },
            {
              candidateId: lazyRequest!.candidateId,
              sameCoreMemory: "yes" as const,
              matchedCandidateId: lazyRequest!.candidates[0].adjudicationCandidateId,
              deltaType: "non_additive" as const,
            },
          ];
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);
      const windowIds = [
        "33333333-3333-5333-8333-333333333333",
        "44444444-4444-5444-8444-444444444444",
        "55555555-5555-5555-8555-555555555555",
        "66666666-6666-5666-8666-666666666666",
        "77777777-7777-5777-8777-777777777779",
        "88888888-8888-5888-8888-888888888889",
      ];

      const source = await repository.persistSource({
        id: "d496b995-52f6-53df-8e3e-93e1f95f09a4",
        sourceKind: "document",
        externalSourceId: "agents-project-rules",
        sourceFingerprint: "agents-project-rules-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows(
        windowIds.map((id, index) => ({
          id,
          sourceId: source.id,
          windowIndex: index,
          normalizedText: id,
          normalizedFingerprint: `${id}-fingerprint`,
          tokenEstimate: 4,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        })),
      );

      const seedResults = await store.writeCapturedObjects([
        capturedRule({
          sourceWindowId: windowIds[0],
          canonicalClass: "user",
          subject: "GitHub issue/PR comment multiline bodies",
          recommendedAction: "Use literal multiline strings or a heredoc for real newlines.",
        }),
        capturedRule({
          sourceWindowId: windowIds[1],
          subject: "Lazy loading import strategy",
          avoidAction: "Do not mix await import and static import.",
        }),
        capturedRule({
          sourceWindowId: windowIds[4],
          canonicalClass: "user",
          subject: "GitHub comment body quoting",
          avoidAction:
            "Do not pass multiline or shell-sensitive text through gh issue/pr comment -b.",
        }),
        capturedRule({
          sourceWindowId: windowIds[5],
          subject: "Lazy loading runtime boundaries",
          recommendedAction: "Keep lazy imports behind a dedicated *.runtime.ts boundary.",
        }),
      ]);
      const residualResults = await store.writeCapturedObjects([
        capturedRule({
          sourceWindowId: windowIds[2],
          canonicalClass: "user",
          subject: "gh issue/pr comment -b usage",
          avoidAction:
            "Do not use gh issue/pr comment -b when the body contains shell-sensitive characters.",
        }),
        capturedRule({
          sourceWindowId: windowIds[3],
          subject: "Lazy loading boundary",
          recommendedAction: "Create a dedicated *.runtime.ts boundary.",
        }),
      ]);
      const snapshot = await store.snapshot();

      expect(seedResults.map((result) => result.decision)).toEqual([
        "write",
        "write",
        "write",
        "write",
      ]);
      expect(batchRequests).toHaveLength(1);
      expect(batchRequests[0]).toHaveLength(2);
      expect(residualResults.map((result) => result.decision)).toEqual([
        "attach_support",
        "attach_support",
      ]);
      expect(snapshot.memoryObjects).toHaveLength(4);
      expect(snapshot.supportItems).toHaveLength(6);
    } finally {
      await database.close();
    }
  });

  it("uses bounded model adjudication for a single retained near-restatement", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      let batchCalls = 0;
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(): Promise<CollisionAdjudicationDecision> {
          throw new Error("single collision adjudication should not be called");
        },
        async adjudicateBatch(): Promise<CollisionAdjudicationBatchDecision[]> {
          throw new Error("batch collision adjudication should not be called");
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          batchCalls += 1;
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "yes" as const,
            matchedCandidateId: request.candidates[0].adjudicationCandidateId,
            deltaType: "non_additive" as const,
          }));
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);
      const windowIds = [
        "77777777-7777-5777-8777-777777777777",
        "88888888-8888-5888-8888-888888888888",
      ];

      const source = await repository.persistSource({
        id: "07d32090-443e-5eec-8c52-bd09758e323f",
        sourceKind: "document",
        externalSourceId: "landing-rules",
        sourceFingerprint: "landing-rules-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows(
        windowIds.map((id, index) => ({
          id,
          sourceId: source.id,
          windowIndex: index,
          normalizedText: id,
          normalizedFingerprint: `${id}-fingerprint`,
          tokenEstimate: 4,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        })),
      );

      const first = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: windowIds[0],
          canonicalClass: "project",
          subject: "Landing gate verification",
          recommendedAction: "Run pnpm build pnpm check and pnpm test before pushing to main.",
        }),
      );
      const second = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: windowIds[1],
          canonicalClass: "project",
          subject: "Landing verification",
          recommendedAction: "Run pnpm build pnpm check and pnpm test before pushing to main.",
        }),
      );
      const snapshot = await store.snapshot();

      expect(first.decision).toBe("write");
      expect(second.decision).toBe("attach_support");
      expect(batchCalls).toBe(1);
      expect(snapshot.memoryObjects).toHaveLength(1);
      expect(snapshot.supportItems).toHaveLength(2);
    } finally {
      await database.close();
    }
  });

  it("uses bounded model adjudication for a dominant retained candidate", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      let batchCalls = 0;
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(): Promise<CollisionAdjudicationDecision> {
          throw new Error("single collision adjudication should not be called");
        },
        async adjudicateBatch(): Promise<CollisionAdjudicationBatchDecision[]> {
          throw new Error("batch collision adjudication should not be called");
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          batchCalls += 1;
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "yes" as const,
            matchedCandidateId: request.candidates[0].adjudicationCandidateId,
            deltaType: "non_additive" as const,
          }));
        },
      };
      const seedAdjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(): Promise<CollisionAdjudicationDecision> {
          throw new Error("single collision adjudication should not be called");
        },
        async adjudicateBatch(): Promise<CollisionAdjudicationBatchDecision[]> {
          throw new Error("batch collision adjudication should not be called");
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "no" as const,
            matchedCandidateId: "none" as const,
            deltaType: "unclear" as const,
          }));
        },
      };
      const seedStore = new DatabaseMemoryObjectStore(repository, seedAdjudicator);
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);
      const windowIds = [
        "99999999-9999-5999-8999-999999999991",
        "99999999-9999-5999-8999-999999999992",
        "99999999-9999-5999-8999-999999999993",
      ];

      const source = await repository.persistSource({
        id: "892cb9c4-9379-521d-bb59-1fe4ef5be4d4",
        sourceKind: "document",
        externalSourceId: "gateway-restart-rules",
        sourceFingerprint: "gateway-restart-rules-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows(
        windowIds.map((id, index) => ({
          id,
          sourceId: source.id,
          windowIndex: index,
          normalizedText: id,
          normalizedFingerprint: `${id}-fingerprint`,
          tokenEstimate: 4,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        })),
      );

      const broad = await seedStore.writeCapturedObject(
        capturedFact(
          "Both config.apply and config.patch accept baseHash plus optional sessionKey, note, and restartDelayMs. Restart requests are coalesced while one is already pending/in-flight, and a 30-second cooldown applies between restart cycles.",
          windowIds[0],
          "config.apply and config.patch parameters and restart behavior",
        ),
      );
      const narrow = await seedStore.writeCapturedObject(
        capturedFact(
          "Restart requests are coalesced while one is already pending/in-flight, and a 30-second cooldown applies between restart cycles.",
          windowIds[1],
          "Restart request handling",
        ),
      );
      const rerun = await store.writeCapturedObject(
        capturedFact(
          "Restart requests are coalesced while one is already pending/in-flight, and a 30-second cooldown applies between restart cycles.",
          windowIds[2],
          "config.apply/config.patch restart requests",
        ),
      );
      const snapshot = await store.snapshot();

      expect(broad.decision).toBe("write");
      expect(narrow.decision).toBe("write");
      expect(rerun.decision).toBe("attach_support");
      expect(batchCalls).toBe(1);
      expect(snapshot.memoryObjects).toHaveLength(2);
      expect(snapshot.supportItems).toHaveLength(3);
    } finally {
      await database.close();
    }
  });

  it("builds a bounded raw-text recovery neighborhood for strong same-claim abbreviations", () => {
    const first = capturedRule({
      sourceWindowId: "window-001",
      subject: "GitHub pull request ID lookup",
      recommendedAction: "Use GitHub API for pull request identifiers when you need exact PR ids.",
      avoidAction: "Do not rely on PR view output when exact identifiers are required.",
    }).object;
    const second = capturedRule({
      sourceWindowId: "window-002",
      subject: "GH PR id lookup",
      recommendedAction: "Use gh api for pr ids when you need exact identifiers.",
      avoidAction: "Do not rely on pr view output when exact ids are required.",
    }).object;
    const firstIdentity = deriveMemoryIdentity(first);
    const secondIdentity = deriveMemoryIdentity(second);
    const record = {
      id: "memory-1",
      sourceWindowId: undefined,
      canonicalClass: "project",
      kind: "rule",
      payload: first.payload,
      normalizedSubject: firstIdentity.normalizedSubject,
      normalizedTitle: undefined,
      normalizedSearchText: firstIdentity.normalizedSearchText,
      scope: {},
      scopeKey: firstIdentity.scopeKey,
      provenance: first.provenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      suggestedReviewMode: "auto_accept" as const,
      executedReviewMode: "auto_accept" as const,
      rationaleCodes: [],
      identityKey: firstIdentity.identityKey,
      slotKey: undefined,
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
      lifecycleState: "active" as const,
    };

    const selection = buildZeroCandidateRecoverySelection({
      object: second,
      identity: secondIdentity,
      memoryObjects: [record],
    });

    expect(selection.rawSearchResults).toHaveLength(1);
    expect(selection.selectedResults).toHaveLength(1);
    expect(selection.selectedResults[0]?.record.id).toBe("memory-1");
  });

  it("admits fallback candidates despite canonicalClass drift when raw-text similarity is strong", () => {
    const first = capturedRule({
      sourceWindowId: "window-a",
      canonicalClass: "project",
      subject: "repo root paths only",
      recommendedAction: "Use repo-root relative paths in chat replies.",
      avoidAction: "Do not use absolute paths.",
    }).object;
    const second = capturedRule({
      sourceWindowId: "window-b",
      canonicalClass: "user",
      subject: "repo root paths only",
      recommendedAction: "Use repo-root relative paths in chat replies.",
      avoidAction: "Do not use absolute paths.",
    }).object;
    const secondIdentity = deriveMemoryIdentity(second);
    const record = {
      id: "memory-class-drift",
      sourceWindowId: undefined,
      canonicalClass: "project" as const,
      kind: "rule" as const,
      payload: first.payload,
      normalizedSubject: secondIdentity.normalizedSubject,
      normalizedTitle: undefined,
      normalizedSearchText: secondIdentity.normalizedSearchText,
      scope: {},
      scopeKey: secondIdentity.scopeKey,
      provenance: first.provenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      suggestedReviewMode: "auto_accept" as const,
      executedReviewMode: "auto_accept" as const,
      rationaleCodes: [],
      identityKey: "identity-class-drift",
      slotKey: undefined,
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
      lifecycleState: "active" as const,
    };

    const selection = buildZeroCandidateRecoverySelection({
      object: second,
      identity: secondIdentity,
      memoryObjects: [record],
    });

    expect(selection.selectedResults).toHaveLength(1);
    expect(selection.selectedResults[0]?.sameCanonicalClass).toBe(false);
  });

  it("admits fallback candidates despite kind drift when raw-text similarity is strong", () => {
    const second = capturedRule({
      sourceWindowId: "window-b",
      canonicalClass: "project",
      subject: "repo root paths only",
      recommendedAction: "Use repo-root relative paths in chat replies.",
      avoidAction: "Do not use absolute paths.",
    }).object;
    const secondIdentity = deriveMemoryIdentity(second);
    const record = {
      id: "memory-kind-drift",
      sourceWindowId: undefined,
      canonicalClass: "project" as const,
      kind: "preference" as const,
      payload: {
        subject: "repo root paths only",
        instruction: "Use repo-root relative paths in chat replies.",
        operation: "chat replies",
      },
      normalizedSubject: secondIdentity.normalizedSubject,
      normalizedTitle: undefined,
      normalizedSearchText: secondIdentity.normalizedSearchText,
      scope: {},
      scopeKey: secondIdentity.scopeKey,
      provenance: second.provenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      suggestedReviewMode: "auto_accept" as const,
      executedReviewMode: "auto_accept" as const,
      rationaleCodes: [],
      identityKey: "identity-kind-drift",
      slotKey: undefined,
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
      lifecycleState: "active" as const,
    };

    const selection = buildZeroCandidateRecoverySelection({
      object: second,
      identity: secondIdentity,
      memoryObjects: [record],
    });

    expect(selection.selectedResults).toHaveLength(1);
    expect(selection.selectedResults[0]?.sameKind).toBe(false);
  });

  it("admits fallback candidates despite scope drift when raw-text similarity is strong", () => {
    const second = capturedRule({
      sourceWindowId: "window-b",
      canonicalClass: "project",
      subject: "repo root paths only",
      recommendedAction: "Use repo-root relative paths in chat replies.",
      avoidAction: "Do not use absolute paths.",
    }).object;
    const secondIdentity = deriveMemoryIdentity(second);
    const record = {
      id: "memory-scope-drift",
      sourceWindowId: undefined,
      canonicalClass: "project" as const,
      kind: "rule" as const,
      payload: second.payload,
      normalizedSubject: secondIdentity.normalizedSubject,
      normalizedTitle: undefined,
      normalizedSearchText: secondIdentity.normalizedSearchText,
      scope: {},
      scopeKey: "scope-different",
      provenance: second.provenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      suggestedReviewMode: "auto_accept" as const,
      executedReviewMode: "auto_accept" as const,
      rationaleCodes: [],
      identityKey: "identity-scope-drift",
      slotKey: undefined,
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-001",
      createdAt: new Date(0),
      lifecycleState: "active" as const,
    };

    const selection = buildZeroCandidateRecoverySelection({
      object: second,
      identity: secondIdentity,
      memoryObjects: [record],
    });

    expect(selection.selectedResults).toHaveLength(1);
    expect(selection.selectedResults[0]?.sameScope).toBe(false);
  });

  it("keeps zero-candidate distinct controls separate when recovery says no", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(_input): Promise<CollisionAdjudicationDecision> {
          return { relation: "conflict_hold" };
        },
        async adjudicateBatch(_input): Promise<CollisionAdjudicationBatchDecision[]> {
          return [];
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "no" as const,
            matchedCandidateId: "none" as const,
            deltaType: "unclear" as const,
          }));
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);

      const source = await repository.persistSource({
        id: "e5a77314-c911-58b7-ab5b-23796db06ca5",
        sourceKind: "document",
        externalSourceId: "docs/help/testing.md",
        sourceFingerprint: "docs-help-testing",
        sourceMetadata: { relativePath: "docs/help/testing.md" },
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows([
        {
          id: "cbefa2ff-5349-5b6d-ac8f-66f6ac40f163",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "vitest suites",
          normalizedFingerprint: "window-a",
          tokenEstimate: 3,
          headingPath: ["Testing"],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "db010384-3bd0-58f2-8565-2d6959e2f2b6",
          sourceId: source.id,
          windowIndex: 1,
          normalizedText: "docker test commands",
          normalizedFingerprint: "window-b",
          tokenEstimate: 3,
          headingPath: ["Testing"],
          blockDescriptors: [],
          createdAt: new Date(1_000),
        },
      ]);

      await store.writeCapturedObject(
        capturedFact(
          "OpenClaw has three Vitest suites.",
          "cbefa2ff-5349-5b6d-ac8f-66f6ac40f163",
          "OpenClaw test suites",
        ),
      );
      const second = await store.writeCapturedObject(
        capturedFact(
          "OpenClaw uses Docker-backed smoke runners for gateway E2E.",
          "db010384-3bd0-58f2-8565-2d6959e2f2b6",
          "Gateway smoke runners",
        ),
      );
      const snapshot = await repository.snapshot();

      expect(second.decision).toBe("write");
      expect(snapshot.memoryObjects).toHaveLength(2);
    } finally {
      await database.close();
    }
  });

  it("uses bounded adjudication for unresolved retained candidates", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(_input): Promise<CollisionAdjudicationDecision> {
          return { relation: "conflict_hold" };
        },
        async adjudicateBatch(_input): Promise<CollisionAdjudicationBatchDecision[]> {
          return [];
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "yes" as const,
            matchedCandidateId: request.candidates[0].adjudicationCandidateId,
            deltaType: "non_additive" as const,
          }));
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);

      const source = await repository.persistSource({
        id: "2615ef22-67c1-5cd8-a75f-8d4bc8046708",
        sourceKind: "document",
        externalSourceId: "AGENTS.md",
        sourceFingerprint: "agents-md",
        sourceMetadata: { relativePath: "AGENTS.md" },
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows([
        {
          id: "5a6567f2-f75f-5dcb-8765-182a592f775f",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "use scripts committer for scoped commits",
          normalizedFingerprint: "window-a",
          tokenEstimate: 6,
          headingPath: ["Git"],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "d1ad4f87-2db0-52d2-b3f0-9aa925afabda",
          sourceId: source.id,
          windowIndex: 1,
          normalizedText: "do not commit manually use scripts committer",
          normalizedFingerprint: "window-b",
          tokenEstimate: 7,
          headingPath: ["Git"],
          blockDescriptors: [],
          createdAt: new Date(1_000),
        },
      ]);

      await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: "5a6567f2-f75f-5dcb-8765-182a592f775f",
          subject: "scoped commits",
          recommendedAction: "Use scripts/committer for scoped commits.",
        }),
      );
      const second = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: "d1ad4f87-2db0-52d2-b3f0-9aa925afabda",
          subject: "manual git commits",
          avoidAction: "Do not commit manually; use scripts/committer for scoped commits.",
        }),
      );
      const snapshot = await repository.snapshot();

      expect(second.decision).toBe("attach_support");
      expect(snapshot.memoryObjects).toHaveLength(1);
      expect(snapshot.supportItems).toHaveLength(2);
    } finally {
      await database.close();
    }
  });

  it("attaches structurally drifted fallback yes-matches when the model says same core memory", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      let seenFallbackRequest: BoundedCandidateAdjudicationRequest | undefined;
      const adjudicator: SemanticCollisionAdjudicator = {
        async adjudicate(_input): Promise<CollisionAdjudicationDecision> {
          return { relation: "conflict_hold" };
        },
        async adjudicateBatch(_input): Promise<CollisionAdjudicationBatchDecision[]> {
          return [];
        },
        async adjudicateBoundedCandidateBatch(input: {
          requests: BoundedCandidateAdjudicationRequest[];
          modelId: string;
          contractVersion?: string;
        }) {
          seenFallbackRequest = input.requests[0];
          return input.requests.map((request) => ({
            candidateId: request.candidateId,
            sameCoreMemory: "yes" as const,
            matchedCandidateId: request.candidates[0].adjudicationCandidateId,
            deltaType: "non_additive" as const,
          }));
        },
      };
      const store = new DatabaseMemoryObjectStore(repository, adjudicator);

      const source = await repository.persistSource({
        id: "c70da1c5-872b-5d89-98cb-6f456d99cd7c",
        sourceKind: "document",
        externalSourceId: "AGENTS.md",
        sourceFingerprint: "agents-md-fallback-drift",
        sourceMetadata: { relativePath: "AGENTS.md" },
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows([
        {
          id: "5c991053-d12c-5fa9-bc41-e18ff75e4ca8",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "repo root paths only",
          normalizedFingerprint: "window-a",
          tokenEstimate: 4,
          headingPath: ["Repository Guidelines"],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "df3e1a31-5a34-52ea-b91a-c4228a4b0ca9",
          sourceId: source.id,
          windowIndex: 1,
          normalizedText: "repo root paths only",
          normalizedFingerprint: "window-b",
          tokenEstimate: 4,
          headingPath: ["Repository Guidelines"],
          blockDescriptors: [],
          createdAt: new Date(1_000),
        },
      ]);

      await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: "5c991053-d12c-5fa9-bc41-e18ff75e4ca8",
          canonicalClass: "project",
          subject: "repo root paths only",
          recommendedAction: "Use repo-root relative paths in chat replies.",
          avoidAction: "Do not use absolute paths.",
        }),
      );
      const second = await store.writeCapturedObject(
        capturedRule({
          sourceWindowId: "df3e1a31-5a34-52ea-b91a-c4228a4b0ca9",
          canonicalClass: "user",
          subject: "repo root paths only",
          recommendedAction: "Use repo-root relative paths in chat replies.",
          avoidAction: "Do not use absolute paths.",
        }),
      );
      const snapshot = await repository.snapshot();

      expect(seenFallbackRequest?.candidates).toHaveLength(1);
      expect(seenFallbackRequest?.candidates[0]?.sameCanonicalClass).toBe(false);
      expect(second.decision).toBe("attach_support");
      expect(second.supportItem?.memoryObjectId).toBeDefined();
      expect(snapshot.memoryObjects).toHaveLength(1);
    } finally {
      await database.close();
    }
  });
});
