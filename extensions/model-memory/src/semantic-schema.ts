import { z } from "zod";

export const CanonicalClassSchema = z.enum(["user", "feedback", "project", "reference"]);
export type CanonicalClass = z.infer<typeof CanonicalClassSchema>;

export const MemoryKindSchema = z.enum(["preference", "fact", "rule", "procedure", "reference"]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const ConfidenceSchema = z.enum(["weak", "medium", "strong"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const DurabilitySchema = z.enum(["ephemeral", "durable"]);
export type Durability = z.infer<typeof DurabilitySchema>;

export const ReviewModeSchema = z.enum(["auto_accept", "manual_review", "suppress"]);
export type ReviewMode = z.infer<typeof ReviewModeSchema>;

export const RationaleCodeSchema = z.enum([
  "audited_fixture",
  "validation_normalized",
  "repair_retry",
  "policy_override",
  "duplicate_identity",
  "slot_supersession",
  "manual_review_suggested",
  "suppress_suggested",
  "materialized",
  "artifact_built",
]);
export type RationaleCode = z.infer<typeof RationaleCodeSchema>;

export const MemoryScopeSchema = z
  .object({
    projectId: z.string().trim().min(1).optional(),
    projectScope: z.string().trim().min(1).optional(),
    workflowScope: z.string().trim().min(1).optional(),
    userScope: z.string().trim().min(1).optional(),
    contextualDependencies: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const ProvenanceSpanSchema = z
  .object({
    sourceId: z.string().trim().min(1),
    blockId: z.string().trim().min(1).optional(),
    segmentIndex: z.number().int().min(0).optional(),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
    headingPath: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.blockId && value.segmentIndex === undefined && value.lineStart === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "provenance span requires blockId, segmentIndex, or lineStart",
        path: ["blockId"],
      });
    }
    if ((value.lineStart === undefined) !== (value.lineEnd === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lineStart and lineEnd must be provided together",
        path: ["lineStart"],
      });
    }
    if (
      value.lineStart !== undefined &&
      value.lineEnd !== undefined &&
      value.lineEnd < value.lineStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lineEnd must be greater than or equal to lineStart",
        path: ["lineEnd"],
      });
    }
  });
export type ProvenanceSpan = z.infer<typeof ProvenanceSpanSchema>;

export const ProvenanceSchema = z.array(ProvenanceSpanSchema).min(1);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const PreferencePayloadSchema = z
  .object({
    subject: z.string().trim().min(1),
    instruction: z.string().trim().min(1),
    operation: z.string().trim().min(1),
  })
  .strict();
export type PreferencePayload = z.infer<typeof PreferencePayloadSchema>;

export const FactPayloadSchema = z
  .object({
    subject: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .strict();
export type FactPayload = z.infer<typeof FactPayloadSchema>;

export const RulePayloadSchema = z
  .object({
    subject: z.string().trim().min(1),
    recommendedAction: z.string().trim().min(1).optional(),
    avoidAction: z.string().trim().min(1).optional(),
    neededCapability: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.recommendedAction && !value.avoidAction && !value.neededCapability) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rule payload requires recommendedAction, avoidAction, or neededCapability",
      });
    }
  });
export type RulePayload = z.infer<typeof RulePayloadSchema>;

export const ProcedurePayloadSchema = z
  .object({
    title: z.string().trim().min(1),
    steps: z.array(z.string().trim().min(1)).min(1),
    successShape: z.string().trim().min(1).optional(),
    failureShape: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProcedurePayload = z.infer<typeof ProcedurePayloadSchema>;

export const ReferencePayloadSchema = z
  .object({
    task: z.string().trim().min(1),
    primaryResource: z.string().trim().min(1),
    companionResources: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();
export type ReferencePayload = z.infer<typeof ReferencePayloadSchema>;

const BaseObjectShape = {
  id: z.string().uuid().optional(),
  scope: MemoryScopeSchema.optional(),
  provenance: ProvenanceSchema,
  confidence: ConfidenceSchema,
  durability: DurabilitySchema,
  reviewMode: ReviewModeSchema,
  rationaleCodes: z.array(RationaleCodeSchema).optional(),
} as const;

export const PreferenceMemoryObjectSchema = z
  .object({
    ...BaseObjectShape,
    canonicalClass: z.literal("user"),
    kind: z.literal("preference"),
    payload: PreferencePayloadSchema,
  })
  .strict();

export const FactMemoryObjectSchema = z
  .object({
    ...BaseObjectShape,
    canonicalClass: z.literal("project"),
    kind: z.literal("fact"),
    payload: FactPayloadSchema,
  })
  .strict();

export const RuleMemoryObjectSchema = z
  .object({
    ...BaseObjectShape,
    canonicalClass: z.enum(["user", "feedback", "project"]),
    kind: z.literal("rule"),
    payload: RulePayloadSchema,
  })
  .strict();

export const ProcedureMemoryObjectSchema = z
  .object({
    ...BaseObjectShape,
    canonicalClass: z.literal("feedback"),
    kind: z.literal("procedure"),
    payload: ProcedurePayloadSchema,
  })
  .strict();

export const ReferenceMemoryObjectSchema = z
  .object({
    ...BaseObjectShape,
    canonicalClass: z.literal("reference"),
    kind: z.literal("reference"),
    payload: ReferencePayloadSchema,
  })
  .strict();

export const ModelMemoryObjectSchema = z.discriminatedUnion("kind", [
  PreferenceMemoryObjectSchema,
  FactMemoryObjectSchema,
  RuleMemoryObjectSchema,
  ProcedureMemoryObjectSchema,
  ReferenceMemoryObjectSchema,
]);

export type ModelMemoryObject = z.infer<typeof ModelMemoryObjectSchema>;
export type PreferenceMemoryObject = z.infer<typeof PreferenceMemoryObjectSchema>;
export type FactMemoryObject = z.infer<typeof FactMemoryObjectSchema>;
export type RuleMemoryObject = z.infer<typeof RuleMemoryObjectSchema>;
export type ProcedureMemoryObject = z.infer<typeof ProcedureMemoryObjectSchema>;
export type ReferenceMemoryObject = z.infer<typeof ReferenceMemoryObjectSchema>;

export const EXCLUDED_LEGACY_RUNTIME_FIELDS = [
  "factFieldKey",
  "responseStyleFamily",
  "procedureFamily",
  "lessonFamily",
  "guidancePattern",
  "compatibilityCategory",
  "ruleSubtype",
] as const;
