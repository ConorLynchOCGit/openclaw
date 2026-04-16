type OpenClawPluginConfigSchema = {
  safeParse?: (value: unknown) => {
    success: boolean;
    data?: unknown;
    error?: {
      issues?: Array<{ path: Array<string | number>; message: string }>;
    };
  };
  parse?: (value: unknown) => unknown;
  validate?: (value: unknown) => unknown;
  uiHints?: Record<string, unknown>;
  jsonSchema?: Record<string, unknown>;
};

type Issue = {
  path: Array<string | number>;
  message: string;
};

type SafeParseResult =
  | { success: true; data?: unknown }
  | { success: false; error: { issues: Issue[] } };

export type ModelMemoryPluginConfig = {
  database?: {
    url?: string;
    databaseName?: string;
    name?: string;
    dbName?: string;
  };
  live?: {
    enabled?: boolean;
    includeRetrievalPacks?: boolean;
    modelId?: string;
    candidateModelId?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildIssue(path: Array<string | number>, message: string): SafeParseResult {
  return {
    success: false,
    error: {
      issues: [{ path, message }],
    },
  };
}

function validateOptionalString(
  value: unknown,
  path: Array<string | number>,
): SafeParseResult | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return buildIssue(path, "must be a non-empty string");
  }
  return null;
}

function validateOptionalBoolean(
  value: unknown,
  path: Array<string | number>,
): SafeParseResult | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "boolean") {
    return buildIssue(path, "must be a boolean");
  }
  return null;
}

function safeParseModelMemoryPluginConfig(value: unknown): SafeParseResult {
  if (value === undefined) {
    return { success: true, data: undefined };
  }
  if (!isRecord(value)) {
    return buildIssue([], "expected config object");
  }

  for (const key of Object.keys(value)) {
    if (key !== "database" && key !== "live") {
      return buildIssue([key], "unknown config key");
    }
  }

  const database = value.database;
  if (database !== undefined) {
    if (!isRecord(database)) {
      return buildIssue(["database"], "must be an object");
    }
    for (const key of Object.keys(database)) {
      if (key !== "url" && key !== "databaseName" && key !== "name" && key !== "dbName") {
        return buildIssue(["database", key], "unknown config key");
      }
    }
    const databaseIssues = [
      validateOptionalString(database.url, ["database", "url"]),
      validateOptionalString(database.databaseName, ["database", "databaseName"]),
      validateOptionalString(database.name, ["database", "name"]),
      validateOptionalString(database.dbName, ["database", "dbName"]),
    ].find(Boolean);
    if (databaseIssues) {
      return databaseIssues;
    }
  }

  const live = value.live;
  if (live !== undefined) {
    if (!isRecord(live)) {
      return buildIssue(["live"], "must be an object");
    }
    for (const key of Object.keys(live)) {
      if (
        key !== "enabled" &&
        key !== "includeRetrievalPacks" &&
        key !== "modelId" &&
        key !== "candidateModelId"
      ) {
        return buildIssue(["live", key], "unknown config key");
      }
    }
    const liveIssues = [
      validateOptionalBoolean(live.enabled, ["live", "enabled"]),
      validateOptionalBoolean(live.includeRetrievalPacks, ["live", "includeRetrievalPacks"]),
      validateOptionalString(live.modelId, ["live", "modelId"]),
      validateOptionalString(live.candidateModelId, ["live", "candidateModelId"]),
    ].find(Boolean);
    if (liveIssues) {
      return liveIssues;
    }
  }

  return { success: true, data: value };
}

export function createModelMemoryPluginConfigSchema(): OpenClawPluginConfigSchema {
  return {
    safeParse(value: unknown): SafeParseResult {
      return safeParseModelMemoryPluginConfig(value);
    },
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        database: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            databaseName: { type: "string" },
            name: { type: "string" },
            dbName: { type: "string" },
          },
        },
        live: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            includeRetrievalPacks: { type: "boolean" },
            modelId: { type: "string" },
            candidateModelId: { type: "string" },
          },
        },
      },
    },
  };
}
