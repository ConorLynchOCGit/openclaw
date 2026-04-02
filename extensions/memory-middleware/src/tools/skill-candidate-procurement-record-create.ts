import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateProcurementRecordInput,
  SkillCandidateProcurementRecordResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type SkillCandidateProcurementRecordCreateRawParams = ToolRawParams;

const SkillCandidateProcurementRecordCreateToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description:
        "Bounded skill-candidate id to persist as an internal procurement/vetting record.",
      minLength: 1,
    }),
    rationale: Type.Optional(
      Type.String({
        description: "Optional bounded rationale for this internal procurement-record creation.",
        minLength: 1,
      }),
    ),
    recorderAgentId: Type.Optional(
      Type.String({
        description: "Optional recorder agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "Optional procurement-record metadata." },
      ),
    ),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateProcurementRecordCreateInput(params: {
  rawParams: SkillCandidateProcurementRecordCreateRawParams;
  context?: OpenClawPluginToolContext;
}): SkillCandidateProcurementRecordInput {
  const skillCandidateId = readRequiredString(params.rawParams, "skillCandidateId");
  const rationale = readOptionalString(params.rawParams, "rationale");
  const recorderAgentId =
    readOptionalString(params.rawParams, "recorderAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    skillCandidateId,
    ...(rationale ? { rationale } : {}),
    ...(recorderAgentId ? { recorderAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function createSkillCandidateProcurementRecordFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateProcurementRecordInput;
}): Promise<SkillCandidateProcurementRecordResult> {
  return params.runtime.skillCandidateProcurementRecord.create(params.input);
}

export function createSkillCandidateProcurementRecordCreateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_procurement_record_create",
    label: "Memory Skill Candidate Procurement Record Create",
    description:
      "Create one bounded internal procurement/vetting record from an eligible skill candidate without invoking Skill Vetter, installing skills, or triggering downstream workflows.",
    parameters: SkillCandidateProcurementRecordCreateToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateProcurementRecordCreateRawParams) {
      const input = normalizeSkillCandidateProcurementRecordCreateInput({
        rawParams,
        context: params.context,
      });
      const result = await createSkillCandidateProcurementRecordFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
