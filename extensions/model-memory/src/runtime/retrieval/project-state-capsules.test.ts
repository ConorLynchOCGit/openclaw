import { describe, expect, it } from "vitest";
import {
  compileProjectStateCapsule,
  type ProjectStateCapsule,
} from "../../project-state-capsule.ts";
import type { RuntimeGraphMemoryInput } from "../../runtime-graph.ts";
import {
  buildProjectStateCapsuleRetrievalShadow,
  buildProjectStateCapsuleShadowPacks,
  selectProjectStateCapsuleCandidates,
} from "./project-state-capsules.ts";
import type { RetrievalPlan } from "./types.ts";

const plan = (overrides: Partial<RetrievalPlan> = {}): RetrievalPlan => ({
  planId: "plan-1",
  schemaVersion: "retrieval_plan.v1",
  intent: "project status",
  corpora: ["project"],
  packTypes: ["project_state_pack"],
  queries: [
    {
      queryHash: "query-hash",
      redactedLabel: "sha256:query-hash",
      indexes: ["fielded"],
      filters: { projectId: "project-1" },
    },
  ],
  budget: {
    maxTokensTotal: 1800,
    hardDirectives: 250,
    userProfile: 150,
    projectState: 350,
    procedures: 550,
    sourceRefs: 250,
    episodes: 150,
    conflicts: 100,
    projections: 150,
  },
  ...overrides,
});

const memory = (overrides: Partial<RuntimeGraphMemoryInput> = {}): RuntimeGraphMemoryInput => ({
  memoryId: "mem-current",
  status: "active",
  unitType: "atomic",
  kind: "claim",
  artifactType: null,
  canonicalText: "Project state is ready for shadow retrieval.",
  searchText: "project state shadow retrieval",
  scope: {
    tenant_id: "tenant-1",
    user_id: "user-1",
    project_id: "project-1",
    workspace_id: "workspace-1",
  },
  payload: { payload_type: "claim", claim_type: "project_fact" },
  validity: {
    valid_at: "2026-04-25T00:00:00.000Z",
    invalid_at: null,
    temporal_status: "current",
  },
  sourceRefs: [
    {
      sourceId: "src-a",
      segmentId: "seg-a",
      sourceType: "document",
      sourceIngestEventId: "evt-a",
    },
  ],
  sourceAuthorityTier: "curated_authoritative",
  sourceProfileId: "curated_corpus",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
  ...overrides,
});

function capsule(overrides: Partial<ProjectStateCapsule> = {}): ProjectStateCapsule {
  const compiled = compileProjectStateCapsule({
    projectId: "project-1",
    memories: [memory()],
    now: new Date("2026-04-25T01:00:00.000Z"),
  }).capsule;
  return {
    ...compiled,
    ...overrides,
    digest: {
      ...compiled.digest,
      ...overrides.digest,
    },
  };
}

describe("project-state capsule retrieval shadow seam", () => {
  it("selects capsule candidates by project scope with provenance and role metadata", () => {
    const result = selectProjectStateCapsuleCandidates({
      retrievalPlan: plan(),
      capsules: [capsule()],
      requestScope: { projectId: "project-1" },
      shadowModeEnabled: true,
      projectPageProjectionAvailable: true,
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        capsuleType: "project_state",
        projectId: "project-1",
        sourceMemoryIds: ["mem-current"],
        sourceRefs: [expect.objectContaining({ sourceId: "src-a", segmentId: "seg-a" })],
        authorityTiers: ["curated_authoritative"],
        sourceProfileIds: ["curated_corpus"],
        freshness: { status: "fresh" },
        conflictMarkers: [],
        selected: true,
        shadow: true,
        rolePolicy: expect.objectContaining({
          generationContextAuthority: "primary",
        }),
      }),
    ]);
    expect(result.candidates[0]?.contentHash).toHaveLength(64);
    expect(result.candidates[0]?.selectionReasonCodes).toEqual(
      expect.arrayContaining([
        "project_scope_exact",
        "retrieval_plan_project_corpus",
        "retrieval_plan_project_state_pack",
      ]),
    );
    expect(result.telemetry).toMatchObject({
      mode: "shadow_report_only",
      wouldSelectCapsuleIds: [result.candidates[0]?.capsuleId],
      projectPageBypassed: true,
      projectPageBypassReason: "project_state_capsule_available",
      defaultContextInjectionChanged: false,
    });
  });

  it("is deterministic for fixed capsule inputs", () => {
    const input = {
      retrievalPlan: plan(),
      capsules: [capsule()],
      requestScope: { projectId: "project-1" },
      shadowModeEnabled: true,
    };

    const first = selectProjectStateCapsuleCandidates(input);
    const second = selectProjectStateCapsuleCandidates(input);

    expect(first.candidates).toEqual(second.candidates);
    expect(first.telemetry).toEqual(second.telemetry);
  });

  it("keeps default retrieval behavior disabled unless shadow mode is explicit", () => {
    const result = buildProjectStateCapsuleRetrievalShadow({
      retrievalPlan: plan(),
      capsules: [capsule()],
      requestScope: { projectId: "project-1" },
    });

    expect(result.candidates).toEqual([]);
    expect(result.packs).toEqual([]);
    expect(result.telemetry).toMatchObject({
      mode: "disabled",
      defaultContextInjectionChanged: false,
      exclusionReasons: expect.objectContaining({ shadow_disabled: 1 }),
    });
  });

  it("excludes stale, inspection-only, and empty-source capsules from normal candidates", () => {
    const fresh = capsule();
    const stale = capsule({
      capsuleId: "capsule-stale",
      digest: {
        ...fresh.digest,
        freshness: { status: "stale", reason: "stale source" },
        conflictMarkers: ["stale:mem-current"],
      },
    });
    const inspectionOnly = capsule({
      capsuleId: "capsule-inspection",
      digest: {
        ...fresh.digest,
        authorityTiers: ["inspection_only"],
      },
    });
    const emptySource = capsule({
      capsuleId: "capsule-empty",
      digest: {
        ...fresh.digest,
        sourceMemoryIds: [],
      },
    });

    const result = selectProjectStateCapsuleCandidates({
      retrievalPlan: plan(),
      capsules: [stale, inspectionOnly, emptySource],
      requestScope: { projectId: "project-1" },
      shadowModeEnabled: true,
    });

    expect(result.candidates).toEqual([]);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capsuleId: "capsule-stale", reason: "stale" }),
        expect.objectContaining({ capsuleId: "capsule-inspection", reason: "inspection_only" }),
        expect.objectContaining({ capsuleId: "capsule-empty", reason: "no_source_memory_ids" }),
      ]),
    );
  });

  it("excludes conflicted capsules unless conflict-aware mode is explicit", () => {
    const conflicted = capsule({
      capsuleId: "capsule-conflicted",
      digest: {
        ...capsule().digest,
        conflictMarkers: ["mem-current", "mem-other"],
      },
    });

    expect(
      selectProjectStateCapsuleCandidates({
        retrievalPlan: plan(),
        capsules: [conflicted],
        requestScope: { projectId: "project-1" },
        shadowModeEnabled: true,
      }).exclusions,
    ).toEqual([expect.objectContaining({ capsuleId: "capsule-conflicted", reason: "conflicted" })]);

    expect(
      selectProjectStateCapsuleCandidates({
        retrievalPlan: plan(),
        capsules: [conflicted],
        requestScope: { projectId: "project-1" },
        shadowModeEnabled: true,
        includeConflictAware: true,
      }).candidates,
    ).toEqual([expect.objectContaining({ capsuleId: "capsule-conflicted" })]);
  });

  it("builds bounded read-only shadow packs that preserve provenance", () => {
    const sourceCapsule = capsule();
    const selection = selectProjectStateCapsuleCandidates({
      retrievalPlan: plan(),
      capsules: [sourceCapsule],
      requestScope: { projectId: "project-1" },
      shadowModeEnabled: true,
    });
    const packs = buildProjectStateCapsuleShadowPacks({
      candidates: selection.candidates,
      capsules: [sourceCapsule],
      maxItemTextLength: 12,
    });

    expect(packs).toEqual([
      expect.objectContaining({
        shadow: true,
        injected: false,
        packType: "project_state_pack",
        capsuleId: sourceCapsule.capsuleId,
        sourceMemoryIds: ["mem-current"],
        sourceRefs: [expect.objectContaining({ sourceId: "src-a" })],
        authorityTiers: ["curated_authoritative"],
        sourceProfileIds: ["curated_corpus"],
        contentHash: sourceCapsule.contentHash,
      }),
    ]);
    expect(packs[0]?.sections[0]?.items[0]?.text.length).toBeLessThanOrEqual(12);

    packs[0]!.sections.length = 0;
    expect(sourceCapsule.sections.length).toBeGreaterThan(0);
  });

  it("does not treat project_page as generation/context authority when project_state exists", () => {
    const result = selectProjectStateCapsuleCandidates({
      retrievalPlan: plan(),
      capsules: [capsule()],
      requestScope: { projectId: "project-1" },
      shadowModeEnabled: true,
      projectPageProjectionAvailable: true,
    });

    expect(result.telemetry.projectPageBypassed).toBe(true);
    expect(result.telemetry.projectPageBypassReason).toBe("project_state_capsule_available");
  });
});
