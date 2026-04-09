import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateVettingDecision,
  SkillCandidateVettingResultInput,
  SkillCandidateVettingResultRecordResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type SkillCandidateVettingResultRecordRawParams = ToolRawParams;

const SkillCandidateVettingResultRecordToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description: "Bounded skill-candidate id to attach a bounded vetting result to.",
      minLength: 1,
    }),
    decision: Type.Union([
      Type.Literal("reject"),
      Type.Literal("defer"),
      Type.Literal("approve_limited"),
      Type.Literal("approve_normal"),
    ]),
    summary: Type.Optional(
      Type.String({
        description: "Optional bounded summary of the vetting result.",
        minLength: 1,
      }),
    ),
    reviewerAgentId: Type.Optional(
      Type.String({
        description: "Optional reviewer agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    permissionsRisk: Type.Object(
      {
        level: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
        notes: Type.Array(Type.String({ minLength: 1 })),
        requiredChecks: Type.Array(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
    suspiciousPatterns: Type.Object(
      {
        redFlags: Type.Array(Type.String({ minLength: 1 })),
        unresolvedQuestions: Type.Array(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
    operationalFit: Type.Object(
      {
        fit: Type.Union([Type.Literal("good"), Type.Literal("limited"), Type.Literal("poor")]),
        notes: Type.Array(Type.String({ minLength: 1 })),
        acceleratorOnly: Type.Boolean(),
        canonicalMemorySubstrate: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    approvalRecommendation: Type.Object(
      {
        proposedLifecycleState: Type.Union([
          Type.Literal("under_review"),
          Type.Literal("vetted"),
          Type.Literal("approved_limited"),
          Type.Literal("approved_normal"),
          Type.Literal("rejected"),
          Type.Literal("quarantined"),
        ]),
        installRecommendation: Type.Union([
          Type.Literal("do_not_install"),
          Type.Literal("manual_followup_required"),
        ]),
        blockers: Type.Array(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "Optional vetting-result metadata." },
      ),
    ),
  },
  { additionalProperties: false },
);

function readRequiredObjectField(
  rawParams: SkillCandidateVettingResultRecordRawParams,
  key: string,
): Record<string, unknown> {
  const value = rawParams[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readStringArrayFromObject(object: Record<string, unknown>, key: string): string[] {
  const value = object[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value.map((item) => item.trim());
}

function readDecision(
  rawParams: SkillCandidateVettingResultRecordRawParams,
): SkillCandidateVettingDecision {
  const decision = readRequiredString(rawParams, "decision");
  if (
    decision !== "reject" &&
    decision !== "defer" &&
    decision !== "approve_limited" &&
    decision !== "approve_normal"
  ) {
    throw new Error("decision must be one of: reject, defer, approve_limited, approve_normal");
  }
  return decision;
}

export function normalizeSkillCandidateVettingResultRecordInput(params: {
  rawParams: SkillCandidateVettingResultRecordRawParams;
  context?: OpenClawPluginToolContext;
}): SkillCandidateVettingResultInput {
  const skillCandidateId = readRequiredString(params.rawParams, "skillCandidateId");
  const decision = readDecision(params.rawParams);
  const summary = readOptionalString(params.rawParams, "summary");
  const reviewerAgentId =
    readOptionalString(params.rawParams, "reviewerAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  const permissionsRiskObject = readRequiredObjectField(params.rawParams, "permissionsRisk");
  const permissionsLevel = readRequiredString(permissionsRiskObject, "level");
  if (permissionsLevel !== "low" && permissionsLevel !== "medium" && permissionsLevel !== "high") {
    throw new Error("permissionsRisk.level must be one of: low, medium, high");
  }

  const suspiciousPatternsObject = readRequiredObjectField(params.rawParams, "suspiciousPatterns");

  const operationalFitObject = readRequiredObjectField(params.rawParams, "operationalFit");
  const operationalFitValue = readRequiredString(operationalFitObject, "fit");
  if (
    operationalFitValue !== "good" &&
    operationalFitValue !== "limited" &&
    operationalFitValue !== "poor"
  ) {
    throw new Error("operationalFit.fit must be one of: good, limited, poor");
  }
  if (typeof operationalFitObject.acceleratorOnly !== "boolean") {
    throw new Error("operationalFit.acceleratorOnly must be a boolean");
  }
  if (typeof operationalFitObject.canonicalMemorySubstrate !== "boolean") {
    throw new Error("operationalFit.canonicalMemorySubstrate must be a boolean");
  }

  const approvalRecommendationObject = readRequiredObjectField(
    params.rawParams,
    "approvalRecommendation",
  );
  const proposedLifecycleState = readRequiredString(
    approvalRecommendationObject,
    "proposedLifecycleState",
  );
  if (
    proposedLifecycleState !== "under_review" &&
    proposedLifecycleState !== "vetted" &&
    proposedLifecycleState !== "approved_limited" &&
    proposedLifecycleState !== "approved_normal" &&
    proposedLifecycleState !== "rejected" &&
    proposedLifecycleState !== "quarantined"
  ) {
    throw new Error(
      "approvalRecommendation.proposedLifecycleState must be one of: under_review, vetted, approved_limited, approved_normal, rejected, quarantined",
    );
  }
  const installRecommendation = readRequiredString(
    approvalRecommendationObject,
    "installRecommendation",
  );
  if (
    installRecommendation !== "do_not_install" &&
    installRecommendation !== "manual_followup_required"
  ) {
    throw new Error(
      "approvalRecommendation.installRecommendation must be one of: do_not_install, manual_followup_required",
    );
  }

  return {
    skillCandidateId,
    decision,
    ...(summary ? { summary } : {}),
    ...(reviewerAgentId ? { reviewerAgentId } : {}),
    permissionsRisk: {
      level: permissionsLevel,
      notes: readStringArrayFromObject(permissionsRiskObject, "notes"),
      requiredChecks: readStringArrayFromObject(permissionsRiskObject, "requiredChecks"),
    },
    suspiciousPatterns: {
      redFlags: readStringArrayFromObject(suspiciousPatternsObject, "redFlags"),
      unresolvedQuestions: readStringArrayFromObject(
        suspiciousPatternsObject,
        "unresolvedQuestions",
      ),
    },
    operationalFit: {
      fit: operationalFitValue,
      notes: readStringArrayFromObject(operationalFitObject, "notes"),
      acceleratorOnly: operationalFitObject.acceleratorOnly as boolean,
      canonicalMemorySubstrate: operationalFitObject.canonicalMemorySubstrate as boolean,
    },
    approvalRecommendation: {
      proposedLifecycleState,
      installRecommendation,
      blockers: readStringArrayFromObject(approvalRecommendationObject, "blockers"),
    },
    ...(metadata ? { metadata } : {}),
  };
}

export async function createSkillCandidateVettingResultRecordFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateVettingResultInput;
}): Promise<SkillCandidateVettingResultRecordResult> {
  return params.runtime.skillCandidateVettingResult.create(params.input);
}

export function createSkillCandidateVettingResultRecordTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_vetting_result_record",
    label: "Memory Skill Candidate Vetting Result Record",
    description:
      "Create one bounded internal manual vetting-result record for an eligible skill candidate without invoking Skill Vetter, installing skills, or changing approval state.",
    parameters: SkillCandidateVettingResultRecordToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateVettingResultRecordRawParams) {
      const input = normalizeSkillCandidateVettingResultRecordInput({
        rawParams,
        context: params.context,
      });
      const result = await createSkillCandidateVettingResultRecordFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
