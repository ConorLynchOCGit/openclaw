import { z } from "zod";
import { sha256JsonValue, sha256Text } from "./hashing.ts";
import { MemoryKindSchema, type MemoryKind } from "./semantic-schema.ts";

export const SourceAuthorityTierSchema = z.enum([
  "user_authoritative",
  "curated_authoritative",
  "tool_grounded",
  "cited_soft",
  "inspection_only",
]);
export type SourceAuthorityTier = z.infer<typeof SourceAuthorityTierSchema>;

export const SourceProfileIdSchema = z.enum([
  "explicit_user_turn",
  "curated_corpus",
  "curated_repo_doc",
  "manual_note",
  "tool_result_capture",
  "researcher_report_artifact",
  "cited_assistant_answer",
  "daily_continuity",
  "raw_transcript",
  "raw_prompt",
  "raw_tool_log",
  "secret_or_private_phrase",
]);
export type SourceProfileId = z.infer<typeof SourceProfileIdSchema>;

export const RawContentRetentionModeSchema = z.enum([
  "retain_source_text",
  "retain_bounded_excerpt",
  "hash_only",
  "reject",
]);
export type RawContentRetentionMode = z.infer<typeof RawContentRetentionModeSchema>;

export const SourceRiskPolicySchema = z.enum([
  "normal",
  "lower_authority",
  "inspection_only",
  "hard_reject",
]);
export type SourceRiskPolicy = z.infer<typeof SourceRiskPolicySchema>;

export const RetrievalPackEligibilitySchema = z.enum([
  "ordinary_context",
  "research_reference",
  "project_state",
  "conflict",
  "inspection",
]);
export type RetrievalPackEligibility = z.infer<typeof RetrievalPackEligibilitySchema>;

export const AuthorityPromotionRuleSchema = z.enum([
  "explicit_user_approval",
  "higher_authority_replacement",
  "explicit_or_higher_authority",
  "no_promotion",
]);
export type AuthorityPromotionRule = z.infer<typeof AuthorityPromotionRuleSchema>;

export const SoftSourceRiskFlagSchema = z.enum([
  "none",
  "sensitive",
  "prompt_injection_like",
  "raw_prompt",
  "full_transcript",
  "raw_tool_log",
  "secret",
  "private_phrase",
]);
export type SoftSourceRiskFlag = z.infer<typeof SoftSourceRiskFlagSchema>;

export const SOURCE_AUTHORITY_TIERS = SourceAuthorityTierSchema.options;
export const SOURCE_PROFILE_IDS = SourceProfileIdSchema.options;

export type SourceProfile = {
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  allowedMemoryKinds: MemoryKind[];
  rawContentRetentionMode: RawContentRetentionMode;
  riskPolicy: SourceRiskPolicy;
  retrievalPackEligibility: RetrievalPackEligibility[];
  authorityPromotionRule: AuthorityPromotionRule;
  requiresCitations: boolean;
};

const ALL_MEMORY_KINDS: MemoryKind[] = MemoryKindSchema.options;
const FACT_REFERENCE_PROCEDURE: MemoryKind[] = ["fact", "reference", "procedure"];
const CURATED_MEMORY_KINDS: MemoryKind[] = ["fact", "rule", "procedure", "reference"];

export const SOURCE_PROFILE_REGISTRY = {
  explicit_user_turn: {
    sourceProfileId: "explicit_user_turn",
    authorityTier: "user_authoritative",
    allowedMemoryKinds: ALL_MEMORY_KINDS,
    rawContentRetentionMode: "hash_only",
    riskPolicy: "normal",
    retrievalPackEligibility: ["ordinary_context", "research_reference", "project_state"],
    authorityPromotionRule: "explicit_user_approval",
    requiresCitations: false,
  },
  curated_corpus: {
    sourceProfileId: "curated_corpus",
    authorityTier: "curated_authoritative",
    allowedMemoryKinds: CURATED_MEMORY_KINDS,
    rawContentRetentionMode: "retain_source_text",
    riskPolicy: "normal",
    retrievalPackEligibility: ["ordinary_context", "research_reference", "project_state"],
    authorityPromotionRule: "higher_authority_replacement",
    requiresCitations: true,
  },
  curated_repo_doc: {
    sourceProfileId: "curated_repo_doc",
    authorityTier: "curated_authoritative",
    allowedMemoryKinds: CURATED_MEMORY_KINDS,
    rawContentRetentionMode: "retain_source_text",
    riskPolicy: "normal",
    retrievalPackEligibility: ["ordinary_context", "research_reference", "project_state"],
    authorityPromotionRule: "higher_authority_replacement",
    requiresCitations: true,
  },
  manual_note: {
    sourceProfileId: "manual_note",
    authorityTier: "curated_authoritative",
    allowedMemoryKinds: CURATED_MEMORY_KINDS,
    rawContentRetentionMode: "retain_source_text",
    riskPolicy: "normal",
    retrievalPackEligibility: ["ordinary_context", "research_reference", "project_state"],
    authorityPromotionRule: "explicit_or_higher_authority",
    requiresCitations: false,
  },
  tool_result_capture: {
    sourceProfileId: "tool_result_capture",
    authorityTier: "tool_grounded",
    allowedMemoryKinds: FACT_REFERENCE_PROCEDURE,
    rawContentRetentionMode: "hash_only",
    riskPolicy: "lower_authority",
    retrievalPackEligibility: ["research_reference", "project_state", "conflict"],
    authorityPromotionRule: "explicit_or_higher_authority",
    requiresCitations: true,
  },
  researcher_report_artifact: {
    sourceProfileId: "researcher_report_artifact",
    authorityTier: "cited_soft",
    allowedMemoryKinds: FACT_REFERENCE_PROCEDURE,
    rawContentRetentionMode: "retain_bounded_excerpt",
    riskPolicy: "lower_authority",
    retrievalPackEligibility: ["research_reference", "project_state", "conflict"],
    authorityPromotionRule: "explicit_or_higher_authority",
    requiresCitations: true,
  },
  cited_assistant_answer: {
    sourceProfileId: "cited_assistant_answer",
    authorityTier: "cited_soft",
    allowedMemoryKinds: FACT_REFERENCE_PROCEDURE,
    rawContentRetentionMode: "hash_only",
    riskPolicy: "lower_authority",
    retrievalPackEligibility: ["research_reference", "project_state", "conflict"],
    authorityPromotionRule: "explicit_or_higher_authority",
    requiresCitations: true,
  },
  daily_continuity: {
    sourceProfileId: "daily_continuity",
    authorityTier: "cited_soft",
    allowedMemoryKinds: FACT_REFERENCE_PROCEDURE,
    rawContentRetentionMode: "hash_only",
    riskPolicy: "lower_authority",
    retrievalPackEligibility: ["research_reference", "project_state", "conflict"],
    authorityPromotionRule: "explicit_or_higher_authority",
    requiresCitations: false,
  },
  raw_transcript: {
    sourceProfileId: "raw_transcript",
    authorityTier: "inspection_only",
    allowedMemoryKinds: [],
    rawContentRetentionMode: "hash_only",
    riskPolicy: "inspection_only",
    retrievalPackEligibility: ["inspection"],
    authorityPromotionRule: "no_promotion",
    requiresCitations: false,
  },
  raw_prompt: {
    sourceProfileId: "raw_prompt",
    authorityTier: "inspection_only",
    allowedMemoryKinds: [],
    rawContentRetentionMode: "hash_only",
    riskPolicy: "inspection_only",
    retrievalPackEligibility: ["inspection"],
    authorityPromotionRule: "no_promotion",
    requiresCitations: false,
  },
  raw_tool_log: {
    sourceProfileId: "raw_tool_log",
    authorityTier: "inspection_only",
    allowedMemoryKinds: [],
    rawContentRetentionMode: "hash_only",
    riskPolicy: "inspection_only",
    retrievalPackEligibility: ["inspection"],
    authorityPromotionRule: "no_promotion",
    requiresCitations: false,
  },
  secret_or_private_phrase: {
    sourceProfileId: "secret_or_private_phrase",
    authorityTier: "inspection_only",
    allowedMemoryKinds: [],
    rawContentRetentionMode: "reject",
    riskPolicy: "hard_reject",
    retrievalPackEligibility: [],
    authorityPromotionRule: "no_promotion",
    requiresCitations: false,
  },
} as const satisfies Record<SourceProfileId, SourceProfile>;

export const SourceAuthorityMetadataSchema = z
  .object({
    sourceProfileId: SourceProfileIdSchema,
    authorityTier: SourceAuthorityTierSchema,
    allowedMemoryKinds: z.array(MemoryKindSchema),
    rawContentRetentionMode: RawContentRetentionModeSchema,
    riskPolicy: SourceRiskPolicySchema,
    retrievalPackEligibility: z.array(RetrievalPackEligibilitySchema),
    authorityPromotionRule: AuthorityPromotionRuleSchema,
  })
  .strict();
export type SourceAuthorityMetadata = z.infer<typeof SourceAuthorityMetadataSchema>;

export const SoftSourceRefSchema = z
  .object({
    sourceId: z.string().trim().min(1),
    segmentId: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    artifactPath: z.string().trim().min(1).optional(),
    contentHash: z.string().trim().min(1).optional(),
  })
  .strict();
export type SoftSourceRef = z.infer<typeof SoftSourceRefSchema>;

export type SoftSourceCandidate = {
  candidateId: string;
  kind: MemoryKind;
  sourceProfileId: SourceProfileId;
  sourceRefs: SoftSourceRef[];
  riskFlags?: SoftSourceRiskFlag[];
  authorityTier?: SourceAuthorityTier;
  capturesAssistantProseAsAuthority?: boolean;
};

export type LiveTurnSourceAuthorityClassification = {
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  metadata: SourceAuthorityMetadata;
  sourceRefs: SoftSourceRef[];
  decision: SoftSourceAdmissionDecision["decision"];
  reasonCodes: string[];
};

export type SoftSourceAdmissionDecision =
  | {
      decision: "auto_admit";
      authorityTier: SourceAuthorityTier;
      sourceProfileId: SourceProfileId;
      reasonCodes: string[];
    }
  | {
      decision: "manual_review" | "inspection_only" | "reject";
      authorityTier: SourceAuthorityTier;
      sourceProfileId: SourceProfileId;
      reasonCodes: string[];
      redactedFinding?: RedactedSafetyFinding;
    };

export type AuthorityPromotionBasis =
  | "corroboration"
  | "explicit_user_approval"
  | "higher_authority_replacement";

export type AuthorityPromotionDecision = {
  promoted: boolean;
  authorityTier: SourceAuthorityTier;
  confidenceMayIncrease: boolean;
  reasonCode: string;
};

export type RedactedSafetyFinding = {
  findingType:
    | "inspection_only_source"
    | "hard_reject_source"
    | "prompt_injection_like"
    | "sensitive_source";
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  riskFlags: SoftSourceRiskFlag[];
  rawContentSha256?: string;
  rawContentCharCount?: number;
  reasonCodes: string[];
};

const AUTHORITY_RANK: Record<SourceAuthorityTier, number> = {
  inspection_only: 0,
  cited_soft: 1,
  tool_grounded: 2,
  curated_authoritative: 3,
  user_authoritative: 4,
};

const HARD_REJECT_FLAGS = new Set<SoftSourceRiskFlag>([
  "raw_prompt",
  "full_transcript",
  "raw_tool_log",
  "secret",
  "private_phrase",
]);

export function getSourceProfile(sourceProfileId: SourceProfileId): SourceProfile {
  return SOURCE_PROFILE_REGISTRY[sourceProfileId];
}

export function buildSourceAuthorityMetadata(
  sourceProfileId: SourceProfileId,
): SourceAuthorityMetadata {
  const profile = getSourceProfile(sourceProfileId);
  return {
    sourceProfileId: profile.sourceProfileId,
    authorityTier: profile.authorityTier,
    allowedMemoryKinds: [...profile.allowedMemoryKinds],
    rawContentRetentionMode: profile.rawContentRetentionMode,
    riskPolicy: profile.riskPolicy,
    retrievalPackEligibility: [...profile.retrievalPackEligibility],
    authorityPromotionRule: profile.authorityPromotionRule,
  };
}

export function validateSourceAuthorityMetadata(
  value: unknown,
): { ok: true; metadata: SourceAuthorityMetadata } | { ok: false; errors: string[] } {
  const parsed = SourceAuthorityMetadataSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }
  const expected = buildSourceAuthorityMetadata(parsed.data.sourceProfileId);
  const errors: string[] = [];
  if (parsed.data.authorityTier !== expected.authorityTier) {
    errors.push("authorityTier does not match sourceProfileId default");
  }
  for (const kind of parsed.data.allowedMemoryKinds) {
    if (!expected.allowedMemoryKinds.includes(kind)) {
      errors.push(`allowedMemoryKinds contains disallowed kind ${kind}`);
    }
  }
  if (parsed.data.rawContentRetentionMode !== expected.rawContentRetentionMode) {
    errors.push("rawContentRetentionMode does not match sourceProfileId default");
  }
  if (parsed.data.riskPolicy !== expected.riskPolicy) {
    errors.push("riskPolicy does not match sourceProfileId default");
  }
  return errors.length === 0 ? { ok: true, metadata: parsed.data } : { ok: false, errors };
}

export function attachSourceAuthorityMetadata(
  sourceMetadata: Record<string, unknown> | undefined,
  sourceProfileId: SourceProfileId,
): Record<string, unknown> {
  return {
    ...sourceMetadata,
    sourceAuthority: buildSourceAuthorityMetadata(sourceProfileId),
  };
}

function normalizeLiveTurnText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function sourceRefContentHash(value: string): string {
  return sha256Text(normalizeLiveTurnText(value).toLowerCase());
}

function detectCitationRefs(text: string): SoftSourceRef[] {
  const normalized = normalizeLiveTurnText(text);
  const citationMatch = normalized.match(
    /\b(?:citation|citations|source ref|source refs|source|sources)\s*:\s*([\s\S]+)$/iu,
  );
  const citationText = citationMatch?.[1]?.trim();
  if (!citationText) {
    return [];
  }
  const urls = [...citationText.matchAll(/https?:\/\/[^\s,;)]+/giu)].map((match) => match[0]);
  const refs = urls.length > 0 ? urls : [citationText];
  return refs.map((ref, index) => ({
    sourceId: `live-soft-source-${sourceRefContentHash(ref).slice(0, 16)}-${index}`,
    url: /^https?:\/\//iu.test(ref) ? ref : undefined,
    contentHash: sourceRefContentHash(ref),
  }));
}

function classifySoftSourceProfile(text: string): SourceProfileId | undefined {
  const normalized = normalizeLiveTurnText(text).toLowerCase();
  if (/\bresearcher\s+report(?:\s+artifact)?\b/u.test(normalized)) {
    return "researcher_report_artifact";
  }
  if (/\bcited\s+assistant\s+answer\b/u.test(normalized)) {
    return "cited_assistant_answer";
  }
  if (/\bcited\s+soft(?:\s+evidence|\s+source)?\b/u.test(normalized)) {
    return "researcher_report_artifact";
  }
  return undefined;
}

function hasExplicitUserMemorySignal(text: string): boolean {
  const normalized = normalizeLiveTurnText(text).toLowerCase();
  return (
    /\bplease\s+remember\b/u.test(normalized) ||
    /\bremember\s+this\b/u.test(normalized) ||
    /\bremember\s+that\b/u.test(normalized) ||
    /\bstore\s+this\b/u.test(normalized) ||
    /\bdurable\s+(?:workspace\s+)?(?:project\s+)?fact\b/u.test(normalized) ||
    /\bdurable\s+correction\b/u.test(normalized) ||
    /\bstanding\s+(?:instruction|preference|directive)\b/u.test(normalized)
  );
}

function classifyInspectionOrRejectProfile(text: string): SourceProfileId | undefined {
  const normalized = normalizeLiveTurnText(text).toLowerCase();
  if (/\b(?:secret|private phrase|credential|api key|password)\b/u.test(normalized)) {
    return "secret_or_private_phrase";
  }
  if (/\braw\s+tool\s+log\b/u.test(normalized)) {
    return "raw_tool_log";
  }
  if (/\bfull\s+transcript|raw\s+transcript\b/u.test(normalized)) {
    return "raw_transcript";
  }
  if (/\braw\s+prompt\b/u.test(normalized)) {
    return "raw_prompt";
  }
  return undefined;
}

export function classifyLiveTurnSourceAuthority(
  text: string,
): LiveTurnSourceAuthorityClassification | null {
  const inspectionProfileId = classifyInspectionOrRejectProfile(text);
  if (inspectionProfileId) {
    const metadata = buildSourceAuthorityMetadata(inspectionProfileId);
    const decision =
      metadata.riskPolicy === "hard_reject"
        ? evaluateSoftSourceAdmission({
            candidateId: `live-turn-${sourceRefContentHash(text).slice(0, 16)}`,
            kind: "fact",
            sourceProfileId: inspectionProfileId,
            sourceRefs: [],
            riskFlags: ["private_phrase"],
          }).decision
        : "inspection_only";
    return {
      sourceProfileId: inspectionProfileId,
      authorityTier: metadata.authorityTier,
      metadata,
      sourceRefs: [],
      decision,
      reasonCodes: [decision === "reject" ? "hard_reject" : "inspection_only"],
    };
  }

  const softProfileId = classifySoftSourceProfile(text);
  if (softProfileId) {
    const sourceRefs = detectCitationRefs(text);
    const admission = evaluateSoftSourceAdmission({
      candidateId: `live-turn-${sourceRefContentHash(text).slice(0, 16)}`,
      kind: "fact",
      sourceProfileId: softProfileId,
      sourceRefs,
      capturesAssistantProseAsAuthority: softProfileId === "cited_assistant_answer",
    });
    return {
      sourceProfileId: softProfileId,
      authorityTier: admission.authorityTier,
      metadata: buildSourceAuthorityMetadata(softProfileId),
      sourceRefs,
      decision: admission.decision,
      reasonCodes: admission.reasonCodes,
    };
  }

  if (hasExplicitUserMemorySignal(text)) {
    const metadata = buildSourceAuthorityMetadata("explicit_user_turn");
    return {
      sourceProfileId: "explicit_user_turn",
      authorityTier: metadata.authorityTier,
      metadata,
      sourceRefs: [],
      decision: "auto_admit",
      reasonCodes: ["explicit_user_turn"],
    };
  }

  return null;
}

function hasHardRejectFlag(riskFlags: SoftSourceRiskFlag[]): boolean {
  return riskFlags.some((flag) => HARD_REJECT_FLAGS.has(flag));
}

function buildRedactedFinding(input: {
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  riskFlags: SoftSourceRiskFlag[];
  rawContent?: string;
  reasonCodes: string[];
}): RedactedSafetyFinding {
  const findingType = input.reasonCodes.includes("hard_reject")
    ? "hard_reject_source"
    : input.riskFlags.includes("prompt_injection_like")
      ? "prompt_injection_like"
      : input.riskFlags.includes("sensitive")
        ? "sensitive_source"
        : "inspection_only_source";
  return {
    findingType,
    sourceProfileId: input.sourceProfileId,
    authorityTier: input.authorityTier,
    riskFlags: input.riskFlags,
    rawContentSha256: input.rawContent ? sha256Text(input.rawContent) : undefined,
    rawContentCharCount: input.rawContent?.length,
    reasonCodes: input.reasonCodes,
  };
}

export function evaluateSoftSourceAdmission(
  candidate: SoftSourceCandidate,
  options: { rawContentForRedactedFinding?: string } = {},
): SoftSourceAdmissionDecision {
  const profile = getSourceProfile(candidate.sourceProfileId);
  const authorityTier = candidate.authorityTier ?? profile.authorityTier;
  const riskFlags = candidate.riskFlags ?? [];
  const sourceRefs = candidate.sourceRefs.map((sourceRef) => SoftSourceRefSchema.parse(sourceRef));

  if (authorityTier !== profile.authorityTier) {
    return {
      decision: "reject",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes: ["authority_tier_profile_mismatch"],
    };
  }

  if (profile.riskPolicy === "hard_reject" || hasHardRejectFlag(riskFlags)) {
    const reasonCodes = ["hard_reject"];
    return {
      decision: "reject",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes,
      redactedFinding: buildRedactedFinding({
        sourceProfileId: candidate.sourceProfileId,
        authorityTier,
        riskFlags,
        rawContent: options.rawContentForRedactedFinding,
        reasonCodes,
      }),
    };
  }

  if (!profile.allowedMemoryKinds.includes(candidate.kind)) {
    return {
      decision: profile.riskPolicy === "inspection_only" ? "inspection_only" : "reject",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes: ["kind_not_allowed_for_source_profile"],
    };
  }

  if (profile.requiresCitations && sourceRefs.length === 0) {
    return {
      decision: "reject",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes: ["citation_required"],
    };
  }

  if (
    candidate.sourceProfileId === "cited_assistant_answer" &&
    candidate.capturesAssistantProseAsAuthority
  ) {
    return {
      decision: "reject",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes: ["assistant_prose_is_not_authority"],
    };
  }

  if (profile.riskPolicy === "inspection_only" || riskFlags.includes("prompt_injection_like")) {
    const reasonCodes = ["inspection_only"];
    return {
      decision: "inspection_only",
      authorityTier,
      sourceProfileId: candidate.sourceProfileId,
      reasonCodes,
      redactedFinding: buildRedactedFinding({
        sourceProfileId: candidate.sourceProfileId,
        authorityTier,
        riskFlags,
        rawContent: options.rawContentForRedactedFinding,
        reasonCodes,
      }),
    };
  }

  return {
    decision: "auto_admit",
    authorityTier,
    sourceProfileId: candidate.sourceProfileId,
    reasonCodes:
      profile.riskPolicy === "lower_authority" ? ["lower_authority_auto_admit"] : ["auto_admit"],
  };
}

export function decideAuthorityPromotion(input: {
  currentAuthorityTier: SourceAuthorityTier;
  proposedAuthorityTier: SourceAuthorityTier;
  basis: AuthorityPromotionBasis;
}): AuthorityPromotionDecision {
  if (input.basis === "corroboration") {
    return {
      promoted: false,
      authorityTier: input.currentAuthorityTier,
      confidenceMayIncrease: true,
      reasonCode: "corroboration_does_not_promote_authority",
    };
  }

  const proposedIsHigher =
    AUTHORITY_RANK[input.proposedAuthorityTier] > AUTHORITY_RANK[input.currentAuthorityTier];
  if (input.basis === "explicit_user_approval" || proposedIsHigher) {
    return {
      promoted: true,
      authorityTier: input.proposedAuthorityTier,
      confidenceMayIncrease: true,
      reasonCode:
        input.basis === "explicit_user_approval"
          ? "explicit_user_approval"
          : "higher_authority_replacement",
    };
  }

  return {
    promoted: false,
    authorityTier: input.currentAuthorityTier,
    confidenceMayIncrease: false,
    reasonCode: "no_higher_authority_source",
  };
}

export function sourceAuthorityFingerprint(value: unknown): string {
  return sha256JsonValue(value);
}
