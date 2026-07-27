// Lobster plugin module implements lobster tool behavior.
import {
  optionalNonNegativeIntegerSchema,
  optionalPositiveIntegerSchema,
} from "openclaw/plugin-sdk/channel-actions";
import {
  readNonNegativeIntegerParam,
  readPositiveIntegerParam,
} from "openclaw/plugin-sdk/param-readers";
import { jsonResult } from "openclaw/plugin-sdk/tool-results";
import { Type } from "typebox";
import type { OpenClawPluginApi } from "../runtime-api.js";
import {
  createEmbeddedLobsterRunner,
  resolveLobsterCwd,
  type LobsterRunner,
  type LobsterRunnerParams,
} from "./lobster-runner.js";
import {
  type ManagedLobsterFlowResult,
  resumeManagedLobsterFlow,
  runManagedLobsterFlow,
} from "./lobster-taskflow.js";

type BoundTaskFlow = ReturnType<
  NonNullable<OpenClawPluginApi["runtime"]>["tasks"]["managedFlows"]["bindSession"]
>;

type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | {
      [key: string]: JsonLike;
    };

type LobsterToolOptions = {
  runner?: LobsterRunner;
  taskFlow?: BoundTaskFlow;
};

type ManagedFlowRunParams = {
  controllerId: string;
  goal: string;
  currentStep?: string;
  waitingStep?: string;
  stateJson?: JsonLike;
};

type ManagedFlowResumeParams = {
  flowId: string;
  expectedRevision: number;
  currentStep?: string;
  waitingStep?: string;
};

type ManagedFlowCheckpointParams =
  | {
      mode: "create";
      controllerId: string;
      goal: string;
      stateJson: JsonLike;
      currentStep?: string;
      waitingStep?: string;
    }
  | {
      mode: "update";
      flowId: string;
      expectedRevision: number;
      stateJson: JsonLike;
      currentStep?: string;
      waitingStep?: string;
    };

type ManagedFlowFinishParams = {
  flowId: string;
  expectedRevision: number;
  stateJson?: JsonLike;
  currentStep?: string;
};

type ManagedFlowSuccessResult = {
  ok: true;
  envelope: unknown;
  flow: unknown;
  mutation: unknown;
};

function resolveSettledManagedFlow(result: ManagedFlowSuccessResult): unknown {
  if (
    result.mutation &&
    typeof result.mutation === "object" &&
    !Array.isArray(result.mutation) &&
    "applied" in result.mutation &&
    result.mutation.applied === true &&
    "flow" in result.mutation
  ) {
    return result.mutation.flow;
  }
  return result.flow;
}

function readOptionalTrimmedString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalNumber(value: unknown, fieldName: string): number | undefined {
  return readNonNegativeIntegerParam({ [fieldName]: value }, fieldName, {
    message: `${fieldName} must be a non-negative integer`,
  });
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
}

function parseOptionalFlowStateJson(value: unknown): JsonLike | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("flowStateJson must be a JSON string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as JsonLike;
  } catch {
    throw new Error("flowStateJson must be valid JSON");
  }
}

function isEmptyJsonObject(value: JsonLike | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function parseRunFlowParams(params: Record<string, unknown>): ManagedFlowRunParams | null {
  const controllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
  const goal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
  const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
  const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");
  const stateJson = parseOptionalFlowStateJson(params.flowStateJson);
  const resumeFlowId = readOptionalTrimmedString(params.flowId, "flowId");
  const resumeRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
  const stateJsonSignalsRunMode = stateJson !== undefined && !isEmptyJsonObject(stateJson);

  if (resumeFlowId !== undefined || (resumeRevision !== undefined && resumeRevision !== 0)) {
    throw new Error("run action does not accept flowId or flowExpectedRevision");
  }

  const hasRunFields =
    controllerId !== undefined ||
    goal !== undefined ||
    currentStep !== undefined ||
    waitingStep !== undefined ||
    stateJsonSignalsRunMode;

  if (!hasRunFields) {
    return null;
  }
  if (!controllerId) {
    throw new Error("flowControllerId required when using managed TaskFlow run mode");
  }
  if (!goal) {
    throw new Error("flowGoal required when using managed TaskFlow run mode");
  }
  return {
    controllerId,
    goal,
    ...(currentStep ? { currentStep } : {}),
    ...(waitingStep ? { waitingStep } : {}),
    ...(stateJson !== undefined ? { stateJson } : {}),
  };
}

function parseResumeFlowParams(params: Record<string, unknown>): ManagedFlowResumeParams | null {
  const flowId = readOptionalTrimmedString(params.flowId, "flowId");
  const expectedRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
  const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
  const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");
  const token = readOptionalTrimmedString(params.token, "token");
  const approvalId = readOptionalTrimmedString(params.approvalId, "approvalId");
  const approve = readOptionalBoolean(params.approve, "approve");
  const runControllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
  const runGoal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
  const stateJson = parseOptionalFlowStateJson(params.flowStateJson);
  const stateJsonDisallowed = stateJson !== undefined && !isEmptyJsonObject(stateJson);

  if (runControllerId !== undefined || runGoal !== undefined || stateJsonDisallowed) {
    throw new Error("resume action does not accept flowControllerId, flowGoal, or flowStateJson");
  }

  const hasResumeFields =
    flowId !== undefined ||
    (expectedRevision !== undefined && expectedRevision !== 0) ||
    currentStep !== undefined ||
    waitingStep !== undefined;

  if (!hasResumeFields) {
    return null;
  }
  if (!flowId) {
    throw new Error("flowId required when using managed TaskFlow resume mode");
  }
  if (expectedRevision === undefined) {
    throw new Error("flowExpectedRevision required when using managed TaskFlow resume mode");
  }
  if (!token && !approvalId) {
    throw new Error("token or approvalId required when using managed TaskFlow resume mode");
  }
  if (approve === undefined) {
    throw new Error("approve required when using managed TaskFlow resume mode");
  }
  return {
    flowId,
    expectedRevision,
    ...(currentStep ? { currentStep } : {}),
    ...(waitingStep ? { waitingStep } : {}),
  };
}

function parseCheckpointFlowParams(params: Record<string, unknown>): ManagedFlowCheckpointParams {
  const controllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
  const goal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
  const flowId = readOptionalTrimmedString(params.flowId, "flowId");
  const expectedRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
  const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
  const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");
  const stateJson = parseOptionalFlowStateJson(params.flowStateJson);

  if (stateJson === undefined) {
    throw new Error("flowStateJson required for managed TaskFlow checkpoint mode");
  }

  const isUpdate = flowId !== undefined || expectedRevision !== undefined;
  if (isUpdate) {
    if (!flowId || expectedRevision === undefined) {
      throw new Error(
        "flowId and flowExpectedRevision are both required when updating a TaskFlow checkpoint",
      );
    }
    if (controllerId !== undefined || goal !== undefined) {
      throw new Error("TaskFlow checkpoint update does not accept flowControllerId or flowGoal");
    }
    return {
      mode: "update",
      flowId,
      expectedRevision,
      stateJson,
      ...(currentStep ? { currentStep } : {}),
      ...(waitingStep ? { waitingStep } : {}),
    };
  }

  if (!controllerId || !goal) {
    throw new Error(
      "flowControllerId and flowGoal are required when creating a TaskFlow checkpoint",
    );
  }
  return {
    mode: "create",
    controllerId,
    goal,
    stateJson,
    ...(currentStep ? { currentStep } : {}),
    ...(waitingStep ? { waitingStep } : {}),
  };
}

function parseFinishFlowParams(params: Record<string, unknown>): ManagedFlowFinishParams {
  const flowId = readOptionalTrimmedString(params.flowId, "flowId");
  const expectedRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
  const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
  const stateJson = parseOptionalFlowStateJson(params.flowStateJson);
  const controllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
  const goal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
  const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");

  if (!flowId || expectedRevision === undefined) {
    throw new Error(
      "flowId and flowExpectedRevision are required for managed TaskFlow finish mode",
    );
  }
  if (controllerId !== undefined || goal !== undefined || waitingStep !== undefined) {
    throw new Error(
      "TaskFlow finish does not accept flowControllerId, flowGoal, or flowWaitingStep",
    );
  }
  return {
    flowId,
    expectedRevision,
    ...(currentStep ? { currentStep } : {}),
    ...(stateJson !== undefined ? { stateJson } : {}),
  };
}

function isLinkedCorrectionState(value: JsonLike): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.continuitySchema === "openclaw.taskflow.correction.v1",
  );
}

function formatManagedFlowResult(result: ManagedFlowSuccessResult) {
  const envelope =
    result.envelope && typeof result.envelope === "object" && !Array.isArray(result.envelope)
      ? result.envelope
      : { envelope: result.envelope };
  const details = {
    ...envelope,
    flow: resolveSettledManagedFlow(result),
    mutation: result.mutation,
  };
  return jsonResult(details);
}

function formatManagedCheckpointResult(flow: unknown) {
  return jsonResult({
    ok: true,
    status: "waiting",
    flow,
  });
}

function formatManagedTerminalResult(flow: unknown) {
  return jsonResult({
    ok: true,
    status: "succeeded",
    flow,
  });
}

function requireTaskFlowRuntime(
  taskFlow: BoundTaskFlow | undefined,
  action: "run" | "resume" | "checkpoint" | "finish",
) {
  if (!taskFlow) {
    throw new Error(`Managed TaskFlow ${action} mode requires a bound taskFlow runtime`);
  }
  return taskFlow;
}

function resolveManagedFlowToolResult(result: ManagedLobsterFlowResult) {
  if (!result.ok) {
    throw result.error;
  }
  return formatManagedFlowResult(result);
}

export function createLobsterTool(api: OpenClawPluginApi, options?: LobsterToolOptions) {
  const runner = options?.runner ?? createEmbeddedLobsterRunner();
  return {
    name: "lobster",
    label: "Lobster Workflow",
    description:
      "Run Lobster pipelines or revision-safely checkpoint, finish, and resume the bound managed TaskFlow.",
    parameters: Type.Object({
      action: Type.Unsafe<"run" | "resume" | "checkpoint" | "finish">({
        type: "string",
        enum: ["run", "resume", "checkpoint", "finish"],
      }),
      pipeline: Type.Optional(Type.String()),
      argsJson: Type.Optional(Type.String()),
      token: Type.Optional(Type.String()),
      approvalId: Type.Optional(Type.String()),
      approve: Type.Optional(Type.Boolean()),
      cwd: Type.Optional(
        Type.String({
          description:
            "Relative working directory (optional). Must stay within the gateway working directory.",
        }),
      ),
      timeoutMs: optionalPositiveIntegerSchema(),
      maxStdoutBytes: optionalPositiveIntegerSchema(),
      flowControllerId: Type.Optional(Type.String()),
      flowGoal: Type.Optional(Type.String()),
      flowStateJson: Type.Optional(
        Type.String({
          description:
            "JSON state for managed TaskFlow run, checkpoint, or finish. Required for checkpoint.",
        }),
      ),
      flowId: Type.Optional(
        Type.String({
          description:
            "Existing managed TaskFlow id for checkpoint update, finish, or approval resume.",
        }),
      ),
      flowExpectedRevision: optionalNonNegativeIntegerSchema({
        description: "Expected current revision for checkpoint update, finish, or approval resume.",
      }),
      flowCurrentStep: Type.Optional(Type.String()),
      flowWaitingStep: Type.Optional(Type.String()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const action = typeof params.action === "string" ? params.action.trim() : "";
      if (!action) {
        throw new Error("action required");
      }
      if (
        action !== "run" &&
        action !== "resume" &&
        action !== "checkpoint" &&
        action !== "finish"
      ) {
        throw new Error(`Unknown action: ${action}`);
      }

      const taskFlow = options?.taskFlow;
      if (action === "finish") {
        for (const field of ["pipeline", "argsJson", "token", "approvalId", "approve"] as const) {
          if (params[field] !== undefined) {
            throw new Error(`finish action does not accept ${field}`);
          }
        }
        const flowParams = parseFinishFlowParams(params);
        const mutation = requireTaskFlowRuntime(taskFlow, "finish").finish({
          flowId: flowParams.flowId,
          expectedRevision: flowParams.expectedRevision,
          ...(flowParams.currentStep ? { currentStep: flowParams.currentStep } : {}),
          ...(flowParams.stateJson !== undefined ? { stateJson: flowParams.stateJson } : {}),
        });
        if (!mutation.applied) {
          throw new Error(`TaskFlow finish failed: ${mutation.code}`);
        }
        return formatManagedTerminalResult(mutation.flow);
      }
      if (action === "checkpoint") {
        for (const field of ["pipeline", "argsJson", "token", "approvalId", "approve"] as const) {
          if (params[field] !== undefined) {
            throw new Error(`checkpoint action does not accept ${field}`);
          }
        }
        const flowParams = parseCheckpointFlowParams(params);
        const runtime = requireTaskFlowRuntime(taskFlow, "checkpoint");
        const checkpointStep =
          flowParams.waitingStep ?? flowParams.currentStep ?? "await_operator_input";
        if (flowParams.mode === "create") {
          if (isLinkedCorrectionState(flowParams.stateJson)) {
            const handoff = runtime.validateCloseoutHandoff({ stateJson: flowParams.stateJson });
            if (!handoff.valid) {
              throw new Error(`TaskFlow correction handoff failed: ${handoff.code}`);
            }
          }
          return formatManagedCheckpointResult(
            runtime.createManaged({
              controllerId: flowParams.controllerId,
              goal: flowParams.goal,
              status: "waiting",
              currentStep: checkpointStep,
              stateJson: flowParams.stateJson,
            }),
          );
        }
        const mutation = runtime.setWaiting({
          flowId: flowParams.flowId,
          expectedRevision: flowParams.expectedRevision,
          currentStep: checkpointStep,
          stateJson: flowParams.stateJson,
          waitJson: null,
        });
        if (!mutation.applied) {
          throw new Error(`TaskFlow checkpoint failed: ${mutation.code}`);
        }
        return formatManagedCheckpointResult(mutation.flow);
      }

      const cwd = resolveLobsterCwd(params.cwd);
      const timeoutMs = readPositiveIntegerParam(params, "timeoutMs") ?? 20_000;
      const maxStdoutBytes = readPositiveIntegerParam(params, "maxStdoutBytes") ?? 512_000;

      if (api.runtime?.version && api.logger?.debug) {
        api.logger.debug(`lobster plugin runtime=${api.runtime.version}`);
      }

      const runnerParams: LobsterRunnerParams = {
        action,
        ...(typeof params.pipeline === "string" ? { pipeline: params.pipeline } : {}),
        ...(typeof params.argsJson === "string" ? { argsJson: params.argsJson } : {}),
        ...(typeof params.token === "string" ? { token: params.token } : {}),
        ...(typeof params.approvalId === "string" ? { approvalId: params.approvalId } : {}),
        ...(typeof params.approve === "boolean" ? { approve: params.approve } : {}),
        cwd,
        timeoutMs,
        maxStdoutBytes,
      };

      if (action === "run") {
        const flowParams = parseRunFlowParams(params);
        if (flowParams) {
          return resolveManagedFlowToolResult(
            await runManagedLobsterFlow({
              taskFlow: requireTaskFlowRuntime(taskFlow, "run"),
              runner,
              runnerParams,
              controllerId: flowParams.controllerId,
              goal: flowParams.goal,
              ...(flowParams.stateJson !== undefined ? { stateJson: flowParams.stateJson } : {}),
              ...(flowParams.currentStep ? { currentStep: flowParams.currentStep } : {}),
              ...(flowParams.waitingStep ? { waitingStep: flowParams.waitingStep } : {}),
            }),
          );
        }
      } else {
        const flowParams = parseResumeFlowParams(params);
        if (flowParams) {
          return resolveManagedFlowToolResult(
            await resumeManagedLobsterFlow({
              taskFlow: requireTaskFlowRuntime(taskFlow, "resume"),
              runner,
              runnerParams: runnerParams as LobsterRunnerParams & {
                action: "resume";
                approve: boolean;
              } & ({ token: string } | { approvalId: string }),
              flowId: flowParams.flowId,
              expectedRevision: flowParams.expectedRevision,
              ...(flowParams.currentStep ? { currentStep: flowParams.currentStep } : {}),
              ...(flowParams.waitingStep ? { waitingStep: flowParams.waitingStep } : {}),
            }),
          );
        }
      }

      const envelope = await runner.run(runnerParams);
      if (!envelope.ok) {
        throw new Error(envelope.error.message);
      }
      return jsonResult(envelope);
    },
  };
}
