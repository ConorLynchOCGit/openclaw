import type { CanonicalCandidate } from "./contracts.ts";

export type MmV2CompositeParentRetentionDecision = {
  candidateId: string;
  artifactType: CanonicalCandidate["artifact_type"];
  retainParent: boolean;
  exactEvidence: boolean;
  componentCount: number;
  retainedComponentCount: number;
  blockedComponentCount: number;
  reason:
    | "not_composite"
    | "missing_artifact_type"
    | "missing_exact_evidence"
    | "sensitive"
    | "session_only"
    | "fragmentary"
    | "retain";
};

export type MmV2CompositeChildPromotionDecision = {
  parentCandidateId: string;
  componentId: string | null;
  promotion: "embedded_only" | "global" | "both" | "blocked";
  enterStandaloneLane: boolean;
  retainInParent: boolean;
};

export type MmV2CompositePolicySummary = {
  parentRetention: MmV2CompositeParentRetentionDecision[];
  childPromotions: MmV2CompositeChildPromotionDecision[];
};

type CompositeComponentRecord = {
  component_id: string | null;
  promotion: "embedded_only" | "global" | "both" | "blocked";
};

function extractCompositeComponents(candidate: CanonicalCandidate): CompositeComponentRecord[] {
  const rawComponents = candidate.payload.components;
  if (!Array.isArray(rawComponents)) {
    return [];
  }
  return rawComponents.flatMap((component) => {
    if (!component || typeof component !== "object") {
      return [];
    }
    const promotion = component.promotion;
    if (
      promotion !== "embedded_only" &&
      promotion !== "global" &&
      promotion !== "both" &&
      promotion !== "blocked"
    ) {
      return [];
    }
    return [
      {
        component_id:
          typeof component.component_id === "string" && component.component_id.trim().length > 0
            ? component.component_id
            : null,
        promotion,
      } satisfies CompositeComponentRecord,
    ];
  });
}

function hasSensitiveRiskFlags(candidate: CanonicalCandidate): boolean {
  return candidate.risk_flags.some((flag) => flag !== "none" && flag !== "low_confidence");
}

function hasExactEvidence(candidate: CanonicalCandidate): boolean {
  return (
    typeof candidate.source.evidence_quote === "string" &&
    candidate.source.evidence_quote.trim().length > 0
  );
}

function isClearlySessionOnly(candidate: CanonicalCandidate): boolean {
  if (candidate.scope.applies_to === "current_session_only") {
    return true;
  }
  const combined = `${candidate.canonical_text}\n${candidate.source.evidence_quote}`.toLowerCase();
  return (
    combined.includes("for this answer") ||
    combined.includes("this session only") ||
    combined.includes("current session only") ||
    combined.includes("today only")
  );
}

function hasReusableCompositeStructure(candidate: CanonicalCandidate): boolean {
  const components = extractCompositeComponents(candidate);
  const retainedComponentCount = components.filter(
    (component) => component.promotion !== "blocked",
  ).length;
  if (candidate.artifact_type === "procedure" || candidate.artifact_type === "checklist") {
    return retainedComponentCount >= 2;
  }
  return retainedComponentCount >= 1;
}

export function evaluateCompositeParentRetention(
  candidate: CanonicalCandidate,
): MmV2CompositeParentRetentionDecision | null {
  if (candidate.unit_type !== "composite") {
    return null;
  }

  const components = extractCompositeComponents(candidate);
  const blockedComponentCount = components.filter(
    (component) => component.promotion === "blocked",
  ).length;
  const retainedComponentCount = components.length - blockedComponentCount;

  if (candidate.artifact_type === null) {
    return {
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      retainParent: false,
      exactEvidence: hasExactEvidence(candidate),
      componentCount: components.length,
      retainedComponentCount,
      blockedComponentCount,
      reason: "missing_artifact_type",
    };
  }
  if (!hasExactEvidence(candidate)) {
    return {
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      retainParent: false,
      exactEvidence: false,
      componentCount: components.length,
      retainedComponentCount,
      blockedComponentCount,
      reason: "missing_exact_evidence",
    };
  }
  if (hasSensitiveRiskFlags(candidate)) {
    return {
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      retainParent: false,
      exactEvidence: true,
      componentCount: components.length,
      retainedComponentCount,
      blockedComponentCount,
      reason: "sensitive",
    };
  }
  if (isClearlySessionOnly(candidate)) {
    return {
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      retainParent: false,
      exactEvidence: true,
      componentCount: components.length,
      retainedComponentCount,
      blockedComponentCount,
      reason: "session_only",
    };
  }
  if (!hasReusableCompositeStructure(candidate)) {
    return {
      candidateId: candidate.candidate_id,
      artifactType: candidate.artifact_type,
      retainParent: false,
      exactEvidence: true,
      componentCount: components.length,
      retainedComponentCount,
      blockedComponentCount,
      reason: "fragmentary",
    };
  }

  return {
    candidateId: candidate.candidate_id,
    artifactType: candidate.artifact_type,
    retainParent: true,
    exactEvidence: true,
    componentCount: components.length,
    retainedComponentCount,
    blockedComponentCount,
    reason: "retain",
  };
}

export function shouldComponentEnterStandaloneLane(candidate: CanonicalCandidate): boolean {
  if (candidate.unit_type !== "component") {
    return true;
  }
  return candidate.promotion === "global" || candidate.promotion === "both";
}

export function sanitizeCompositePayloadForRetention(
  candidate: CanonicalCandidate,
): Record<string, unknown> {
  if (candidate.unit_type !== "composite") {
    return candidate.payload;
  }
  const rawComponents = candidate.payload.components;
  if (!Array.isArray(rawComponents)) {
    return candidate.payload;
  }
  return {
    ...candidate.payload,
    components: rawComponents.filter((component) => {
      if (!component || typeof component !== "object") {
        return false;
      }
      return component.promotion !== "blocked";
    }),
  };
}

export function buildCompositePolicySummary(
  candidates: CanonicalCandidate[],
): MmV2CompositePolicySummary {
  const parentRetention = candidates.flatMap((candidate) => {
    const decision = evaluateCompositeParentRetention(candidate);
    return decision ? [decision] : [];
  });

  const childPromotions = candidates.flatMap((candidate) => {
    if (candidate.unit_type !== "composite") {
      return [];
    }
    return extractCompositeComponents(candidate).map((component) => ({
      parentCandidateId: candidate.candidate_id,
      componentId: component.component_id,
      promotion: component.promotion,
      enterStandaloneLane: component.promotion === "global" || component.promotion === "both",
      retainInParent: component.promotion !== "blocked",
    }));
  });

  return {
    parentRetention,
    childPromotions,
  };
}
