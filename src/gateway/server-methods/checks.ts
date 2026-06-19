import { ErrorCodes, errorShape } from "../../../packages/gateway-protocol/src/index.js";
import { listTaskRecords } from "../../tasks/runtime-internal.js";
import {
  GBrainSignalDetectorCoverageCheckName,
  runGBrainSignalDetectorCoverageCheck,
} from "../../tasks/task-execution-check-run.js";
import { chatHandlers } from "./chat.js";
import type { GatewayRequestHandlers } from "./types.js";

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function submitChatThroughNativeHandler(params: {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  context: Parameters<GatewayRequestHandlers[string]>[0]["context"];
  client: Parameters<GatewayRequestHandlers[string]>[0]["client"];
  isWebchatConnect: Parameters<GatewayRequestHandlers[string]>[0]["isWebchatConnect"];
}) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    void chatHandlers["chat.send"]({
      req: {
        type: "req",
        id: params.idempotencyKey,
        method: "chat.send",
        params: {
          sessionKey: params.sessionKey,
          message: params.message,
          deliver: false,
          idempotencyKey: params.idempotencyKey,
        },
      },
      params: {
        sessionKey: params.sessionKey,
        message: params.message,
        deliver: false,
        idempotencyKey: params.idempotencyKey,
      },
      client: params.client,
      context: params.context,
      isWebchatConnect: params.isWebchatConnect,
      respond: (ok, payload, error) => {
        if (!ok) {
          reject(new Error(error?.message ?? "chat.send failed"));
          return;
        }
        resolve((payload ?? {}) as Record<string, unknown>);
      },
    });
  });
}

export const checksHandlers: GatewayRequestHandlers = {
  "checks.run": async ({ params, respond, context, client, isWebchatConnect }) => {
    const check = typeof params.check === "string" ? params.check.trim() : "";
    if (check !== GBrainSignalDetectorCoverageCheckName) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown check run: ${check || "missing"}`),
      );
      return;
    }

    const agents = stringArray(params.agents);
    if (params.agents !== undefined && !agents) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "checks.run agents must be an array of strings"),
      );
      return;
    }

    const result = await runGBrainSignalDetectorCoverageCheck(
      {
        submitChat: async (chatParams) =>
          await submitChatThroughNativeHandler({
            ...chatParams,
            context,
            client,
            isWebchatConnect,
          }),
        listTasks: async () => listTaskRecords(),
      },
      {
        agents,
        checkRunId: typeof params.checkRunId === "string" ? params.checkRunId : undefined,
        submitTimeoutMs: positiveNumber(params.submitTimeoutMs),
        laneTimeoutMs: positiveNumber(params.laneTimeoutMs),
        pollIntervalMs: positiveNumber(params.pollIntervalMs),
        concurrency: positiveNumber(params.concurrency),
      },
    );
    respond(true, result);
  },
};
