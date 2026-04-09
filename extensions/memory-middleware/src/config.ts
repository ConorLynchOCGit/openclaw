import type { OpenClawPluginConfigSchema } from "../api.js";

export type MemoryMiddlewareDbConfig = {
  driver: "postgres";
  url?: string;
  schema?: string;
};

export type MemoryMiddlewareCandidateIngressConfig = {
  mode: MemoryMiddlewareCandidateIngressMode;
};

export const MEMORY_MIDDLEWARE_CANDIDATE_INGRESS_MODES = [
  "disabled",
  "submit-only",
  "submit-review-only",
  "submit-review-promote-memory",
  "submit-review-promote-memory-procedure",
  "submit-review-promote-memory-procedure-validate",
  "submit-review-promote-memory-procedure-validate-skill",
  "submit-review-promote-memory-procedure-validate-skill-procurement",
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting",
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval",
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install",
  "candidate-only",
] as const;

export type MemoryMiddlewareCandidateIngressMode =
  (typeof MEMORY_MIDDLEWARE_CANDIDATE_INGRESS_MODES)[number];

export type MemoryMiddlewareCandidateIngressCapabilities = {
  submit: boolean;
  review: boolean;
  memoryPromotion: boolean;
  procedureDraftPromotion: boolean;
  procedureValidation: boolean;
  skillCandidate: boolean;
  skillProcurement: boolean;
  skillVetting: boolean;
  skillApproval: boolean;
  skillInstall: boolean;
  fullCandidateSandbox: boolean;
};

export type MemoryMiddlewareMemoryObjectQueryConfig = {
  mode: "disabled" | "read-only" | "candidate-only";
};

export type MemoryMiddlewareBackgroundJobConfig = {
  inspectionMode: "disabled" | "enabled";
  advisorySchedulingMode: "disabled" | "enabled";
  executeSchedulingMode: "disabled" | "enabled";
  advisoryJobClasses: Array<"proactive_plan" | "consolidation_plan">;
  executeJobClasses: Array<"proactive_execute_run_drift_check" | "consolidation_execute">;
  runnerOwnerId?: string;
};

export type MemoryMiddlewareAutoCaptureConfig = {
  profile: "disabled" | "user-preference-v1" | "user-preference-v2";
  allowedAgents: string[];
};

export type MemoryMiddlewareAutoPromotionConfig = {
  profile: "disabled" | "explicit-user-preference-v1";
  allowedAgents: string[];
};

export type MemoryMiddlewareRolloutTarget = "off-production" | "production-canary";

export const BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES = [
  "workflow_api_workaround",
  "workflow_environment_constraint",
  "workflow_generalized_guidance",
  "workflow_tool_gotcha",
] as const;

export type BoundedWorkflowGuidanceCaptureClass =
  (typeof BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES)[number];

export type MemoryMiddlewareSelfImprovingCaptureConfig = {
  mode: "disabled" | "candidate-only";
  rolloutTarget?: MemoryMiddlewareRolloutTarget;
  allowedCaptureClasses: Array<BoundedWorkflowGuidanceCaptureClass>;
};

export type MemoryMiddlewareLearnedGuidanceAdvisoryPlanningConfig = {
  mode: "disabled" | "inline-only";
  rolloutTarget?: MemoryMiddlewareRolloutTarget;
  allowedCaptureClasses: Array<BoundedWorkflowGuidanceCaptureClass>;
  defaultMaxSuggestions: number;
};

export type MemoryMiddlewareConfig = {
  database: MemoryMiddlewareDbConfig;
  candidateIngress: MemoryMiddlewareCandidateIngressConfig;
  memoryObjectQuery: MemoryMiddlewareMemoryObjectQueryConfig;
  backgroundJobs: MemoryMiddlewareBackgroundJobConfig;
  autoCapture?: MemoryMiddlewareAutoCaptureConfig;
  autoPromotion?: MemoryMiddlewareAutoPromotionConfig;
  selfImprovingCapture?: MemoryMiddlewareSelfImprovingCaptureConfig;
  learnedGuidanceAdvisoryPlanning?: MemoryMiddlewareLearnedGuidanceAdvisoryPlanningConfig;
};

export const DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG: MemoryMiddlewareAutoCaptureConfig = {
  profile: "disabled",
  allowedAgents: ["chief", "main"],
};

export const DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG: MemoryMiddlewareAutoPromotionConfig =
  {
    profile: "disabled",
    allowedAgents: ["chief", "main"],
  };

const CANDIDATE_INGRESS_MODE_ORDER: Record<MemoryMiddlewareCandidateIngressMode, number> = {
  disabled: 0,
  "submit-only": 1,
  "submit-review-only": 2,
  "submit-review-promote-memory": 3,
  "submit-review-promote-memory-procedure": 4,
  "submit-review-promote-memory-procedure-validate": 5,
  "submit-review-promote-memory-procedure-validate-skill": 6,
  "submit-review-promote-memory-procedure-validate-skill-procurement": 7,
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting": 8,
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval": 9,
  "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install": 10,
  "candidate-only": 11,
};

function normalizeBoundedWorkflowGuidanceCaptureClasses(
  value: unknown,
): Array<BoundedWorkflowGuidanceCaptureClass> {
  if (!Array.isArray(value)) {
    return [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES];
  }

  const normalized = [
    ...new Set(
      value.filter((entry): entry is BoundedWorkflowGuidanceCaptureClass =>
        BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES.includes(
          entry as BoundedWorkflowGuidanceCaptureClass,
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return normalized.length > 0 ? normalized : [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES];
}

export const memoryMiddlewareConfigSchema: OpenClawPluginConfigSchema = {
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      database: {
        type: "object",
        additionalProperties: false,
        properties: {
          driver: { type: "string", enum: ["postgres"] },
          url: { type: "string" },
          schema: { type: "string" },
        },
      },
      candidateIngress: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
            enum: [...MEMORY_MIDDLEWARE_CANDIDATE_INGRESS_MODES],
          },
        },
      },
      memoryObjectQuery: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["disabled", "read-only", "candidate-only"] },
        },
      },
      backgroundJobs: {
        type: "object",
        additionalProperties: false,
        properties: {
          inspectionMode: { type: "string", enum: ["disabled", "enabled"] },
          advisorySchedulingMode: { type: "string", enum: ["disabled", "enabled"] },
          executeSchedulingMode: { type: "string", enum: ["disabled", "enabled"] },
          advisoryJobClasses: {
            type: "array",
            items: {
              type: "string",
              enum: ["proactive_plan", "consolidation_plan"],
            },
          },
          executeJobClasses: {
            type: "array",
            items: {
              type: "string",
              enum: ["proactive_execute_run_drift_check", "consolidation_execute"],
            },
          },
          runnerOwnerId: { type: "string" },
        },
      },
      autoCapture: {
        type: "object",
        additionalProperties: false,
        properties: {
          profile: {
            type: "string",
            enum: ["disabled", "user-preference-v1", "user-preference-v2"],
          },
          allowedAgents: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      autoPromotion: {
        type: "object",
        additionalProperties: false,
        properties: {
          profile: { type: "string", enum: ["disabled", "explicit-user-preference-v1"] },
          allowedAgents: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      selfImprovingCapture: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["disabled", "candidate-only"] },
          rolloutTarget: {
            type: "string",
            enum: ["off-production", "production-canary"],
          },
          allowedCaptureClasses: {
            type: "array",
            items: {
              type: "string",
              enum: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
            },
          },
        },
      },
      learnedGuidanceAdvisoryPlanning: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["disabled", "inline-only"] },
          rolloutTarget: {
            type: "string",
            enum: ["off-production", "production-canary"],
          },
          allowedCaptureClasses: {
            type: "array",
            items: {
              type: "string",
              enum: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
            },
          },
          defaultMaxSuggestions: {
            type: "integer",
            minimum: 1,
            maximum: 10,
          },
        },
      },
    },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeRolloutTarget(value: unknown): MemoryMiddlewareRolloutTarget | undefined {
  return value === "off-production" || value === "production-canary" ? value : undefined;
}

export function resolveMemoryMiddlewareCandidateIngressCapabilities(
  mode: MemoryMiddlewareCandidateIngressMode,
): MemoryMiddlewareCandidateIngressCapabilities {
  const order = CANDIDATE_INGRESS_MODE_ORDER[mode];
  return {
    submit: order >= CANDIDATE_INGRESS_MODE_ORDER["submit-only"],
    review: order >= CANDIDATE_INGRESS_MODE_ORDER["submit-review-only"],
    memoryPromotion: order >= CANDIDATE_INGRESS_MODE_ORDER["submit-review-promote-memory"],
    procedureDraftPromotion:
      order >= CANDIDATE_INGRESS_MODE_ORDER["submit-review-promote-memory-procedure"],
    procedureValidation:
      order >= CANDIDATE_INGRESS_MODE_ORDER["submit-review-promote-memory-procedure-validate"],
    skillCandidate:
      order >=
      CANDIDATE_INGRESS_MODE_ORDER["submit-review-promote-memory-procedure-validate-skill"],
    skillProcurement:
      order >=
      CANDIDATE_INGRESS_MODE_ORDER[
        "submit-review-promote-memory-procedure-validate-skill-procurement"
      ],
    skillVetting:
      order >=
      CANDIDATE_INGRESS_MODE_ORDER[
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
      ],
    skillApproval:
      order >=
      CANDIDATE_INGRESS_MODE_ORDER[
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
      ],
    skillInstall:
      order >=
      CANDIDATE_INGRESS_MODE_ORDER[
        "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
      ],
    fullCandidateSandbox: mode === "candidate-only",
  };
}

export function resolveMemoryMiddlewareConfig(input: unknown): MemoryMiddlewareConfig {
  const root = asRecord(input);
  const database = asRecord(root.database);
  const candidateIngress = asRecord(root.candidateIngress);
  const memoryObjectQuery = asRecord(root.memoryObjectQuery);
  const backgroundJobs = asRecord(root.backgroundJobs);
  const autoCapture = asRecord(root.autoCapture);
  const autoPromotion = asRecord(root.autoPromotion);
  const selfImprovingCapture = asRecord(root.selfImprovingCapture);
  const learnedGuidanceAdvisoryPlanning = asRecord(root.learnedGuidanceAdvisoryPlanning);

  const driver = database.driver === "postgres" ? "postgres" : "postgres";
  const url =
    typeof database.url === "string" && database.url.trim() ? database.url.trim() : undefined;
  const schema =
    typeof database.schema === "string" && database.schema.trim()
      ? database.schema.trim()
      : "memory_middleware";
  const candidateIngressMode =
    typeof candidateIngress.mode === "string" &&
    MEMORY_MIDDLEWARE_CANDIDATE_INGRESS_MODES.includes(
      candidateIngress.mode as MemoryMiddlewareCandidateIngressMode,
    )
      ? (candidateIngress.mode as MemoryMiddlewareCandidateIngressMode)
      : "disabled";
  const memoryObjectQueryMode =
    memoryObjectQuery.mode === "read-only"
      ? "read-only"
      : memoryObjectQuery.mode === "candidate-only"
        ? "candidate-only"
        : candidateIngressMode === "candidate-only"
          ? "candidate-only"
          : "disabled";
  const inspectionMode = backgroundJobs.inspectionMode === "enabled" ? "enabled" : "disabled";
  const advisorySchedulingMode =
    backgroundJobs.advisorySchedulingMode === "enabled" ? "enabled" : "disabled";
  const executeSchedulingMode =
    backgroundJobs.executeSchedulingMode === "enabled" ? "enabled" : "disabled";
  const advisoryJobClasses: MemoryMiddlewareBackgroundJobConfig["advisoryJobClasses"] =
    Array.isArray(backgroundJobs.advisoryJobClasses)
      ? ([
          ...new Set(
            backgroundJobs.advisoryJobClasses.filter(
              (value): value is "proactive_plan" | "consolidation_plan" =>
                value === "proactive_plan" || value === "consolidation_plan",
            ),
          ),
        ].sort((left, right) => left.localeCompare(right)) as Array<
          "proactive_plan" | "consolidation_plan"
        >)
      : ["proactive_plan"];
  const executeJobClasses: MemoryMiddlewareBackgroundJobConfig["executeJobClasses"] = Array.isArray(
    backgroundJobs.executeJobClasses,
  )
    ? ([
        ...new Set(
          backgroundJobs.executeJobClasses.filter(
            (value): value is "proactive_execute_run_drift_check" | "consolidation_execute" =>
              value === "proactive_execute_run_drift_check" || value === "consolidation_execute",
          ),
        ),
      ].sort((left, right) =>
        left.localeCompare(right),
      ) as MemoryMiddlewareBackgroundJobConfig["executeJobClasses"])
    : ["proactive_execute_run_drift_check"];
  const runnerOwnerId =
    typeof backgroundJobs.runnerOwnerId === "string" && backgroundJobs.runnerOwnerId.trim()
      ? backgroundJobs.runnerOwnerId.trim()
      : undefined;
  const autoCaptureProfile =
    autoCapture.profile === "user-preference-v1"
      ? "user-preference-v1"
      : autoCapture.profile === "user-preference-v2"
        ? "user-preference-v2"
        : "disabled";
  const autoCaptureAllowedAgents = Array.isArray(autoCapture.allowedAgents)
    ? [
        ...new Set(
          autoCapture.allowedAgents
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right))
    : ["chief", "main"];
  const autoPromotionProfile =
    autoPromotion.profile === "explicit-user-preference-v1"
      ? "explicit-user-preference-v1"
      : "disabled";
  const autoPromotionAllowedAgents = Array.isArray(autoPromotion.allowedAgents)
    ? [
        ...new Set(
          autoPromotion.allowedAgents
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ].sort((left, right) => left.localeCompare(right))
    : ["chief", "main"];
  const selfImprovingCaptureMode =
    selfImprovingCapture.mode === "candidate-only" ? "candidate-only" : "disabled";
  const selfImprovingCaptureRolloutTarget = normalizeRolloutTarget(
    selfImprovingCapture.rolloutTarget,
  );
  const selfImprovingAllowedCaptureClasses = normalizeBoundedWorkflowGuidanceCaptureClasses(
    selfImprovingCapture.allowedCaptureClasses ?? selfImprovingCapture["allowedLessonFamilies"],
  );
  const learnedGuidanceAdvisoryPlanningMode =
    learnedGuidanceAdvisoryPlanning.mode === "inline-only" ? "inline-only" : "disabled";
  const learnedGuidanceAdvisoryPlanningRolloutTarget = normalizeRolloutTarget(
    learnedGuidanceAdvisoryPlanning.rolloutTarget,
  );
  const learnedGuidanceAllowedCaptureClasses = normalizeBoundedWorkflowGuidanceCaptureClasses(
    learnedGuidanceAdvisoryPlanning.allowedCaptureClasses ??
      learnedGuidanceAdvisoryPlanning["allowedLessonFamilies"],
  );
  const learnedGuidanceDefaultMaxSuggestions =
    typeof learnedGuidanceAdvisoryPlanning.defaultMaxSuggestions === "number" &&
    Number.isInteger(learnedGuidanceAdvisoryPlanning.defaultMaxSuggestions)
      ? Math.min(Math.max(learnedGuidanceAdvisoryPlanning.defaultMaxSuggestions, 1), 10)
      : 3;

  return {
    database: {
      driver,
      ...(url ? { url } : {}),
      schema,
    },
    candidateIngress: {
      mode: candidateIngressMode,
    },
    memoryObjectQuery: {
      mode: memoryObjectQueryMode,
    },
    backgroundJobs: {
      inspectionMode,
      advisorySchedulingMode,
      executeSchedulingMode,
      advisoryJobClasses,
      executeJobClasses,
      ...(runnerOwnerId ? { runnerOwnerId } : {}),
    },
    autoCapture: {
      profile: autoCaptureProfile,
      allowedAgents:
        autoCaptureAllowedAgents.length > 0
          ? [...autoCaptureAllowedAgents]
          : [...DEFAULT_MEMORY_MIDDLEWARE_AUTO_CAPTURE_CONFIG.allowedAgents],
    },
    autoPromotion: {
      profile: autoPromotionProfile,
      allowedAgents:
        autoPromotionAllowedAgents.length > 0
          ? [...autoPromotionAllowedAgents]
          : [...DEFAULT_MEMORY_MIDDLEWARE_AUTO_PROMOTION_CONFIG.allowedAgents],
    },
    selfImprovingCapture: {
      mode: selfImprovingCaptureMode,
      ...(selfImprovingCaptureRolloutTarget
        ? { rolloutTarget: selfImprovingCaptureRolloutTarget }
        : {}),
      allowedCaptureClasses: selfImprovingAllowedCaptureClasses,
    },
    learnedGuidanceAdvisoryPlanning: {
      mode: learnedGuidanceAdvisoryPlanningMode,
      ...(learnedGuidanceAdvisoryPlanningRolloutTarget
        ? { rolloutTarget: learnedGuidanceAdvisoryPlanningRolloutTarget }
        : {}),
      allowedCaptureClasses: learnedGuidanceAllowedCaptureClasses,
      defaultMaxSuggestions: learnedGuidanceDefaultMaxSuggestions,
    },
  };
}
