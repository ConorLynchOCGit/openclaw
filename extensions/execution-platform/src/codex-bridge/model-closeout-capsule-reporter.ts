import { z } from "zod";
import type {
  JsonModelExecutor,
  JsonModelReasoningEffort,
} from "../../../model-memory/src/model-execution.ts";
import { parseJsonModelOutput } from "../../../model-memory/src/model-execution.ts";
import {
  buildCloseoutCapsuleId,
  CLOSEOUT_CAPSULE_SCHEMA_VERSION,
  closeoutCapsuleHash,
  closeoutCapsuleToLegacyHumanSummary,
  parseCloseoutCapsule,
  type CloseoutCapsule,
  type CloseoutCapsuleFactualRefs,
  type CloseoutCapsuleOpportunitySeed,
} from "./closeout-capsule.ts";

export type CloseoutCapsuleReporterModelOptions = {
  executor: JsonModelExecutor;
  modelId?: string;
  reasoningEffort?: JsonModelReasoningEffort;
  maxOutputTokens?: number;
  closeoutTimeoutMs?: number;
  opportunitySeedRepairTimeoutMs?: number;
  now?: () => Date;
};

export type CloseoutCapsuleReporterInput = {
  factualRefs: CloseoutCapsuleFactualRefs;
  objectiveSummary: string;
  boundedRoleEvidence: Array<{
    roleId: string;
    agentId?: string | null;
    modelRef?: string | null;
    modelRunRef?: string | null;
    askedToDo: string;
    evidenceSummary: string;
    artifactRefs: string[];
    validationRefs: string[];
    limitations: string[];
  }>;
  boundedResultEvidence: {
    completed: boolean;
    needsReview: boolean;
    failed: boolean;
    findings: string[];
    requiredFixes: string[];
    limitations: string[];
  };
};

export type CloseoutCapsuleReporterResult = {
  source: "model" | "degraded_system_fallback";
  capsule: CloseoutCapsule;
  legacyHumanSummary: ReturnType<typeof closeoutCapsuleToLegacyHumanSummary>;
  reasonCodes: string[];
  closeoutTiming?: CloseoutCapsuleReporterTiming;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CloseoutCapsuleReporterTiming = {
  closeoutModelStartedAt: string;
  closeoutModelCompletedAt: string;
  latencyMs: number;
  modelRef: string;
  reasoningEffort: JsonModelReasoningEffort;
  maxOutputTokens: number;
  capsuleId: string | null;
  capsuleHash: string | null;
  failureReason: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const DEFAULT_CLOSEOUT_MODEL_ID = "openai-codex/gpt-5.4";

const MODEL_AUTHORED_CLOSEOUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "humanReportMarkdown",
    "eli5Progress",
    "successAssessment",
    "qualityAssessment",
    "workflowAgentModelFitAssessment",
    "limitations",
    "opportunitySeeds",
  ],
  properties: {
    humanReportMarkdown: { type: "string", minLength: 1, maxLength: 6000 },
    eli5Progress: { type: "string", minLength: 1, maxLength: 1000 },
    successAssessment: { enum: ["satisfied", "unsatisfied", "needs_review", "blocked", "unknown"] },
    qualityAssessment: { type: "string", minLength: 1, maxLength: 1000 },
    workflowAgentModelFitAssessment: { type: "string", minLength: 1, maxLength: 1000 },
    limitations: { type: "array", items: { type: "string", maxLength: 700 }, maxItems: 10 },
    opportunitySeeds: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          kind: { type: "string", maxLength: 80 },
          title: { type: "string", maxLength: 120 },
          rationale: { type: "string", maxLength: 600 },
          recommendedNextStep: { type: "string", maxLength: 500 },
          evidenceRefs: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 8 },
          confidence: { type: "string", maxLength: 40 },
        },
      },
    },
  },
} as const;

const OPPORTUNITY_SEED_REPAIR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opportunitySeeds"],
  properties: {
    opportunitySeeds: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "title",
          "rationale",
          "recommendedNextStep",
          "evidenceRefs",
          "confidence",
        ],
        properties: {
          kind: {
            enum: [
              "new_skill_candidate",
              "existing_skill_edit",
              "proactive_plan",
              "process_improvement",
              "follow_up_work_item",
              "no_op",
            ],
          },
          title: { type: "string", minLength: 1, maxLength: 120 },
          rationale: { type: "string", minLength: 1, maxLength: 600 },
          recommendedNextStep: { type: "string", minLength: 1, maxLength: 500 },
          evidenceRefs: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 8 },
          confidence: { enum: ["low", "medium", "high"] },
        },
      },
    },
  },
} as const;

const ModelAuthoredCloseoutSchema = z
  .object({
    humanReportMarkdown: z.string().trim().min(1).max(6_000),
    eli5Progress: z.string().trim().min(1).max(1_000),
    successAssessment: z.string().trim().min(1).max(80),
    qualityAssessment: z.string().trim().min(1).max(1_000),
    workflowAgentModelFitAssessment: z.string().trim().min(1).max(1_000),
    limitations: z.array(z.string().trim().min(1).max(700)).max(10),
    opportunitySeeds: z.array(z.unknown()).max(20),
  })
  .strict();

const RepairedOpportunitySeedsSchema = z
  .object({
    opportunitySeeds: z
      .array(
        z
          .object({
            kind: z.enum([
              "new_skill_candidate",
              "existing_skill_edit",
              "proactive_plan",
              "process_improvement",
              "follow_up_work_item",
              "no_op",
            ]),
            title: z.string().trim().min(1).max(120),
            rationale: z.string().trim().min(1).max(600),
            recommendedNextStep: z.string().trim().min(1).max(500),
            evidenceRefs: z.array(z.string().trim().min(1).max(220)).max(8),
            confidence: z.enum(["low", "medium", "high"]),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

type ModelAuthoredCloseout = z.infer<typeof ModelAuthoredCloseoutSchema>;

const CLOSEOUT_CAPSULE_SYSTEM_PROMPT = [
  "You are the model-authored workflow closeout reporter for OpenClaw.",
  "Write the owner-facing closeout like a concise senior engineer final response, not a system dump.",
  "Use only the bounded factual anchors and role evidence supplied by the runtime.",
  "Do not invent files, tests, agents, models, deploys, outbound sends, or authority grants.",
  "The deterministic runtime anchors facts and wraps your report in the final envelope.",
  "You provide judgment, synthesis, limitations, ELI5 progress, and opportunity seeds.",
  "If evidence is insufficient, say so directly in the report and successAssessment.",
  "Use successAssessment=satisfied when the bounded objective was completed and remaining limitations do not require rerunning or blocking the workflow.",
  "Return strict JSON only. Do not include raw prompts, raw responses, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
  "Opportunity seeds should be useful and concrete; use no_op if there is no worthwhile follow-up.",
].join("\n");

export class ModelCloseoutCapsuleReporter {
  private readonly modelId: string;
  private readonly reasoningEffort: JsonModelReasoningEffort;
  private readonly maxOutputTokens: number;
  private readonly closeoutTimeoutMs: number;
  private readonly opportunitySeedRepairTimeoutMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: CloseoutCapsuleReporterModelOptions) {
    this.modelId = options.modelId ?? DEFAULT_CLOSEOUT_MODEL_ID;
    this.reasoningEffort = options.reasoningEffort ?? "medium";
    this.maxOutputTokens = options.maxOutputTokens ?? 12_000;
    this.closeoutTimeoutMs = options.closeoutTimeoutMs ?? 240_000;
    this.opportunitySeedRepairTimeoutMs =
      options.opportunitySeedRepairTimeoutMs ?? Math.min(this.closeoutTimeoutMs, 60_000);
    this.now = options.now ?? (() => new Date());
  }

  async createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult> {
    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const createdAt = startedAt;
    const capsuleId = buildCloseoutCapsuleId({
      runtimeJobId: input.factualRefs.runtimeJobId,
      teamRunId: input.factualRefs.teamRunId,
      createdAt,
    });
    const response = await withTimeout(
      this.options.executor.execute({
        contract: {
          contractName: "execution_platform_closeout_capsule",
          contractVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
          modelId: this.modelId,
        },
        systemPrompt: CLOSEOUT_CAPSULE_SYSTEM_PROMPT,
        userPrompt: JSON.stringify(
          {
            objectiveSummary: input.objectiveSummary,
            factualRefs: input.factualRefs,
            boundedRoleEvidence: input.boundedRoleEvidence,
            boundedResultEvidence: input.boundedResultEvidence,
            modelOutputMustContainOnly: [
              "humanReportMarkdown",
              "eli5Progress",
              "successAssessment",
              "qualityAssessment",
              "workflowAgentModelFitAssessment",
              "limitations",
              "opportunitySeeds",
            ],
          },
          null,
          2,
        ),
        responseFormat: "json",
        responseOptions: {
          maxOutputTokens: this.maxOutputTokens,
          reasoningEffort: this.reasoningEffort,
          verbosity: "low",
          transport: {
            type: "json_schema",
            name: "execution_platform_model_authored_closeout",
            strict: true,
            schema: MODEL_AUTHORED_CLOSEOUT_JSON_SCHEMA,
          },
        },
      }),
      this.closeoutTimeoutMs,
      "closeout_model_timeout",
    );
    const modelCloseout = parseJsonModelOutput(
      response,
      {
        contractName: "execution_platform_closeout_capsule",
        contractVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
        modelId: this.modelId,
      },
      ModelAuthoredCloseoutSchema,
    );
    const opportunitySeeds = await this.normalizeOpportunitySeeds({
      modelCloseout,
      input,
      evidenceRefs: input.factualRefs.artifactRefs,
    });
    const taskSuccess = normalizeTaskSuccess(modelCloseout.successAssessment);
    const boundedFactualRefs = {
      ...input.factualRefs,
      roles: input.factualRefs.roles.slice(-20),
    };
    const capsule = parseCloseoutCapsule({
      artifactKind: "execution_platform_closeout_capsule",
      schemaVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
      capsuleId,
      createdAt,
      modelRef: response.resolvedModelId ?? this.modelId,
      humanReport: {
        source: "model",
        reportMarkdown: modelCloseout.humanReportMarkdown,
        eli5Progress: modelCloseout.eli5Progress,
        limitations: modelCloseout.limitations,
      },
      structuredSummary: {
        taskSuccess,
        qualityAssessment: modelCloseout.qualityAssessment,
        workflowFitAssessment: modelCloseout.workflowAgentModelFitAssessment,
        agentModelFitAssessment: modelCloseout.workflowAgentModelFitAssessment,
        missingWork: taskSuccess === "satisfied" ? [] : modelCloseout.limitations.slice(0, 10),
        validationSummary:
          boundedFactualRefs.validationRefs.length > 0
            ? clampCloseoutText(boundedFactualRefs.validationRefs.slice(0, 6).join("; "), 1_000)
            : "No validation refs were provided to the closeout reporter.",
        riskSummary:
          input.boundedResultEvidence.limitations.length > 0
            ? clampCloseoutText(
                input.boundedResultEvidence.limitations.slice(0, 6).join("; "),
                1_000,
              )
            : "No additional bounded runtime limitations were provided.",
        opportunitySeedIds: opportunitySeeds.map((seed) => seed.seedId),
      },
      roleCloseouts: buildRoleCloseoutsFromEvidence({
        runtimeJobId: boundedFactualRefs.runtimeJobId,
        roleEvidence: input.boundedRoleEvidence,
        modelCloseout,
      }),
      opportunitySeeds,
      factualRefs: boundedFactualRefs,
      safetyFlags: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        workQueueLifecycleMutatedDirectly: false,
        authorityGrantedByCloseout: false,
        runtimeJobCreatedByCloseout: false,
      },
    });
    const completedAtDate = this.now();
    const completedAt = completedAtDate.toISOString();
    const capsuleHash = closeoutCapsuleHash(capsule);
    return {
      source: "model",
      capsule,
      legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
      reasonCodes: ["closeout_capsule_model_authored"],
      closeoutTiming: {
        closeoutModelStartedAt: startedAt,
        closeoutModelCompletedAt: completedAt,
        latencyMs: Math.max(0, completedAtDate.getTime() - startedAtDate.getTime()),
        modelRef: response.resolvedModelId ?? this.modelId,
        reasoningEffort: this.reasoningEffort,
        maxOutputTokens: this.maxOutputTokens,
        capsuleId: capsule.capsuleId,
        capsuleHash,
        failureReason: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  private async normalizeOpportunitySeeds(input: {
    modelCloseout: ModelAuthoredCloseout;
    input: CloseoutCapsuleReporterInput;
    evidenceRefs: string[];
  }): Promise<CloseoutCapsuleOpportunitySeed[]> {
    const normalized = normalizeOpportunitySeedCandidates(
      input.modelCloseout.opportunitySeeds,
      input.evidenceRefs,
      input.input.factualRefs.runtimeJobId,
    );
    if (normalized.length > 0) {
      return normalized;
    }
    if (input.modelCloseout.opportunitySeeds.length === 0) {
      return [createNoOpOpportunitySeed(input.input.factualRefs.runtimeJobId, input.evidenceRefs)];
    }
    try {
      const repaired = await withTimeout(
        this.options.executor.execute({
          contract: {
            contractName: "execution_platform_closeout_capsule",
            contractVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
            modelId: this.modelId,
          },
          systemPrompt: [
            "Extract bounded OpenClaw opportunity seeds from the supplied model-authored closeout.",
            "Return only strict JSON. Do not include raw prompts, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
            "Use no_op if there is no useful follow-up.",
          ].join("\n"),
          userPrompt: JSON.stringify(
            {
              humanReportMarkdown: input.modelCloseout.humanReportMarkdown,
              eli5Progress: input.modelCloseout.eli5Progress,
              qualityAssessment: input.modelCloseout.qualityAssessment,
              workflowAgentModelFitAssessment: input.modelCloseout.workflowAgentModelFitAssessment,
              malformedOpportunitySeeds: input.modelCloseout.opportunitySeeds,
              allowedEvidenceRefs: input.evidenceRefs.slice(0, 8),
            },
            null,
            2,
          ),
          responseFormat: "json",
          responseOptions: {
            maxOutputTokens: Math.min(this.maxOutputTokens, 2_000),
            reasoningEffort: this.reasoningEffort,
            verbosity: "low",
            transport: {
              type: "json_schema",
              name: "execution_platform_closeout_opportunity_seed_repair",
              strict: true,
              schema: OPPORTUNITY_SEED_REPAIR_JSON_SCHEMA,
            },
          },
        }),
        this.opportunitySeedRepairTimeoutMs,
        "closeout_opportunity_seed_repair_timeout",
      );
      const repairOutput = parseJsonModelOutput(
        repaired,
        {
          contractName: "execution_platform_closeout_capsule",
          contractVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
          modelId: this.modelId,
        },
        RepairedOpportunitySeedsSchema,
      );
      const repairedSeeds = repairOutput.opportunitySeeds.map((seed, index) => ({
        seedId: `${input.input.factualRefs.runtimeJobId}-seed-${index + 1}`,
        ...seed,
        evidenceRefs:
          seed.evidenceRefs.length > 0 ? seed.evidenceRefs : input.evidenceRefs.slice(0, 3),
      }));
      return repairedSeeds.length > 0
        ? repairedSeeds
        : [createNoOpOpportunitySeed(input.input.factualRefs.runtimeJobId, input.evidenceRefs)];
    } catch {
      return [createNoOpOpportunitySeed(input.input.factualRefs.runtimeJobId, input.evidenceRefs)];
    }
  }
}

function buildRoleCloseoutsFromEvidence(input: {
  runtimeJobId: string;
  roleEvidence: CloseoutCapsuleReporterInput["boundedRoleEvidence"];
  modelCloseout: ModelAuthoredCloseout;
}): CloseoutCapsule["roleCloseouts"] {
  return input.roleEvidence
    .slice(-20)
    .map((role) => {
      const evidenceRefs = [...role.artifactRefs, ...role.validationRefs].slice(0, 12);
      const limitationSummary =
        role.limitations.length > 0
          ? role.limitations
          : input.modelCloseout.limitations.slice(0, 3);
      return {
        roleId: role.roleId,
        agentId: role.agentId ?? role.roleId,
        modelRef: role.modelRef ?? null,
        modelRunRef: role.modelRunRef ?? null,
        source: "model" as const,
        askedToDo: role.askedToDo.slice(0, 800),
        actuallyDid: role.evidenceSummary.slice(0, 1_200),
        whatIWasAskedToDo: role.askedToDo.slice(0, 800),
        whatIActuallyDid: role.evidenceSummary.slice(0, 1_200),
        eli5Progress: role.evidenceSummary.slice(0, 1_000),
        evidenceRefs,
        filesOrArtifactsTouched: role.artifactRefs.slice(0, 20),
        validationIPerformed:
          role.validationRefs.length > 0
            ? clampCloseoutText(
                `Recorded bounded validation refs: ${role.validationRefs.slice(0, 6).join("; ")}`,
                800,
              )
            : "No bounded validation refs were supplied for this role.",
        worked: [
          role.evidenceSummary.slice(0, 500),
          input.modelCloseout.qualityAssessment.slice(0, 500),
        ].filter((value) => value.trim().length > 0),
        failedOrWeak:
          limitationSummary.length > 0
            ? limitationSummary.slice(0, 8)
            : ["No role-specific weakness was identified in the bounded evidence."],
        wouldImproveNext: [input.modelCloseout.workflowAgentModelFitAssessment.slice(0, 500)],
        recommendedNextStep:
          input.modelCloseout.opportunitySeeds.find(
            (seed) => seed && typeof seed === "object" && !Array.isArray(seed),
          ) &&
          typeof (
            input.modelCloseout.opportunitySeeds.find(
              (seed) => seed && typeof seed === "object" && !Array.isArray(seed),
            ) as Record<string, unknown>
          ).recommendedNextStep === "string"
            ? String(
                (
                  input.modelCloseout.opportunitySeeds.find(
                    (seed) => seed && typeof seed === "object" && !Array.isArray(seed),
                  ) as Record<string, unknown>
                ).recommendedNextStep,
              ).slice(0, 800)
            : input.modelCloseout.workflowAgentModelFitAssessment.slice(0, 800),
        opportunitySeeds: [],
        confidence: role.limitations.length > 0 ? ("medium" as const) : ("high" as const),
        limitations:
          limitationSummary.length > 0
            ? limitationSummary.slice(0, 8)
            : ["No role-specific limitation was identified in bounded evidence."],
        rawPromptStored: false as const,
        rawResponseStored: false as const,
        rawTranscriptStored: false as const,
        rawProviderLogStored: false as const,
        rawToolLogStored: false as const,
      };
    })
    .slice(0, 20);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(code)), Math.max(1, timeoutMs));
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeTaskSuccess(value: string): CloseoutCapsule["structuredSummary"]["taskSuccess"] {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  if (
    normalized === "satisfied" ||
    normalized === "unsatisfied" ||
    normalized === "needs_review" ||
    normalized === "blocked" ||
    normalized === "unknown"
  ) {
    return normalized;
  }
  if (normalized.includes("success") || normalized.includes("complete")) {
    return "satisfied";
  }
  if (normalized.includes("review")) {
    return "needs_review";
  }
  if (normalized.includes("block")) {
    return "blocked";
  }
  return "unknown";
}

function clampCloseoutText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 13)).trimEnd()} [truncated]`;
}

function normalizeOpportunitySeedCandidates(
  value: unknown[],
  fallbackEvidenceRefs: string[],
  runtimeJobId: string,
): CloseoutCapsuleOpportunitySeed[] {
  return value
    .map((item, index): CloseoutCapsuleOpportunitySeed | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const title = boundedStringValue(record.title, 120);
      const rationale = boundedStringValue(record.rationale, 600);
      const recommendedNextStep = boundedStringValue(record.recommendedNextStep, 500);
      if (!title || !rationale || !recommendedNextStep) {
        return null;
      }
      return {
        seedId: boundedStringValue(record.seedId, 120) ?? `${runtimeJobId}-seed-${index + 1}`,
        kind: normalizeOpportunitySeedKind(record.kind),
        title,
        rationale,
        recommendedNextStep,
        evidenceRefs: boundedStringArray(record.evidenceRefs, 8, 220, fallbackEvidenceRefs),
        confidence: normalizeConfidence(record.confidence),
      };
    })
    .filter((seed): seed is CloseoutCapsuleOpportunitySeed => seed !== null)
    .slice(0, 20);
}

function createNoOpOpportunitySeed(
  runtimeJobId: string,
  evidenceRefs: string[],
): CloseoutCapsuleOpportunitySeed {
  return {
    seedId: `${runtimeJobId}-no-op-seed`,
    kind: "no_op",
    title: "No proactive follow-up identified",
    rationale: "The model-authored closeout did not identify a bounded actionable follow-up.",
    recommendedNextStep: "Review the human closeout report for context.",
    evidenceRefs: evidenceRefs.slice(0, 3),
    confidence: "medium",
  };
}

function normalizeOpportunitySeedKind(value: unknown): CloseoutCapsuleOpportunitySeed["kind"] {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/gu, "_")
      : "";
  if (
    normalized === "new_skill_candidate" ||
    normalized === "existing_skill_edit" ||
    normalized === "proactive_plan" ||
    normalized === "process_improvement" ||
    normalized === "follow_up_work_item" ||
    normalized === "no_op"
  ) {
    return normalized;
  }
  return "follow_up_work_item";
}

function normalizeConfidence(value: unknown): CloseoutCapsuleOpportunitySeed["confidence"] {
  return value === "low" || value === "high" ? value : "medium";
}

function boundedStringValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function boundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  fallback: string[],
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

export function createDegradedSystemCloseoutCapsule(
  input: CloseoutCapsuleReporterInput & {
    reasonCodes: string[];
    closeoutTiming?: CloseoutCapsuleReporterTiming;
  },
): CloseoutCapsuleReporterResult {
  const createdAt = new Date().toISOString();
  const capsuleId = buildCloseoutCapsuleId({
    runtimeJobId: input.factualRefs.runtimeJobId,
    teamRunId: input.factualRefs.teamRunId,
    createdAt,
  });
  const opportunitySeed = {
    seedId: `${capsuleId}-closeout-repair`,
    kind: "follow_up_work_item" as const,
    title: "Repair model-authored closeout",
    rationale:
      "The workflow completed without a model-authored Closeout Capsule, so the owner-facing report is degraded.",
    recommendedNextStep: "Rerun closeout generation with the approved closeout model path.",
    evidenceRefs: input.factualRefs.artifactRefs.slice(0, 8),
    confidence: "high" as const,
  };
  const capsule = parseCloseoutCapsule({
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
    capsuleId,
    createdAt,
    modelRef: null,
    humanReport: {
      source: "degraded_system_fallback",
      reportMarkdown:
        "Closeout Capsule generation is degraded. The runtime has factual anchors, but no model-authored human report was produced.",
      eli5Progress:
        "The system can point to what happened, but it did not yet have a model write the useful human explanation.",
      limitations: ["model-authored closeout unavailable"],
    },
    structuredSummary: {
      taskSuccess: "needs_review",
      qualityAssessment: "Model-authored quality assessment unavailable.",
      workflowFitAssessment: "Model-authored workflow fit assessment unavailable.",
      agentModelFitAssessment: "Model-authored agent/model fit assessment unavailable.",
      missingWork: ["Generate model-authored Closeout Capsule."],
      validationSummary: "Deterministic fallback only.",
      riskSummary: "Do not treat deterministic fallback as clean success.",
      opportunitySeedIds: [opportunitySeed.seedId],
    },
    roleCloseouts: input.factualRefs.roles.slice(-20).map((role) => ({
      roleId: role.roleId,
      agentId: role.agentId,
      modelRef: role.modelRef,
      source: "degraded_system_fallback",
      askedToDo: input.objectiveSummary.slice(0, 800) || "unknown objective",
      actuallyDid: "Role-specific model-authored closeout was unavailable.",
      worked: [],
      failedOrWeak: ["model-authored role reflection unavailable"],
      wouldImproveNext: ["rerun closeout with model reporter configured"],
      opportunitySeeds: [],
      confidence: "low",
      limitations: ["deterministic fallback only"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    })),
    opportunitySeeds: [opportunitySeed],
    factualRefs: {
      ...input.factualRefs,
      roles: input.factualRefs.roles.slice(-20),
    },
    safetyFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      workQueueLifecycleMutatedDirectly: false,
      authorityGrantedByCloseout: false,
      runtimeJobCreatedByCloseout: false,
    },
  });
  return {
    source: "degraded_system_fallback",
    capsule,
    legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
    reasonCodes: input.reasonCodes,
    closeoutTiming: input.closeoutTiming,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
