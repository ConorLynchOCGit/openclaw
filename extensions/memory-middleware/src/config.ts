import type { OpenClawPluginConfigSchema } from "../api.js";

export type MemoryMiddlewareDbConfig = {
  driver: "postgres";
  url?: string;
  schema?: string;
};

export type MemoryMiddlewareCandidateIngressConfig = {
  mode:
    | "disabled"
    | "submit-only"
    | "submit-review-only"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
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

export type MemoryMiddlewareSelfImprovingCaptureConfig = {
  mode: "disabled" | "candidate-only";
  rolloutTarget?: MemoryMiddlewareRolloutTarget;
  allowedLessonFamilies: Array<"generalized_workflow_lesson">;
};

export type MemoryMiddlewareLearnedGuidanceAdvisoryPlanningConfig = {
  mode: "disabled" | "inline-only";
  rolloutTarget?: MemoryMiddlewareRolloutTarget;
  allowedLessonFamilies: Array<"generalized_workflow_lesson">;
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

const DEFAULT_BOUNDED_WORKFLOW_LESSON_FAMILIES = [
  "generalized_workflow_lesson",
] as const satisfies Array<"generalized_workflow_lesson">;

function normalizeBoundedWorkflowLessonFamilies(
  value: unknown,
): Array<"generalized_workflow_lesson"> {
  if (!Array.isArray(value)) {
    return [...DEFAULT_BOUNDED_WORKFLOW_LESSON_FAMILIES];
  }

  const normalized = [
    ...new Set(
      value.filter(
        (entry): entry is "generalized_workflow_lesson" => entry === "generalized_workflow_lesson",
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return normalized.length > 0 ? normalized : [...DEFAULT_BOUNDED_WORKFLOW_LESSON_FAMILIES];
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
            enum: [
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
            ],
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
          allowedLessonFamilies: {
            type: "array",
            items: {
              type: "string",
              enum: ["generalized_workflow_lesson"],
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
          allowedLessonFamilies: {
            type: "array",
            items: {
              type: "string",
              enum: ["generalized_workflow_lesson"],
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
    candidateIngress.mode === "candidate-only"
      ? "candidate-only"
      : candidateIngress.mode ===
          "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
        ? "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
        : candidateIngress.mode ===
            "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
          ? "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
          : candidateIngress.mode ===
              "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
            ? "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
            : candidateIngress.mode ===
                "submit-review-promote-memory-procedure-validate-skill-procurement"
              ? "submit-review-promote-memory-procedure-validate-skill-procurement"
              : candidateIngress.mode === "submit-review-promote-memory-procedure-validate-skill"
                ? "submit-review-promote-memory-procedure-validate-skill"
                : candidateIngress.mode === "submit-review-promote-memory-procedure-validate"
                  ? "submit-review-promote-memory-procedure-validate"
                  : candidateIngress.mode === "submit-review-promote-memory-procedure"
                    ? "submit-review-promote-memory-procedure"
                    : candidateIngress.mode === "submit-review-promote-memory"
                      ? "submit-review-promote-memory"
                      : candidateIngress.mode === "submit-review-only"
                        ? "submit-review-only"
                        : candidateIngress.mode === "submit-only"
                          ? "submit-only"
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
  const selfImprovingAllowedLessonFamilies = normalizeBoundedWorkflowLessonFamilies(
    selfImprovingCapture.allowedLessonFamilies,
  );
  const learnedGuidanceAdvisoryPlanningMode =
    learnedGuidanceAdvisoryPlanning.mode === "inline-only" ? "inline-only" : "disabled";
  const learnedGuidanceAdvisoryPlanningRolloutTarget = normalizeRolloutTarget(
    learnedGuidanceAdvisoryPlanning.rolloutTarget,
  );
  const learnedGuidanceAllowedLessonFamilies = normalizeBoundedWorkflowLessonFamilies(
    learnedGuidanceAdvisoryPlanning.allowedLessonFamilies,
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
      allowedLessonFamilies: selfImprovingAllowedLessonFamilies,
    },
    learnedGuidanceAdvisoryPlanning: {
      mode: learnedGuidanceAdvisoryPlanningMode,
      ...(learnedGuidanceAdvisoryPlanningRolloutTarget
        ? { rolloutTarget: learnedGuidanceAdvisoryPlanningRolloutTarget }
        : {}),
      allowedLessonFamilies: learnedGuidanceAllowedLessonFamilies,
      defaultMaxSuggestions: learnedGuidanceDefaultMaxSuggestions,
    },
  };
}
