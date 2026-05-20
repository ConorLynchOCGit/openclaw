import { createHash } from "node:crypto";
import { z } from "zod";

export const INTENT_ROUTE_VALUES = [
  "chat_only",
  "workflow_execution",
  "work_queue_control",
  "clarification_required",
  "blocked",
] as const;

export const SIDE_EFFECT_CLASS_VALUES = [
  "none",
  "read_only",
  "code_edit",
  "install_dependency",
  "outbound_readonly",
  "deploy_dry_run",
  "model_promotion_dry_run",
  "production_side_effect",
] as const;

export const RISK_CLASS_VALUES = ["low", "medium", "high", "critical"] as const;

export const structuredIntentRouterOutputSchema = z
  .object({
    route: z.enum(INTENT_ROUTE_VALUES),
    executorWorkflowId: z.string().min(1).max(120).nullable().optional(),
    subjectWorkflowIds: z.array(z.string().min(1).max(120)).max(20).optional(),
    targetSubjectRefs: z
      .array(
        z
          .object({
            targetKind: z.string().min(1).max(80),
            targetRef: z.string().min(1).max(240),
            confidence: z.number().min(0).max(1).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    requestedCapabilities: z.array(z.string().min(1).max(80)).max(20).optional(),
    constraints: z.array(z.string().min(1).max(200)).max(30).optional(),
    workflowId: z.string().min(1).max(120).nullable(),
    jobType: z.string().min(1).max(120).nullable(),
    confidence: z.number().min(0).max(1),
    objectiveSummary: z.string().max(1_000),
    compiledInputs: z.record(z.string(), z.unknown()).default({}),
    requestedAuthority: z.string().min(1).max(120).nullable(),
    requiresApproval: z.boolean(),
    approvalKind: z.string().min(1).max(120).nullable().optional(),
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().max(500).nullable().optional(),
    reasonCodes: z.array(z.string().min(1).max(120)).max(30),
    riskClass: z.enum(RISK_CLASS_VALUES),
    sideEffectClass: z.enum(SIDE_EFFECT_CLASS_VALUES),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .superRefine((value, context) => {
    if (value.route === "workflow_execution") {
      if (!value.executorWorkflowId && !value.workflowId) {
        context.addIssue({
          code: "custom",
          message: "workflow_execution_requires_executor_workflow_id",
          path: ["executorWorkflowId"],
        });
      }
      if (
        value.executorWorkflowId &&
        value.workflowId &&
        value.executorWorkflowId !== value.workflowId
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
    }
    if (value.needsClarification && !value.clarificationQuestion) {
      context.addIssue({
        code: "custom",
        message: "clarification_question_required",
        path: ["clarificationQuestion"],
      });
    }
  });

export type StructuredIntentRouterOutput = z.infer<typeof structuredIntentRouterOutputSchema>;

export type IntentRouterParseResult = {
  valid: boolean;
  output: StructuredIntentRouterOutput | null;
  reasonCodes: string[];
};

export function parseStructuredIntentRouterOutput(value: unknown): IntentRouterParseResult {
  const parsed = structuredIntentRouterOutputSchema.safeParse(value);
  if (parsed.success) {
    return { valid: true, output: parsed.data, reasonCodes: [] };
  }
  return {
    valid: false,
    output: null,
    reasonCodes: parsed.error.issues.map((issue) => `intent_schema_${issue.message}`),
  };
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

export function summarizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 500);
}
