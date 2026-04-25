import { describe, expect, it } from "vitest";
import {
  attachSourceAuthorityMetadata,
  buildSourceAuthorityMetadata,
  decideAuthorityPromotion,
  evaluateSoftSourceAdmission,
  getSourceProfile,
  validateSourceAuthorityMetadata,
} from "./source-authority.ts";

describe("source-authority", () => {
  it("defines source profile defaults and validates authority metadata", () => {
    expect(buildSourceAuthorityMetadata("explicit_user_turn")).toMatchObject({
      sourceProfileId: "explicit_user_turn",
      authorityTier: "user_authoritative",
      allowedMemoryKinds: ["preference", "fact", "rule", "procedure", "reference"],
      riskPolicy: "normal",
    });

    expect(buildSourceAuthorityMetadata("researcher_report_artifact")).toMatchObject({
      authorityTier: "cited_soft",
      allowedMemoryKinds: ["fact", "reference", "procedure"],
      rawContentRetentionMode: "retain_bounded_excerpt",
      riskPolicy: "lower_authority",
    });

    expect(
      validateSourceAuthorityMetadata(buildSourceAuthorityMetadata("tool_result_capture")),
    ).toMatchObject({ ok: true });

    expect(
      validateSourceAuthorityMetadata({
        ...buildSourceAuthorityMetadata("cited_assistant_answer"),
        authorityTier: "user_authoritative",
      }),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["authorityTier does not match sourceProfileId default"]),
    });
  });

  it("attaches source authority metadata through existing JSON metadata surfaces", () => {
    expect(attachSourceAuthorityMetadata({ source: "fixture" }, "daily_continuity")).toEqual({
      source: "fixture",
      sourceAuthority: buildSourceAuthorityMetadata("daily_continuity"),
    });
  });

  it("enforces allowed memory kinds by source profile", () => {
    expect(getSourceProfile("tool_result_capture").allowedMemoryKinds).toEqual([
      "fact",
      "reference",
      "procedure",
    ]);

    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-rule",
        kind: "rule",
        sourceProfileId: "tool_result_capture",
        sourceRefs: [{ sourceId: "src-tool", contentHash: "hash-tool" }],
      }),
    ).toMatchObject({
      decision: "reject",
      reasonCodes: ["kind_not_allowed_for_source_profile"],
    });
  });

  it("requires citations for researcher reports", () => {
    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-research",
        kind: "fact",
        sourceProfileId: "researcher_report_artifact",
        sourceRefs: [],
      }),
    ).toMatchObject({
      decision: "reject",
      reasonCodes: ["citation_required"],
    });

    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-research",
        kind: "fact",
        sourceProfileId: "researcher_report_artifact",
        sourceRefs: [{ sourceId: "src-report", url: "https://example.test/report" }],
      }),
    ).toMatchObject({
      decision: "auto_admit",
      authorityTier: "cited_soft",
      reasonCodes: ["lower_authority_auto_admit"],
    });
  });

  it("captures cited assistant answer evidence without treating assistant prose as authority", () => {
    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-answer",
        kind: "reference",
        sourceProfileId: "cited_assistant_answer",
        sourceRefs: [{ sourceId: "src-answer", artifactPath: ".artifacts/model-memory/report.md" }],
        capturesAssistantProseAsAuthority: true,
      }),
    ).toMatchObject({
      decision: "reject",
      reasonCodes: ["assistant_prose_is_not_authority"],
    });

    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-answer",
        kind: "reference",
        sourceProfileId: "cited_assistant_answer",
        sourceRefs: [{ sourceId: "src-answer", artifactPath: ".artifacts/model-memory/report.md" }],
        capturesAssistantProseAsAuthority: false,
      }),
    ).toMatchObject({
      decision: "auto_admit",
      authorityTier: "cited_soft",
    });
  });

  it("keeps inspection-only and hard-reject sources out of normal admission", () => {
    expect(
      evaluateSoftSourceAdmission({
        candidateId: "cand-transcript",
        kind: "fact",
        sourceProfileId: "raw_transcript",
        sourceRefs: [{ sourceId: "src-transcript", contentHash: "hash-transcript" }],
      }),
    ).toMatchObject({
      decision: "inspection_only",
      reasonCodes: ["kind_not_allowed_for_source_profile"],
    });

    const secretResult = evaluateSoftSourceAdmission(
      {
        candidateId: "cand-secret",
        kind: "fact",
        sourceProfileId: "secret_or_private_phrase",
        sourceRefs: [{ sourceId: "src-secret" }],
        riskFlags: ["secret"],
      },
      { rawContentForRedactedFinding: "do-not-store-this-secret" },
    );
    expect(secretResult).toMatchObject({
      decision: "reject",
      reasonCodes: ["hard_reject"],
      redactedFinding: {
        findingType: "hard_reject_source",
        rawContentCharCount: "do-not-store-this-secret".length,
      },
    });
    expect(JSON.stringify(secretResult)).not.toContain("do-not-store-this-secret");
  });

  it("does not promote authority through corroboration", () => {
    expect(
      decideAuthorityPromotion({
        currentAuthorityTier: "cited_soft",
        proposedAuthorityTier: "tool_grounded",
        basis: "corroboration",
      }),
    ).toEqual({
      promoted: false,
      authorityTier: "cited_soft",
      confidenceMayIncrease: true,
      reasonCode: "corroboration_does_not_promote_authority",
    });
  });

  it("requires explicit approval or higher-authority replacement for promotion", () => {
    expect(
      decideAuthorityPromotion({
        currentAuthorityTier: "cited_soft",
        proposedAuthorityTier: "user_authoritative",
        basis: "explicit_user_approval",
      }),
    ).toMatchObject({
      promoted: true,
      authorityTier: "user_authoritative",
    });

    expect(
      decideAuthorityPromotion({
        currentAuthorityTier: "curated_authoritative",
        proposedAuthorityTier: "cited_soft",
        basis: "higher_authority_replacement",
      }),
    ).toMatchObject({
      promoted: false,
      authorityTier: "curated_authoritative",
      reasonCode: "no_higher_authority_source",
    });
  });
});
