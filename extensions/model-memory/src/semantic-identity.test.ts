import { describe, expect, it } from "vitest";
import {
  assessStructuralSameClaimDelta,
  describeFamilyRecallMatch,
  describeFactValueMatchProfile,
  describeRuleActionBundleMatchProfile,
  deriveMemoryIdentity,
  familyRecallDecisionForKind,
  hasStrongRuleActionBundleRecallMatch,
  isDeterministicSameSlotSupersession,
} from "./semantic-identity.ts";

const testProvenance = [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }];
const secondProvenance = [{ sourceId: "window-002", segmentIndex: 0, headingPath: [] }];

describe("semantic-identity", () => {
  it("normalizes exact duplicates to the same identity key", () => {
    const first = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "Deployment Region",
        value: " REGION-001 ",
      },
      scope: {
        projectId: "PROJECT-001",
        projectScope: "project-001",
      },
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const second = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment   region",
        value: "region-001",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(first.identityKey).toBe(second.identityKey);
    expect(first.slotKey).toBe(second.slotKey);
  });

  it("treats same-slot fact corrections as supersession candidates", () => {
    const prior = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-001",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const replacement = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-002",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(prior.identityKey).not.toBe(replacement.identityKey);
    expect(
      isDeterministicSameSlotSupersession(
        { kind: "fact", identityKey: prior.identityKey, slotKey: prior.slotKey },
        { kind: "fact", identityKey: replacement.identityKey, slotKey: replacement.slotKey },
      ),
    ).toBe(true);
  });

  it("keeps ordered procedure steps inside identity construction", () => {
    const first = deriveMemoryIdentity({
      canonicalClass: "feedback",
      kind: "procedure",
      payload: {
        title: "procedure-001",
        steps: ["run check-001", "record artifact-001"],
      },
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const second = deriveMemoryIdentity({
      canonicalClass: "feedback",
      kind: "procedure",
      payload: {
        title: "procedure-001",
        steps: ["record artifact-001", "run check-001"],
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(first.identityKey).not.toBe(second.identityKey);
    expect(first.slotKey).toBeUndefined();
  });

  it("treats rule action-bundle packing drift as a recall match", () => {
    const result = hasStrongRuleActionBundleRecallMatch(
      {
        kind: "rule",
        payload: {
          subject: "Docs URL output",
          recommendedAction: "Reply with full docs URLs in final reports and keep them explicit.",
          avoidAction: "Do not use root-relative links in user-facing final output.",
        },
      },
      {
        kind: "rule",
        payload: {
          subject: "Final docs URL reporting",
          recommendedAction: "Reply with full docs URLs in final reports.",
          avoidAction:
            "Keep them explicit and do not use root-relative links in user-facing final output.",
        },
      },
    );

    expect(result).toBe(true);
  });

  it("treats wrapper-heavy same-rule restatements as moderate action-bundle matches", () => {
    const profile = describeRuleActionBundleMatchProfile(
      {
        kind: "rule",
        payload: {
          subject: "GitHub PR newline formatting",
          recommendedAction:
            "Use literal multiline strings or a single-quoted heredoc for real newlines in GitHub comment bodies.",
          avoidAction: "Do not embed literal \\n strings in GitHub issue, PR, or comment bodies.",
        },
      },
      {
        kind: "rule",
        payload: {
          subject: "GitHub comment body newline handling",
          recommendedAction:
            "For GitHub issue, PR, and comment bodies, keep real newlines by using literal multiline strings.",
          avoidAction:
            "Never embed literal \\n strings; prefer a single-quoted heredoc when shell quoting gets tricky.",
        },
      },
    );

    expect(profile.comparable).toBe(true);
    expect(profile.moderate).toBe(true);
  });

  it("marks fact wrapper drift as non-additive when the same value is preserved", () => {
    const assessment = assessStructuralSameClaimDelta(
      {
        kind: "fact",
        payload: {
          subject: "OpenClaw config location and behavior",
          value:
            "OpenClaw optionally reads a JSON5 config from ~/.openclaw/openclaw.json and falls back to safe defaults if the file is missing.",
        },
      },
      {
        kind: "fact",
        payload: {
          subject: "OpenClaw configuration file",
          value:
            "OpenClaw optionally reads a JSON5 config from ~/.openclaw/openclaw.json and uses safe defaults if it is missing.",
        },
      },
    );

    expect(assessment.isNonAdditive).toBe(true);
    expect(["subject_drift", "value_wrapper_drift", "broader_narrower"]).toContain(
      assessment.packagingDriftType,
    );
  });

  it("treats strong same-value fact matches with subject drift as packaging-only drift", () => {
    const assessment = assessStructuralSameClaimDelta(
      {
        kind: "fact",
        payload: {
          subject: "OpenClaw configuration file",
          value:
            "OpenClaw reads an optional JSON5 config from ~/.openclaw/openclaw.json and uses safe defaults if the file is missing.",
        },
      },
      {
        kind: "fact",
        payload: {
          subject: "OpenClaw config file location and defaults",
          value:
            "OpenClaw reads an optional JSON5 config from ~/.openclaw/openclaw.json; if the file is missing, it uses safe defaults.",
        },
      },
    );

    expect(assessment.deltaClass).toBe("packaging_only_drift");
    expect(assessment.packagingDriftType).toBe("subject_drift");
    expect(assessment.isNonAdditive).toBe(true);
  });

  it("identifies broader candidate wrappers for fact preference", () => {
    const profile = describeFactValueMatchProfile(
      {
        kind: "fact",
        payload: {
          subject: "Restart coalescing",
          value: "Restart requests are coalesced while one is already pending.",
        },
      },
      {
        kind: "fact",
        payload: {
          subject: "Config apply and patch restart behavior",
          value:
            "Restart requests are coalesced while one is already pending. A cooldown also applies between restart cycles.",
        },
      },
    );

    expect(profile.strong).toBe(true);
    expect(profile.candidateContainsObjectValue).toBe(true);
  });

  it("marks rules, facts, procedures, and preferences as family-recall yes_now while deferring references", () => {
    expect(familyRecallDecisionForKind("rule")).toBe("yes_now");
    expect(familyRecallDecisionForKind("fact")).toBe("yes_now");
    expect(familyRecallDecisionForKind("procedure")).toBe("yes_now");
    expect(familyRecallDecisionForKind("preference")).toBe("yes_now");
    expect(familyRecallDecisionForKind("reference")).toBe("yes_later");
  });

  it("derives strong family recall from procedure steps despite title drift", () => {
    const match = describeFamilyRecallMatch(
      {
        kind: "procedure",
        payload: {
          title: "Gateway rollout verification",
          steps: ["Run pnpm build", "Run pnpm check", "Run pnpm test"],
        },
      },
      {
        kind: "procedure",
        payload: {
          title: "Landing verification checklist",
          steps: ["Run pnpm build", "Run pnpm check", "Run pnpm test"],
        },
      },
    );

    expect(match.comparable).toBe(true);
    expect(match.strong).toBe(true);
  });

  it("derives strong family recall from preference instruction and operation despite subject drift", () => {
    const match = describeFamilyRecallMatch(
      {
        kind: "preference",
        payload: {
          subject: "final report tone",
          instruction: "Keep explanations high level and direct",
          operation: "prefer",
        },
      },
      {
        kind: "preference",
        payload: {
          subject: "response style",
          instruction: "Keep explanations high level and direct",
          operation: "prefer",
        },
      },
    );

    expect(match.comparable).toBe(true);
    expect(match.strong).toBe(true);
  });
});
