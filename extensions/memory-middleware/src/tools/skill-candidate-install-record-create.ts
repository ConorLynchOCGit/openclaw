import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type {
  SkillCandidateInstallRecordInput,
  SkillCandidateInstallRecordResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  asJsonToolResult,
  readOptionalObject,
  readOptionalString,
  readRequiredString,
  type ToolRawParams,
} from "./common.js";

type SkillCandidateInstallRecordCreateRawParams = ToolRawParams;

const SkillCandidateInstallRecordCreateToolSchema = Type.Object(
  {
    skillCandidateId: Type.String({
      description: "Approved bounded skill-candidate id to persist as an internal install record.",
      minLength: 1,
    }),
    installNotes: Type.Optional(
      Type.String({
        description: "Optional bounded notes about the manual install outcome being recorded.",
        minLength: 1,
      }),
    ),
    installerAgentId: Type.Optional(
      Type.String({
        description: "Optional installer agent id. Falls back to trusted tool context.",
        minLength: 1,
      }),
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        { additionalProperties: true, description: "Optional install-record metadata." },
      ),
    ),
  },
  { additionalProperties: false },
);

export function normalizeSkillCandidateInstallRecordCreateInput(params: {
  rawParams: SkillCandidateInstallRecordCreateRawParams;
  context?: OpenClawPluginToolContext;
}): SkillCandidateInstallRecordInput {
  const skillCandidateId = readRequiredString(params.rawParams, "skillCandidateId");
  const installNotes = readOptionalString(params.rawParams, "installNotes");
  const installerAgentId =
    readOptionalString(params.rawParams, "installerAgentId") ?? params.context?.agentId;
  const metadata = readOptionalObject(params.rawParams, "metadata");

  return {
    skillCandidateId,
    ...(installNotes ? { installNotes } : {}),
    ...(installerAgentId ? { installerAgentId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export async function createSkillCandidateInstallRecordFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SkillCandidateInstallRecordInput;
}): Promise<SkillCandidateInstallRecordResult> {
  return params.runtime.skillCandidateInstallRecord.create(params.input);
}

export function createSkillCandidateInstallRecordCreateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_skill_candidate_install_record_create",
    label: "Memory Skill Candidate Install Record Create",
    description:
      "Persist one bounded internal install record for an approved skill candidate without installing skills or mutating runtime skill state.",
    parameters: SkillCandidateInstallRecordCreateToolSchema,
    async execute(_toolCallId: string, rawParams: SkillCandidateInstallRecordCreateRawParams) {
      const input = normalizeSkillCandidateInstallRecordCreateInput({
        rawParams,
        context: params.context,
      });
      const result = await createSkillCandidateInstallRecordFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
