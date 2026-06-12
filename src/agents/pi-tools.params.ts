import {
  buildEditToolVisibleSchema,
  buildInvalidEditParameterMessage,
  editRequiredParamGroups,
  normalizeEditToolParams,
} from "./patch-transaction-service.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

export { normalizeEditToolParams } from "./patch-transaction-service.js";

export type RequiredParamGroup = {
  keys: readonly string[];
  allowEmpty?: boolean;
  label?: string;
  validator?: (record: Record<string, unknown>) => boolean;
};

const RETRY_GUIDANCE_SUFFIX = " Supply correct parameters before retrying.";

function parameterValidationError(message: string): Error {
  return new Error(`${message}.${RETRY_GUIDANCE_SUFFIX}`);
}

function describeReceivedParamValue(value: unknown, allowEmpty = false): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    if (allowEmpty || value.trim().length > 0) {
      return undefined;
    }
    return "<empty-string>";
  }
  if (Array.isArray(value)) {
    return "<array>";
  }
  return `<${typeof value}>`;
}

function formatReceivedParamHint(
  record: Record<string, unknown>,
  groups: readonly RequiredParamGroup[],
): string {
  const allowEmptyKeys = new Set(
    groups.filter((group) => group.allowEmpty).flatMap((group) => group.keys),
  );
  const received = Object.keys(record).flatMap((key) => {
    const detail = describeReceivedParamValue(record[key], allowEmptyKeys.has(key));
    if (record[key] === undefined || record[key] === null) {
      return [];
    }
    return [detail ? `${key}=${detail}` : key];
  });
  return received.length > 0 ? ` (received: ${received.join(", ")})` : "";
}

function normalizeParamsForTool(toolName: string, params: unknown): unknown {
  return toolName === "edit" ? normalizeEditToolParams(params) : params;
}

function normalizeEditParameterSchema(parameters: unknown): unknown {
  return buildEditToolVisibleSchema(parameters);
}

export const REQUIRED_PARAM_GROUPS = {
  read: [{ keys: ["path"], label: "path" }],
  write: [
    { keys: ["path"], label: "path" },
    { keys: ["content"], label: "content" },
  ],
  edit: [...editRequiredParamGroups()],
} as const;

export function getToolParamsRecord(params: unknown): Record<string, unknown> | undefined {
  return params && typeof params === "object" ? (params as Record<string, unknown>) : undefined;
}

export function assertRequiredParams(
  record: Record<string, unknown> | undefined,
  groups: readonly RequiredParamGroup[],
  toolName: string,
): void {
  if (!record || typeof record !== "object") {
    throw parameterValidationError(`Missing parameters for ${toolName}`);
  }

  const missingLabels: string[] = [];
  for (const group of groups) {
    const satisfied =
      group.validator?.(record) ??
      group.keys.some((key) => {
        if (!(key in record)) {
          return false;
        }
        const value = record[key];
        if (typeof value !== "string") {
          return false;
        }
        if (group.allowEmpty) {
          return true;
        }
        return value.trim().length > 0;
      });

    if (!satisfied) {
      const label = group.label ?? group.keys.join(" or ");
      missingLabels.push(label);
    }
  }

  if (missingLabels.length > 0) {
    const receivedHint = formatReceivedParamHint(record, groups);
    if (toolName === "edit" && missingLabels.includes("oldString/newString or operations[]")) {
      const otherMissingLabels = missingLabels.filter(
        (label) => label !== "oldString/newString or operations[]",
      );
      const missingText =
        otherMissingLabels.length > 0
          ? ` Missing required ${otherMissingLabels.length === 1 ? "parameter" : "parameters"}: ${otherMissingLabels.join(", ")}.`
          : "";
      throw parameterValidationError(
        `${buildInvalidEditParameterMessage(record)}${missingText}${receivedHint}`,
      );
    }
    const joined = missingLabels.join(", ");
    const noun = missingLabels.length === 1 ? "parameter" : "parameters";
    throw parameterValidationError(`Missing required ${noun}: ${joined}${receivedHint}`);
  }
}

export function wrapToolParamValidation(
  tool: AnyAgentTool,
  requiredParamGroups?: readonly RequiredParamGroup[],
): AnyAgentTool {
  return {
    ...tool,
    parameters:
      tool.name === "edit" ? normalizeEditParameterSchema(tool.parameters) : tool.parameters,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const effectiveParams = normalizeParamsForTool(tool.name, params);
      const record = getToolParamsRecord(effectiveParams);
      if (requiredParamGroups?.length) {
        assertRequiredParams(record, requiredParamGroups, tool.name);
      }
      return tool.execute(toolCallId, effectiveParams, signal, onUpdate);
    },
  };
}
