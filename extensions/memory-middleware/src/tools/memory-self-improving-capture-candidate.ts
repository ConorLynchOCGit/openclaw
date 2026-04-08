import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import type {
  SelfImprovingCandidateCaptureInput,
  SelfImprovingCandidateCaptureResult,
} from "../self-improving-candidate-capture.js";
import { normalizeCandidateSubmissionInput } from "./candidate-submit.js";
import { asJsonToolResult, readOptionalString, type ToolRawParams } from "./common.js";

type MemorySelfImprovingCaptureCandidateRawParams = ToolRawParams;

const MemorySelfImprovingCaptureCandidateToolSchema = Type.Object(
  {
    kind: Type.String({
      description:
        "Reduced-profile self-improving output kind. The current bounded tranche accepts improvement only.",
      minLength: 1,
    }),
    content: Type.String({
      description:
        "Candidate-only self-improving workflow-guidance content to route through the existing middleware candidate submission seam.",
      minLength: 1,
    }),
    requestedOutputPosture: Type.Optional(
      Type.String({
        description:
          "Optional requested output posture. Only candidate_only is allowed; any other value is blocked.",
        minLength: 1,
      }),
    ),
    sessionId: Type.Optional(
      Type.String({
        description: "Optional explicit session id. Defaults to trusted tool context session.",
      }),
    ),
    projectId: Type.Optional(Type.String({ description: "Optional project id." })),
    agentId: Type.Optional(
      Type.String({
        description: "Optional explicit agent id. Defaults to trusted tool context agent.",
      }),
    ),
    metadata: Type.Optional(
      Type.Object(
        {},
        {
          additionalProperties: true,
          description: "Optional bounded metadata to preserve alongside adaptation provenance.",
        },
      ),
    ),
  },
  { additionalProperties: false },
);

export function normalizeSelfImprovingCandidateCaptureInput(params: {
  rawParams: MemorySelfImprovingCaptureCandidateRawParams;
  context?: OpenClawPluginToolContext;
}): SelfImprovingCandidateCaptureInput {
  const candidateInput = normalizeCandidateSubmissionInput({
    rawParams: params.rawParams,
    context: params.context,
  });

  return {
    ...candidateInput,
    requestedOutputPosture: readOptionalString(params.rawParams, "requestedOutputPosture"),
  };
}

export async function captureSelfImprovingCandidateFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: SelfImprovingCandidateCaptureInput;
}): Promise<SelfImprovingCandidateCaptureResult> {
  return params.runtime.selfImprovingCandidateCapture.capture(params.input);
}

export function createMemorySelfImprovingCaptureCandidateTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_self_improving_capture_candidate",
    label: "Memory Self Improving Capture Candidate",
    description:
      "Capture reduced-profile self-improving workflow-guidance outputs only as candidate-state artifacts through the existing memory middleware candidate seam.",
    parameters: MemorySelfImprovingCaptureCandidateToolSchema,
    async execute(_toolCallId: string, rawParams: MemorySelfImprovingCaptureCandidateRawParams) {
      const input = normalizeSelfImprovingCandidateCaptureInput({
        rawParams,
        context: params.context,
      });
      const result = await captureSelfImprovingCandidateFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
