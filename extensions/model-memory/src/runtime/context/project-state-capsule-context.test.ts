import { describe, expect, it } from "vitest";
import type { ProjectStateCapsuleRetrievalShadowResult } from "../retrieval/project-state-capsules.ts";
import { buildProjectStateCapsuleContext } from "./project-state-capsule-context.ts";

function shadow(overrides: Partial<ProjectStateCapsuleRetrievalShadowResult> = {}) {
  const base: ProjectStateCapsuleRetrievalShadowResult = {
    candidates: [],
    exclusions: [],
    packs: [
      {
        schemaVersion: "project_state_capsule_shadow_pack.v1",
        packId: "pack-project-1",
        shadow: true,
        injected: false,
        packType: "project_state_pack",
        capsuleId: "capsule-project-1",
        capsuleType: "project_state",
        projectId: "project-1",
        contentHash: "hash-capsule-project-1",
        sourceMemoryIds: ["mem-project-1"],
        sourceRefs: [{ sourceId: "source-project-1", segmentId: "segment-1" }],
        authorityTiers: ["curated_authoritative"],
        sourceProfileIds: ["curated_corpus"],
        freshness: { status: "fresh" },
        staleMarkers: [],
        conflictMarkers: [],
        graphNodeIds: [],
        graphEdgeIds: [],
        sections: [
          {
            sectionId: "section-current",
            sectionType: "current_state",
            title: "Current State",
            itemCount: 1,
            sourceMemoryIds: ["mem-project-1"],
            authorityTiers: ["curated_authoritative"],
            sourceProfileIds: ["curated_corpus"],
            items: [
              {
                itemId: "item-current",
                sectionType: "current_state",
                text: "Capsule context is explicitly gated.",
                sourceMemoryIds: ["mem-project-1"],
                authorityTier: "curated_authoritative",
                sourceProfileId: "curated_corpus",
              },
            ],
          },
        ],
        estimatedTokens: 5,
      },
    ],
    telemetry: {
      schemaVersion: "project_state_capsule_shadow_telemetry.v1",
      mode: "shadow_report_only",
      wouldSelectCapsuleIds: ["capsule-project-1"],
      excludedCapsuleIds: [],
      exclusionReasons: {
        shadow_disabled: 0,
        scope_mismatch: 0,
        stale: 0,
        conflicted: 0,
        inspection_only: 0,
        no_source_memory_ids: 0,
        not_generation_context_authority: 0,
      },
      capsuleSourceMemoryIds: ["mem-project-1"],
      capsuleContentHashes: ["hash-capsule-project-1"],
      projectPageBypassed: true,
      projectPageBypassReason: "project_state_capsule_available",
      defaultContextInjectionChanged: false,
    },
  };
  return {
    ...base,
    ...overrides,
    packs: overrides.packs ?? base.packs,
    telemetry: {
      ...base.telemetry,
      ...overrides.telemetry,
    },
  };
}

describe("project-state capsule context gate", () => {
  it("does not inject capsule context by default", () => {
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow(),
    });

    expect(result.blocks).toEqual([]);
    expect(result.renderedText).toBeUndefined();
    expect(result.telemetry).toMatchObject({
      mode: "disabled",
      enabled: false,
      injected: false,
      defaultContextInjectionChanged: false,
      skippedReasons: expect.objectContaining({ disabled: 1 }),
    });
  });

  it("keeps shadow mode report-only without rendered context", () => {
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow(),
      mode: "shadow_report_only",
    });

    expect(result.blocks).toEqual([]);
    expect(result.renderedText).toBeUndefined();
    expect(result.telemetry.skippedReasons.shadow_only).toBe(1);
  });

  it("injects bounded project-state capsule context only under the explicit gate", () => {
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow(),
      mode: "explicit_injection",
      projectPageProjectionAvailable: true,
    });

    expect(result.blocks).toEqual([
      expect.objectContaining({
        injected: true,
        capsuleId: "capsule-project-1",
        packId: "pack-project-1",
        contentHash: "hash-capsule-project-1",
        sourceMemoryIds: ["mem-project-1"],
        sourceRefs: [expect.objectContaining({ sourceId: "source-project-1" })],
        authorityTiers: ["curated_authoritative"],
        sourceProfileIds: ["curated_corpus"],
        freshness: { status: "fresh" },
        selectedSectionTypes: ["current_state"],
      }),
    ]);
    expect(result.renderedText).toContain("<project-state-capsule-context");
    expect(result.renderedText).toContain("authority:curated_authoritative");
    expect(result.telemetry).toMatchObject({
      mode: "explicit_injection",
      enabled: true,
      injected: true,
      selectedCapsuleIds: ["capsule-project-1"],
      injectedPackIds: ["pack-project-1"],
      sourceMemoryIds: ["mem-project-1"],
      contentHashes: ["hash-capsule-project-1"],
      projectPageBypassed: true,
      projectPageBypassReason: "project_state_capsule_explicit_context",
      defaultContextInjectionChanged: false,
    });
  });

  it("labels lower-authority soft-source material in rendered context", () => {
    const lowerAuthority = shadow({
      packs: [
        {
          ...shadow().packs[0]!,
          authorityTiers: ["cited_soft"],
          sourceProfileIds: ["researcher_report_artifact"],
          sections: [
            {
              ...shadow().packs[0]!.sections[0]!,
              authorityTiers: ["cited_soft"],
              sourceProfileIds: ["researcher_report_artifact"],
              items: [
                {
                  ...shadow().packs[0]!.sections[0]!.items[0]!,
                  authorityTier: "cited_soft",
                  sourceProfileId: "researcher_report_artifact",
                },
              ],
            },
          ],
        },
      ],
    });

    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: lowerAuthority,
      mode: "explicit_injection",
    });

    expect(result.renderedText).toContain("authority:cited_soft");
    expect(result.renderedText).toContain("label:lower_authority");
  });

  it("excludes stale, conflicted, inspection-only, and missing-provenance packs from normal injection", () => {
    const basePack = shadow().packs[0]!;
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow({
        packs: [
          {
            ...basePack,
            packId: "pack-stale",
            capsuleId: "capsule-stale",
            freshness: { status: "stale", reason: "source stale" },
            staleMarkers: ["stale:mem-project-1"],
          },
          {
            ...basePack,
            packId: "pack-conflicted",
            capsuleId: "capsule-conflicted",
            conflictMarkers: ["mem-project-1", "mem-project-2"],
          },
          {
            ...basePack,
            packId: "pack-inspection",
            capsuleId: "capsule-inspection",
            authorityTiers: ["inspection_only"],
          },
          {
            ...basePack,
            packId: "pack-empty-source",
            capsuleId: "capsule-empty-source",
            sourceMemoryIds: [],
          },
        ],
      }),
      mode: "explicit_injection",
    });

    expect(result.blocks).toEqual([]);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capsuleId: "capsule-stale", reason: "stale" }),
        expect.objectContaining({ capsuleId: "capsule-conflicted", reason: "conflicted" }),
        expect.objectContaining({ capsuleId: "capsule-inspection", reason: "inspection_only" }),
        expect.objectContaining({
          capsuleId: "capsule-empty-source",
          reason: "missing_pack_provenance",
        }),
      ]),
    );
  });

  it("allows conflicted capsule material only when conflict-aware mode is explicit", () => {
    const basePack = shadow().packs[0]!;
    const conflicted = shadow({
      packs: [
        {
          ...basePack,
          packId: "pack-conflicted",
          capsuleId: "capsule-conflicted",
          conflictMarkers: ["mem-project-1", "mem-project-2"],
        },
      ],
    });

    expect(
      buildProjectStateCapsuleContext({
        capsuleRetrievalShadow: conflicted,
        mode: "explicit_injection",
      }).blocks,
    ).toEqual([]);
    expect(
      buildProjectStateCapsuleContext({
        capsuleRetrievalShadow: conflicted,
        mode: "explicit_injection",
        includeConflictAware: true,
      }).blocks,
    ).toEqual([expect.objectContaining({ capsuleId: "capsule-conflicted" })]);
  });

  it("is deterministic and does not mutate the source shadow packs", () => {
    const source = shadow();
    const first = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: source,
      mode: "explicit_injection",
    });
    const second = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: source,
      mode: "explicit_injection",
    });

    expect(first).toEqual(second);
    first.blocks[0]!.selectedSectionIds.length = 0;
    expect(source.packs[0]!.sections).toHaveLength(1);
    expect(source.packs[0]!.sections[0]!.items).toHaveLength(1);
  });

  it("respects section, item, and rendered token bounds", () => {
    const basePack = shadow().packs[0]!;
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow({
        packs: [
          {
            ...basePack,
            sections: [
              {
                ...basePack.sections[0]!,
                items: [
                  {
                    ...basePack.sections[0]!.items[0]!,
                    itemId: "item-long-1",
                    text: "one two three four five six seven eight nine ten eleven twelve",
                  },
                  {
                    ...basePack.sections[0]!.items[0]!,
                    itemId: "item-long-2",
                    text: "second item should be excluded by item bound",
                  },
                ],
              },
              {
                ...basePack.sections[0]!,
                sectionId: "section-extra",
                title: "Extra",
              },
            ],
          },
        ],
      }),
      mode: "explicit_injection",
      maxSections: 1,
      maxItemsPerSection: 1,
      maxRenderedTokens: 24,
    });

    expect(result.blocks[0]?.selectedSectionIds).toEqual(["section-current"]);
    expect(result.renderedText).not.toContain("second item should be excluded");
    expect(result.telemetry.estimatedTokens).toBeLessThanOrEqual(24);
  });

  it("does not surface excluded inspection-only marker text", () => {
    const basePack = shadow().packs[0]!;
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow({
        packs: [
          {
            ...basePack,
            authorityTiers: ["inspection_only"],
            sections: [
              {
                ...basePack.sections[0]!,
                items: [
                  {
                    ...basePack.sections[0]!.items[0]!,
                    text: "never-write-marker",
                    authorityTier: "inspection_only",
                  },
                ],
              },
            ],
          },
        ],
      }),
      mode: "explicit_injection",
    });

    expect(JSON.stringify(result)).not.toContain("never-write-marker");
  });

  it("hard-rejects secret/private source profiles before rendering marker text", () => {
    const basePack = shadow().packs[0]!;
    const result = buildProjectStateCapsuleContext({
      capsuleRetrievalShadow: shadow({
        packs: [
          {
            ...basePack,
            sourceProfileIds: ["secret_or_private_phrase"],
            sections: [
              {
                ...basePack.sections[0]!,
                items: [
                  {
                    ...basePack.sections[0]!.items[0]!,
                    text: "blocked-marker-content",
                    sourceProfileId: "secret_or_private_phrase",
                  },
                ],
              },
            ],
          },
        ],
      }),
      mode: "explicit_injection",
      includeInspection: true,
    });

    expect(result.exclusions).toEqual([
      expect.objectContaining({ capsuleId: "capsule-project-1", reason: "hard_reject" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("blocked-marker-content");
  });
});
