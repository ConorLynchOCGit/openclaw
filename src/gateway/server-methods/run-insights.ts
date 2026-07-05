// Run-insights gateway method exposes the same bounded advisory report as the
// CLI without adding a second run-state authority.
import { ErrorCodes, errorShape } from "../../../packages/gateway-protocol/src/index.js";
import {
  loadRunInsightsReport,
  resolveRunInsightsOptions,
  type RunInsightsRequest,
} from "../../commands/run-insights.js";
import type { GatewayRequestHandlers } from "./types.js";

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

function readOptionalStringOrNumber(
  record: Record<string, unknown>,
  key: string,
): string | number | undefined | null {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined | null {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "boolean" ? value : null;
}

function normalizeRunInsightsParams(params: unknown):
  | {
      ok: true;
      value: RunInsightsRequest;
    }
  | {
      ok: false;
      message: string;
    } {
  const record = readRecord(params);
  const agent = readOptionalString(record, "agent");
  const session = readOptionalString(record, "session");
  const task = readOptionalString(record, "task");
  const limit = readOptionalStringOrNumber(record, "limit");
  const active = readOptionalStringOrNumber(record, "active");
  const activeMinutes = readOptionalStringOrNumber(record, "activeMinutes");
  const includeBackground = readOptionalBoolean(record, "includeBackground");

  for (const [key, value] of [
    ["agent", agent],
    ["session", session],
    ["task", task],
    ["limit", limit],
    ["active", active],
    ["activeMinutes", activeMinutes],
    ["includeBackground", includeBackground],
  ] as const) {
    if (value === null) {
      return { ok: false, message: `${key} must be a string, number, or boolean where applicable` };
    }
  }
  if (
    active !== undefined &&
    activeMinutes !== undefined &&
    String(active) !== String(activeMinutes)
  ) {
    return { ok: false, message: "active and activeMinutes must not conflict" };
  }

  const request: RunInsightsRequest = {};
  if (agent !== undefined && agent !== null) {
    request.agent = agent;
  }
  if (session !== undefined && session !== null) {
    request.session = session;
  }
  if (task !== undefined && task !== null) {
    request.task = task;
  }
  if (limit !== undefined && limit !== null) {
    request.limit = limit;
  }
  if (activeMinutes !== undefined && activeMinutes !== null) {
    request.active = activeMinutes;
  } else if (active !== undefined && active !== null) {
    request.active = active;
  }
  if (includeBackground === true) {
    request.includeBackground = true;
  }
  return { ok: true, value: request };
}

export const runInsightsHandlers: GatewayRequestHandlers = {
  "run.insights": async ({ params, respond }) => {
    const normalized = normalizeRunInsightsParams(params);
    if (!normalized.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, normalized.message));
      return;
    }
    const resolved = resolveRunInsightsOptions(normalized.value);
    if (!resolved.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, resolved.message));
      return;
    }
    const report = await loadRunInsightsReport(resolved.value);
    respond(true, report);
  },
};

export const testApi = {
  normalizeRunInsightsParams,
};
export { testApi as __test };
