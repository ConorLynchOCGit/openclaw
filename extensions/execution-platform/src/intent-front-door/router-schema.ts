import { z } from "zod";

export const CANONICAL_ROUTER_SCHEMA_VERSION = "intent-front-door.router-schema.v1";
export const ROUTER_OBJECTIVE_SUMMARY_MAX_CHARS = 1_000;
export const ROUTER_REASON_CODE_MAX_COUNT = 30;
export const ROUTER_ACTION_MAX_COUNT = 20;
export const ROUTER_CHILD_WORKFLOW_MAX_COUNT = 10;
export const ROUTER_MULTI_INTENT_STEP_MAX_COUNT = 12;
export const ROUTER_OBJECT_SUMMARY_MAX_CHARS = 300;

export const CANONICAL_INTENT_ROUTES = [
  "chat_response",
  "status_response",
  "plan_only",
  "workflow_execution",
  "multi_workflow_plan",
  "research_only",
  "work_queue_control",
  "clarification_required",
  "blocked",
  "needs_review",
  "product_spec_planning",
] as const;

export const CANONICAL_RESPONSE_MODES = [
  "answer_in_chat",
  "ask_clarification",
  "create_runtime_job",
  "create_plan_only",
  "apply_control",
  "block",
  "create_product_spec_planning",
] as const;

export const CANONICAL_ACTION_CATEGORIES = [
  "chat",
  "status",
  "research",
  "plan",
  "code_edit",
  "test",
  "review",
  "docs_update",
  "install_dependency",
  "deploy",
  "outbound_send",
  "model_eval",
  "model_promotion",
  "work_queue_control",
  "closeout",
  "product_spec_planning",
] as const;

export const CANONICAL_ROUTER_CAPABILITIES = [
  "chat",
  "status",
  "research",
  "plan",
  "code_edit",
  "test",
  "review",
  "docs_update",
  "work_queue_projection_update",
  "action_graph_proposal",
  "runtime_job_compile",
  "human_decision",
  "closeout",
] as const;

export const CANONICAL_RISK_CLASSES = ["low", "medium", "high", "critical"] as const;

export const CANONICAL_SIDE_EFFECT_CLASSES = [
  "none",
  "read_only",
  "code_edit",
  "install_dependency",
  "outbound_readonly",
  "external_outbound_write",
  "deploy_dry_run",
  "production_side_effect",
  "production_model_promotion",
] as const;

export type CanonicalIntentRoute = (typeof CANONICAL_INTENT_ROUTES)[number];
export type CanonicalResponseMode = (typeof CANONICAL_RESPONSE_MODES)[number];
export type CanonicalActionCategory = (typeof CANONICAL_ACTION_CATEGORIES)[number];
export type CanonicalRouterCapability = (typeof CANONICAL_ROUTER_CAPABILITIES)[number];
export type CanonicalRiskClass = (typeof CANONICAL_RISK_CLASSES)[number];
export type CanonicalSideEffectClass = (typeof CANONICAL_SIDE_EFFECT_CLASSES)[number];

const boundedReasonCodeSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9_.:-]+$/u);

export const canonicalRouterActionSchema = z
  .object({
    action: z.enum(CANONICAL_ACTION_CATEGORIES),
    objectSummary: z.string().min(0).max(ROUTER_OBJECT_SUMMARY_MAX_CHARS),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const canonicalRouterTargetRefSchema = z
  .object({
    targetKind: z.string().min(1).max(80),
    targetRef: z.string().min(1).max(240),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const canonicalRouterConstraintSchema = z
  .object({
    constraintKind: z.string().min(1).max(80),
    objectSummary: z.string().min(0).max(ROUTER_OBJECT_SUMMARY_MAX_CHARS),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const canonicalChildWorkflowRequestSchema = z
  .object({
    childWorkflowId: z.string().min(3).max(120),
    requirement: z.enum(["mandatory", "optional"]),
    reasonCodes: z.array(boundedReasonCodeSchema).max(ROUTER_REASON_CODE_MAX_COUNT),
    requestedAuthority: z.string().min(1).max(120).nullable(),
    boundedInputSummary: z.string().min(0).max(600),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .strict();

export const canonicalMultiIntentPlanStepSchema = z
  .object({
    order: z.number().int().min(1).max(100),
    route: z.enum([
      "chat_response",
      "plan_only",
      "workflow_execution",
      "research_only",
      "work_queue_control",
      "approval_required",
    ]),
    workflowId: z.string().min(3).max(120).nullable(),
    objectiveSummary: z.string().min(0).max(600),
    dependsOnStep: z.number().int().min(1).max(100).nullable(),
    authorityProfile: z.string().min(1).max(120).nullable(),
  })
  .strict();

export const canonicalRouterAmbiguitySchema = z
  .object({
    ambiguous: z.boolean(),
    missingInputs: z.array(z.string().min(1).max(120)).max(20),
    conflictingInstructions: z.array(z.string().min(1).max(180)).max(20),
    clarificationQuestion: z.string().min(1).max(500).nullable(),
  })
  .strict();

export const canonicalRouterOutputSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_ROUTER_SCHEMA_VERSION).optional(),
    route: z.enum(CANONICAL_INTENT_ROUTES),
    executeNow: z.boolean(),
    executorWorkflowId: z.string().min(3).max(120).nullable(),
    subjectWorkflowIds: z.array(z.string().min(3).max(120)).max(20),
    targetSubjectRefs: z.array(canonicalRouterTargetRefSchema).max(20),
    requestedCapabilities: z.array(z.enum(CANONICAL_ROUTER_CAPABILITIES)).max(20),
    constraints: z.array(canonicalRouterConstraintSchema).max(30),
    selectedExecutionReason: z.string().min(0).max(500),
    targetSubjectReason: z.string().min(0).max(500),
    /**
     * Compatibility alias for older clients. Production compile/validation uses
     * executorWorkflowId; workflowId must either match executorWorkflowId or be null.
     */
    workflowId: z.string().min(3).max(120).nullable(),
    jobType: z.string().min(3).max(120).nullable(),
    confidence: z.number().min(0).max(1),
    objectiveSummary: z.string().min(0).max(ROUTER_OBJECTIVE_SUMMARY_MAX_CHARS),
    responseMode: z.enum(CANONICAL_RESPONSE_MODES),
    mentionedActions: z.array(canonicalRouterActionSchema).max(ROUTER_ACTION_MAX_COUNT),
    requestedActions: z.array(canonicalRouterActionSchema).max(ROUTER_ACTION_MAX_COUNT),
    negatedActions: z.array(canonicalRouterActionSchema).max(ROUTER_ACTION_MAX_COUNT),
    conditionalActions: z.array(canonicalRouterActionSchema).max(ROUTER_ACTION_MAX_COUNT),
    requestedAuthority: z.string().min(1).max(120).nullable(),
    requiresApproval: z.boolean(),
    approvalKind: z.string().min(1).max(120).nullable(),
    riskClass: z.enum(CANONICAL_RISK_CLASSES),
    sideEffectClass: z.enum(CANONICAL_SIDE_EFFECT_CLASSES),
    targetRefs: z.array(canonicalRouterTargetRefSchema).max(20),
    activeJobRefs: z.array(z.string().min(1).max(240)).max(20),
    childWorkflowRequests: z
      .array(canonicalChildWorkflowRequestSchema)
      .max(ROUTER_CHILD_WORKFLOW_MAX_COUNT),
    multiIntentPlan: z
      .array(canonicalMultiIntentPlanStepSchema)
      .max(ROUTER_MULTI_INTENT_STEP_MAX_COUNT),
    ambiguity: canonicalRouterAmbiguitySchema,
    reasonCodes: z.array(boundedReasonCodeSchema).max(ROUTER_REASON_CODE_MAX_COUNT),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.route === "workflow_execution") {
      if (!value.executorWorkflowId) {
        context.addIssue({
          code: "custom",
          message: "workflow_execution_requires_executor_workflow_id",
          path: ["executorWorkflowId"],
        });
      }
      if (!value.workflowId) {
        context.addIssue({
          code: "custom",
          message: "workflow_execution_requires_legacy_workflow_id_alias",
          path: ["workflowId"],
        });
      }
      if (
        value.workflowId &&
        value.executorWorkflowId &&
        value.workflowId !== value.executorWorkflowId
      ) {
        context.addIssue({
          code: "custom",
          message: "workflow_id_must_match_executor_workflow_id",
          path: ["workflowId"],
        });
      }
      if (!value.jobType) {
        context.addIssue({
          code: "custom",
          message: "workflow_execution_requires_job_type",
          path: ["jobType"],
        });
      }
      if (value.responseMode !== "create_runtime_job") {
        context.addIssue({
          code: "custom",
          message: "workflow_execution_requires_create_runtime_job_response_mode",
          path: ["responseMode"],
        });
      }
    }
    if (
      ["chat_response", "status_response", "blocked", "clarification_required"].includes(
        value.route,
      ) &&
      value.executeNow
    ) {
      context.addIssue({
        code: "custom",
        message: "non_execution_route_must_not_execute_now",
        path: ["executeNow"],
      });
    }
    if (value.route === "clarification_required" && !value.ambiguity.clarificationQuestion) {
      context.addIssue({
        code: "custom",
        message: "clarification_route_requires_question",
        path: ["ambiguity", "clarificationQuestion"],
      });
    }
    if (value.route === "work_queue_control" && value.responseMode !== "apply_control") {
      context.addIssue({
        code: "custom",
        message: "work_queue_control_requires_apply_control_response_mode",
        path: ["responseMode"],
      });
    }
    if (value.route === "multi_workflow_plan" && value.multiIntentPlan.length === 0) {
      context.addIssue({
        code: "custom",
        message: "multi_workflow_plan_requires_steps",
        path: ["multiIntentPlan"],
      });
    }
  });

export type CanonicalRouterAction = z.infer<typeof canonicalRouterActionSchema>;
export type CanonicalRouterTargetRef = z.infer<typeof canonicalRouterTargetRefSchema>;
export type CanonicalRouterConstraint = z.infer<typeof canonicalRouterConstraintSchema>;
export type CanonicalChildWorkflowRequest = z.infer<typeof canonicalChildWorkflowRequestSchema>;
export type CanonicalMultiIntentPlanStep = z.infer<typeof canonicalMultiIntentPlanStepSchema>;
export type CanonicalRouterOutput = z.infer<typeof canonicalRouterOutputSchema>;

export type CanonicalRouterSchemaIssue = {
  path: string;
  message: string;
  code: string;
  allowedValues?: string[];
};

export type CanonicalRouterParseResult = {
  valid: boolean;
  output: CanonicalRouterOutput | null;
  reasonCodes: string[];
  schemaIssues: CanonicalRouterSchemaIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundRouterText(value: unknown, maxChars: number): { value: unknown; changed: boolean } {
  if (typeof value !== "string" || value.length <= maxChars) {
    return { value, changed: false };
  }
  return { value: value.slice(0, maxChars), changed: true };
}

function boundObjectSummaryArray(value: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }
  let changed = false;
  const next = value.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const summary = boundRouterText(entry.objectSummary, ROUTER_OBJECT_SUMMARY_MAX_CHARS);
    if (!summary.changed) {
      return entry;
    }
    changed = true;
    return { ...entry, objectSummary: summary.value };
  });
  return { value: next, changed };
}

function normalizeModelAuthoredRouterBounds(value: unknown): {
  value: unknown;
  reasonCodes: string[];
} {
  if (!isRecord(value)) {
    return { value, reasonCodes: [] };
  }
  const candidate: Record<string, unknown> = { ...value };
  const reasonCodes: string[] = [];
  for (const key of [
    "mentionedActions",
    "requestedActions",
    "negatedActions",
    "conditionalActions",
    "constraints",
  ]) {
    const bounded = boundObjectSummaryArray(candidate[key]);
    if (bounded.changed) {
      candidate[key] = bounded.value;
      reasonCodes.push(`canonical_router_${key}_object_summary_bounded`);
    }
  }
  return { value: candidate, reasonCodes };
}

export function parseCanonicalRouterOutput(value: unknown): CanonicalRouterParseResult {
  const parsed = canonicalRouterOutputSchema.safeParse(value);
  if (parsed.success) {
    return { valid: true, output: parsed.data, reasonCodes: [], schemaIssues: [] };
  }
  const normalized = normalizeModelAuthoredRouterBounds(value);
  if (normalized.reasonCodes.length > 0) {
    const repaired = canonicalRouterOutputSchema.safeParse(normalized.value);
    if (repaired.success) {
      return {
        valid: true,
        output: repaired.data,
        reasonCodes: ["canonical_router_output_bounds_repaired", ...normalized.reasonCodes],
        schemaIssues: [],
      };
    }
  }
  return {
    valid: false,
    output: null,
    reasonCodes: parsed.error.issues.map((issue) => `canonical_router_schema_${issue.message}`),
    schemaIssues: parsed.error.issues.map((issue) => {
      const candidate = issue as typeof issue & { options?: unknown };
      return {
        path: issue.path.length > 0 ? issue.path.join(".") : "$",
        message: issue.message,
        code: issue.code,
        ...(Array.isArray(candidate.options) &&
        candidate.options.every((option) => typeof option === "string")
          ? { allowedValues: candidate.options.slice(0, 40) }
          : {}),
      };
    }),
  };
}

export function createCanonicalRouterAction(
  action: CanonicalActionCategory,
  objectSummary: string,
  confidence = 1,
): CanonicalRouterAction {
  return canonicalRouterActionSchema.parse({ action, objectSummary, confidence });
}

function routerCapabilityFromAction(
  action: CanonicalActionCategory,
): CanonicalRouterCapability | null {
  if (action === "work_queue_control") {
    return "work_queue_projection_update";
  }
  if (CANONICAL_ROUTER_CAPABILITIES.includes(action as CanonicalRouterCapability)) {
    return action as CanonicalRouterCapability;
  }
  return null;
}

export function createBaseCanonicalRouterOutput(
  overrides: Partial<CanonicalRouterOutput> & Pick<CanonicalRouterOutput, "route" | "responseMode">,
): CanonicalRouterOutput {
  const executorWorkflowId = overrides.executorWorkflowId ?? overrides.workflowId ?? null;
  const workflowId = overrides.workflowId ?? executorWorkflowId;
  const candidate = {
    schemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
    executeNow: false,
    executorWorkflowId,
    subjectWorkflowIds: [],
    targetSubjectRefs: [],
    requestedCapabilities: [],
    constraints: [],
    selectedExecutionReason: "",
    targetSubjectReason: "",
    workflowId,
    jobType: null,
    confidence: 0.5,
    objectiveSummary: "",
    mentionedActions: [],
    requestedActions: [],
    negatedActions: [],
    conditionalActions: [],
    requestedAuthority: null,
    requiresApproval: false,
    approvalKind: null,
    riskClass: "low",
    sideEffectClass: "none",
    targetRefs: [],
    activeJobRefs: [],
    childWorkflowRequests: [],
    multiIntentPlan: [],
    ambiguity: {
      ambiguous: false,
      missingInputs: [],
      conflictingInstructions: [],
      clarificationQuestion: null,
    },
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    ...overrides,
  };
  candidate.executorWorkflowId = candidate.executorWorkflowId ?? candidate.workflowId ?? null;
  candidate.workflowId = candidate.workflowId ?? candidate.executorWorkflowId;
  candidate.requestedCapabilities =
    candidate.requestedCapabilities.length > 0
      ? candidate.requestedCapabilities
      : Array.from(
          new Set(
            candidate.requestedActions
              .map((action) => routerCapabilityFromAction(action.action))
              .filter((capability): capability is CanonicalRouterCapability => Boolean(capability)),
          ),
        );
  candidate.targetSubjectRefs =
    candidate.targetSubjectRefs.length > 0 ? candidate.targetSubjectRefs : candidate.targetRefs;
  return canonicalRouterOutputSchema.parse(candidate);
}
