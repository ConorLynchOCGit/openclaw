import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  appendNodeResourceDemandFulfillmentToLedger,
  appendNodeResourceLedgerEntry,
  closeNodeResourceLedger,
  compileNodeResourceLedgerToolOutput,
  NODE_RESOURCE_LEDGER_DEFAULT_PROJECTED_ENTRY_MANIFESTS,
  persistNodeResourceLedgerPayloadArtifacts,
  openNodeResourceLedger,
  projectNodeResourceLedger,
} from "./node-resource-ledger.ts";
import {
  openNodeResourceDemandSession,
  requestNodeResourceDemand,
} from "./node-resource-demand-session.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      maxArtifactSizeBytes: 2 * 1024 * 1024,
      maxArtifactMetadataBytes: 32 * 1024,
    });
    return await work(repository);
  } finally {
    await database.close();
  }
}

function openValidLedger() {
  const opened = openNodeResourceLedger({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    nodeExecutionPacketRef: "packet://impl-1",
    nodeResourceDemandSessionRef: "node-resource-demand://impl-1",
    capabilityId: "implementation_complex",
    evidenceMode: ["changed_file_evidence"],
    targetCommitmentIds: ["C-1"],
    authorityScope: ["src/product-spec.ts", "tests/product-spec.test.ts"],
  });
  expect(opened.ledger).not.toBeNull();
  return opened.ledger!;
}

function acceptedFocus() {
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    refs: [
      {
        ref: "src/product-spec.ts#L1-L120",
        kind: "bounded_file_window",
        boundedLabel: "Product spec source file window.",
        authorityScopeRefs: ["src/product-spec.ts"],
      },
    ],
  });
  return {
    legalRefUniverse,
    resourceObjectiveFocus: compileResourceObjectiveFocus({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      currentObjectiveSlot: "node-resource-ledger-test",
      resourceUseKind: "resource_grounding",
      nextUnknown: "Which source window should be opened for the implementation node?",
      expectedUse: "Use the selected window as local edit context.",
      legalRefUniverse,
      selectedRefHandles: [legalRefUniverse.handles[0].handle],
      selectedSemanticQuestions: ["What in this file matters for the implementation node?"],
      nextLegalTransitions: ["resource.demand.open"],
    }),
  };
}

describe("NodeResourceLedger", () => {
  it("blocks opening without canonical owner, capability, evidence, and authority fields", () => {
    const result = openNodeResourceLedger({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
    });

    expect(result.status).toBe("needs_review");
    expect(result.ledger).toBeNull();
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_resource_ledger_consumerNodeId_missing",
        "node_resource_ledger_capabilityId_missing",
        "node_resource_ledger_evidenceMode_missing",
        "node_resource_ledger_authorityScope_missing",
      ]),
    );
    expect(JSON.stringify(result.metadata)).not.toContain("NodeResourceLedger");
  });

  it("opens a payload-backed ledger and returns only compact manifest metadata", () => {
    const ledger = openValidLedger();

    expect(ledger).toMatchObject({
      artifactKind: "node_resource_ledger",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      nodeResourceDemandSessionRef: "node-resource-demand://impl-1",
      semanticJudgmentOwner: "model_or_human",
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(ledger.ledgerPayloadRef).toMatchObject({
      artifactType: "execution_platform.node_resource_ledger",
      hydrateToolId: "artifact.payload.get_json",
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("appends model-authored context substance while metadata remains manifest-only", () => {
    const ledger = openValidLedger();
    const result = appendNodeResourceLedgerEntry({
      ledger,
      entryKind: "file_window_opened",
      contentRefs: ["src/product-spec.ts#L10-L80"],
      fileRef: "src/product-spec.ts",
      lineStart: 10,
      lineEnd: 80,
      summary: "The route registration is defined in this window.",
      details:
        "This is intentionally substantive semantic context that must live in the ledger entry payload, not in runtime metadata.",
      expectedUse: "Use it to select the exact edit target.",
    });

    expect(result.status).toBe("succeeded");
    expect(result.entry).toMatchObject({
      artifactKind: "node_resource_ledger_entry",
      entryKind: "file_window_opened",
      fileRef: "src/product-spec.ts",
      semanticQualityJudgedByDeterministicCode: false,
    });
    expect(result.ledger?.entryRefs).toHaveLength(1);
    expect(result.metadata).toMatchObject({
      nodeResourceLedgerManifest: {
        artifactKind: "node_resource_ledger_manifest",
        entryCount: 1,
        entryPayloadRefCount: 1,
      },
      nodeResourceLedgerEntryManifest: {
        artifactKind: "node_resource_ledger_entry_manifest",
        entryKind: "file_window_opened",
        contentRefCount: 1,
      },
    });
    const metadataText = JSON.stringify(result.metadata);
    expect(metadataText).not.toContain("intentionally substantive semantic context");
    expect(metadataText).not.toContain("details");
  });

  it("appends planning-domain resource substance without file-shaped metadata", () => {
    const opened = openNodeResourceLedger({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      workIntentRef: "work-intent://planning-1",
      nodeExecutionContractRef: "contract://planning-1",
      capabilityId: "planning_capsule_draft",
      evidenceMode: ["planning_artifact_evidence"],
      targetCommitmentIds: ["C-PLAN-1"],
      authorityScope: ["prompt-section://product-spec/acceptance-criteria"],
    });
    const result = appendNodeResourceLedgerEntry({
      ledger: opened.ledger!,
      entryKind: "source_prompt_section_opened",
      contentRefs: ["prompt-section://product-spec/acceptance-criteria"],
      summary: "The acceptance criteria section constrains the planning capsule scope.",
      details:
        "Planning-domain semantic substance stays in the entry payload so metadata remains bounded.",
      expectedUse: "Use this section to draft a planning capsule and compile-readiness inputs.",
    });

    expect(result.status).toBe("succeeded");
    expect(result.entry).toMatchObject({
      entryKind: "source_prompt_section_opened",
      fileRef: null,
      semanticQualityJudgedByDeterministicCode: false,
    });
    expect(result.metadata).toMatchObject({
      nodeResourceLedgerEntryManifest: {
        entryKind: "source_prompt_section_opened",
        fileRef: null,
      },
    });
    expect(JSON.stringify(result.metadata)).not.toContain("Planning-domain semantic substance");
  });

  it("blocks append refs outside authority without semantic file scoring", () => {
    const ledger = openValidLedger();
    const result = appendNodeResourceLedgerEntry({
      ledger,
      entryKind: "file_window_opened",
      contentRefs: ["src/auth/session.ts#L1-L80"],
      fileRef: "src/auth/session.ts",
      summary: "A model asked to inspect an unauthorized file.",
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("node_resource_ledger_authority_scope_violation");
    expect(result.entry).toBeNull();
  });

  it("appends node resource demand fulfillment into the consumer ledger", () => {
    const focus = acceptedFocus();
    const demand = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      targetCommitmentIds: ["C-1"],
      authorityScope: ["src/product-spec.ts"],
      demandReason: "Need target file context.",
      expectedUse: "Use for patch planning.",
      resourceObjectiveFocus: focus.resourceObjectiveFocus,
      legalRefUniverse: focus.legalRefUniverse,
    });
    const fulfilled = requestNodeResourceDemand({
      session: demand.session!,
      requestKind: "file_window",
      fileRef: "src/product-spec.ts",
      lineStart: 1,
      lineEnd: 120,
      reason: "Open product spec file.",
      expectedUse: "Use as local edit context.",
      boundedSnapshotRefs: ["file-window://src/product-spec.ts#L1-L120:abc"],
    });
    const ledger = openValidLedger();
    const appended = appendNodeResourceDemandFulfillmentToLedger({
      ledger,
      session: fulfilled.session,
      request: fulfilled.request,
      fulfillment: fulfilled.fulfillment!,
    });

    expect(appended.status).toBe("succeeded");
    expect(appended.entry?.entryKind).toBe("file_window_opened");
    expect(appended.entry?.sourceFulfillmentRef).toBe(fulfilled.fulfillment?.fulfillmentRef);
    expect(appended.metadata).toMatchObject({
      nodeResourceLedgerEntryManifest: {
        entryKind: "file_window_opened",
      },
    });
  });

  it("records bounded provider diagnostics as payload-backed ledger entries", () => {
    const ledger = openValidLedger();
    const result = appendNodeResourceLedgerEntry({
      ledger,
      entryKind: "provider_diagnostic_recorded",
      contentRefs: ["provider-diagnostic://qwen/context-scout/attempt-1"],
      summary: "Qwen resource scout returned an adapter preflight block.",
      providerDiagnostic: {
        modelRef: "qwen/qwen3-coder-next",
        providerId: "openrouter",
        requestByteCount: 35_000,
        timeoutMs: 90_000,
        timeoutState: "not_timed_out",
        nativeFinishReason: "preflight_blocked",
        choiceCount: 0,
        contentLengths: [],
        parsedContentLength: 0,
        retryNumber: 0,
        concurrencySlot: "context-slot-1",
        inputBundleRef: "runtime-job://runtime-1/input/qwen",
        inputBundleHash: "sha256:abc",
      },
    });

    expect(result.status).toBe("succeeded");
    expect(result.ledger?.providerDiagnosticRefs).toEqual([result.entry?.entryRef]);
    expect(JSON.stringify(result.metadata)).not.toContain("qwen/qwen3-coder-next");
    expect(result.metadata).toMatchObject({
      nodeResourceLedgerEntryManifest: {
        entryKind: "provider_diagnostic_recorded",
      },
    });
  });

  it("projects hydration refs without carrying ledger or entry bodies", () => {
    const ledger = openValidLedger();
    const appended = appendNodeResourceLedgerEntry({
      ledger,
      entryKind: "validation_recommended",
      contentRefs: ["tests/product-spec.test.ts"],
      testRef: "tests/product-spec.test.ts",
      summary: "Run the Product/Spec targeted test after editing.",
    });
    const projection = projectNodeResourceLedger({
      ledger: appended.ledger,
      entries: [appended.entry!],
    });

    expect(projection.ledgerManifest?.entryCount).toBe(1);
    expect(projection.hydrationRequest?.payloadRefs).toHaveLength(2);
    expect(JSON.stringify(projection)).not.toContain("details");
    expect(JSON.stringify(projection)).not.toContain("full file body");
  });

  it("bounds projections for many large-file windows while keeping bodies payload-only", () => {
    let ledger = openValidLedger();
    const entries = [];
    for (let index = 0; index < 120; index += 1) {
      const lineStart = 1 + index * 80;
      const appended = appendNodeResourceLedgerEntry({
        ledger,
        entryKind: "file_window_opened",
        contentRefs: [`src/product-spec.ts#L${lineStart}-L${lineStart + 60}`],
        fileRef: "src/product-spec.ts",
        lineStart,
        lineEnd: lineStart + 60,
        summary: `Window ${index + 1} opens a distinct large-file region for model-authored context.`,
        details: `large-window-body-${index}: ${"substantive file window detail ".repeat(180)}`,
        expectedUse: "Use this window for target selection only if the model asks to hydrate it.",
      });
      expect(appended.status).toBe("succeeded");
      ledger = appended.ledger!;
      entries.push(appended.entry!);
    }

    const projection = projectNodeResourceLedger({ ledger, entries });
    const serialized = JSON.stringify(projection);

    expect(projection.totalEntryManifestCount).toBe(120);
    expect(projection.projectedEntryManifestCount).toBe(
      NODE_RESOURCE_LEDGER_DEFAULT_PROJECTED_ENTRY_MANIFESTS,
    );
    expect(projection.projectionTruncated).toBe(true);
    expect(serialized).not.toContain("substantive file window detail");
    expect(serialized).not.toContain("large-window-body");
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(24_000);
  });

  it("persists ledger and entry bodies through runtime artifact payload storage", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({ jobId: "runtime-1", jobType: "node-resource-ledger-proof" });
      const ledger = openValidLedger();
      const appended = appendNodeResourceLedgerEntry({
        ledger,
        entryKind: "existing_pattern_reported",
        contentRefs: ["src/product-spec.ts#L200-L340"],
        fileRef: "src/product-spec.ts",
        lineStart: 200,
        lineEnd: 340,
        summary: "The existing implementation stores large semantic context in payload bodies.",
        details: "payload-only-ledger-detail ".repeat(260),
        expectedUse: "Hydrate only when the next execution step needs this exact entry.",
      });

      const persisted = await persistNodeResourceLedgerPayloadArtifacts({
        repository,
        ledger: appended.ledger,
        entry: appended.entry,
      });

      expect(persisted.status).toBe("succeeded");
      expect(persisted.payloadCount).toBe(2);
      expect(persisted.payloadRefs).toEqual(
        expect.arrayContaining([
          appended.ledger!.ledgerPayloadRef.payloadRef,
          appended.entry!.entryPayloadRef.payloadRef,
        ]),
      );
      const ledgerPayload = await repository.getJsonPayload(appended.ledger!.ledgerPayloadRef.payloadRef);
      const entryPayload = await repository.getJsonPayload(appended.entry!.entryPayloadRef.payloadRef);
      expect(ledgerPayload?.body).toMatchObject({
        artifactKind: "node_resource_ledger",
        ledgerRef: appended.ledger!.ledgerRef,
      });
      expect(entryPayload?.body).toMatchObject({
        artifactKind: "node_resource_ledger_entry",
        entryRef: appended.entry!.entryRef,
        details: expect.stringContaining("payload-only-ledger-detail"),
      });
      const artifacts = await repository.listArtifacts("runtime-1");
      const metadataText = JSON.stringify(artifacts.map((artifact) => artifact.metadata));
      expect(metadataText).not.toContain("payload-only-ledger-detail");
      expect(metadataText).toContain("node_resource_ledger_manifest");
      expect(persisted.largestMetadataBytes).toBeLessThan(32 * 1024);
    });
  });

  it("exposes resource.ledger.* through runtime tool outputs", () => {
    const opened = compileNodeResourceLedgerToolOutput({
      toolId: "resource.ledger.open",
      metadata: {
        runtimeJobId: "runtime-1",
        workflowId: "workflow-1",
        graphId: "graph-1",
        consumerNodeId: "impl-1",
        capabilityId: "implementation_complex",
        evidenceMode: ["changed_file_evidence"],
        authorityScope: ["src/product-spec.ts"],
      },
    });
    expect(opened.status).toBe("succeeded");

    const appended = compileNodeResourceLedgerToolOutput({
      toolId: "resource.ledger.report_relevant_file",
      volatileInput: { nodeResourceLedger: opened.ledger },
      metadata: {
        fileRef: "src/product-spec.ts",
        contentRefs: ["src/product-spec.ts"],
        summary: "The relevant file for this node is structurally authorized.",
        expectedUse: "Use it for target selection.",
      },
    });

    expect(appended.status).toBe("succeeded");
    expect(appended.metadata).toMatchObject({
      nodeResourceLedgerManifest: {
        entryCount: 1,
      },
      nodeResourceLedgerEntryManifest: {
        entryKind: "relevant_file_reported",
      },
    });
  });

  it("exposes planning-domain resource ledger tools through the same small-verb compiler", () => {
    const opened = compileNodeResourceLedgerToolOutput({
      toolId: "resource.ledger.open",
      metadata: {
        runtimeJobId: "runtime-1",
        workflowId: "agent_team.product_spec_planning",
        graphId: "graph-1",
        consumerNodeId: "planning-1",
        capabilityId: "planning_capsule_draft",
        evidenceMode: ["planning_artifact_evidence"],
        authorityScope: ["planning-capsule://draft-1"],
      },
    });
    expect(opened.status).toBe("succeeded");

    const appended = compileNodeResourceLedgerToolOutput({
      toolId: "resource.ledger.report_planning_capsule",
      volatileInput: { nodeResourceLedger: opened.ledger },
      metadata: {
        contentRefs: ["planning-capsule://draft-1"],
        summary: "Planning capsule draft is available as a domain resource.",
        expectedUse: "Use it for action graph proposal readiness.",
      },
    });

    expect(appended.status).toBe("succeeded");
    expect(appended.metadata).toMatchObject({
      nodeResourceLedgerEntryManifest: {
        entryKind: "planning_capsule_reported",
      },
    });
  });

  it("blocks appends after close to preserve append-only lifecycle", () => {
    const ledger = openValidLedger();
    const closed = closeNodeResourceLedger({ ledger });
    const appended = appendNodeResourceLedgerEntry({
      ledger: closed.ledger!,
      entryKind: "risk_reported",
      summary: "Late entry should not mutate a closed ledger.",
    });

    expect(closed.status).toBe("succeeded");
    expect(appended.status).toBe("needs_review");
    expect(appended.reasonCodes).toContain("node_resource_ledger_not_open");
  });
});
