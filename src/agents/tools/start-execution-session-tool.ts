import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { textResult } from "./common.js";

export const START_EXECUTION_SESSION_TOOL_NAME = "start_execution_session" as const;

const StartExecutionSessionRefSchema = Type.Object(
  {
    ref: Type.String({
      description:
        "Opaque source pointer, e.g. work-queue item, doc, file, runtime job, artifact, or URL.",
    }),
    type: Type.Optional(Type.String()),
    kind: Type.Optional(Type.String()),
    source: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const StartExecutionSessionToolSchema = Type.Object(
  {
    objective: Type.String({
      description: "Concrete execution objective to send as the native session task message.",
    }),
    refs: Type.Array(Type.Union([Type.String(), StartExecutionSessionRefSchema]), {
      description:
        "Opaque pointers to Work Queue items, docs, prompts, runs, files, artifacts, or URLs. The runtime validates authority only; the agent decides meaning.",
    }),
    constraints: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
    validationSignal: Type.Optional(
      Type.String({
        description: "Expected validation signal when known.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type StartExecutionSessionToolInput = {
  objective: string;
  refs: Array<string | { ref: string; type?: string; kind?: string; source?: string }>;
  constraints?: string | string[];
  validationSignal?: string;
};

export type StartExecutionSessionToolResult = {
  status: string;
  runtimeJobId: string;
  sessionId: string;
  agentProfile?: string;
  eventType?: string;
  runStatus?: string;
  runCompleted?: boolean;
  runReasonCodes?: string[];
};

export function formatStartExecutionSessionResult(result: StartExecutionSessionToolResult): string {
  const lines = [
    `Native execution session ${result.status}.`,
    `runtimeJobId: ${result.runtimeJobId}`,
    `sessionId: ${result.sessionId}`,
  ];
  if (result.agentProfile) {
    lines.push(`agentProfile: ${result.agentProfile}`);
  }
  if (result.eventType) {
    lines.push(`event: ${result.eventType}`);
  }
  if (result.runStatus) {
    lines.push(`runStatus: ${result.runStatus}`);
  }
  if (typeof result.runCompleted === "boolean") {
    lines.push(`runCompleted: ${result.runCompleted ? "true" : "false"}`);
  }
  if (result.runReasonCodes?.length) {
    lines.push(`runReasonCodes: ${result.runReasonCodes.slice(0, 12).join(", ")}`);
  }
  return lines.join("\n");
}

export function createStartExecutionSessionTool(opts: {
  startExecutionSession: (
    input: StartExecutionSessionToolInput,
  ) => Promise<StartExecutionSessionToolResult>;
}): AnyAgentTool {
  return {
    name: START_EXECUTION_SESSION_TOOL_NAME,
    label: "start_execution_session",
    displaySummary: "Start or resume a native RuntimeJob-backed agent session",
    description:
      "Start or resume native OpenClaw execution. Use for long-running, mutating, or multi-agent work. Input is only objective, refs, constraints, and validationSignal. The runtime owns lifecycle, evidence, validation, and finish state.",
    parameters: StartExecutionSessionToolSchema,
    execute: async (_toolCallId, args) => {
      const result = await opts.startExecutionSession(args as StartExecutionSessionToolInput);
      return textResult(formatStartExecutionSessionResult(result), result);
    },
  };
}
