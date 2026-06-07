import crypto from "node:crypto";
import path from "node:path";

export const RUNTIME_SOURCE_RECORD_MODES = [
  "materialized",
  "local_override",
  "hot_patch",
  "generated_state",
] as const;

export type RuntimeSourceRecordMode = (typeof RUNTIME_SOURCE_RECORD_MODES)[number];

export type RuntimeSourceRecord = {
  runtimePath: string;
  sourcePath?: string;
  sourceCommit?: string;
  beforeHash?: string;
  afterHash: string;
  mode: RuntimeSourceRecordMode;
  reconciled: boolean;
};

export const RUNTIME_FILE_CLASSES = [
  "source_materialized",
  "local_override",
  "secret_auth",
  "session_state",
  "log_cache",
  "generated_artifact",
  "hot_patch",
] as const;

export type RuntimeFileClass = (typeof RUNTIME_FILE_CLASSES)[number];

export type RuntimePathAlias = {
  aliasPath: string;
  canonicalPath: string;
  label?: string;
};

export type RuntimePathResolution = {
  inputPath: string;
  canonicalPath: string;
  isAlias: boolean;
  alias?: RuntimePathAlias;
};

export type RuntimeFileClassification = RuntimePathResolution & {
  fileClass: RuntimeFileClass;
};

export type RuntimeFilePolicy = {
  canInspect: boolean;
  canEdit: boolean;
  editMode?: Extract<RuntimeSourceRecordMode, "hot_patch" | "local_override">;
};

export type RuntimeSourceRecordInput = {
  runtimePath: string;
  sourcePath?: string;
  sourceCommit?: string;
  beforeContent?: string | Uint8Array;
  beforeHash?: string;
  afterContent?: string | Uint8Array;
  afterHash?: string;
  mode: RuntimeSourceRecordMode;
  reconciled?: boolean;
};

export type RuntimeSourceDrift =
  | {
      status: "clean";
      expectedHash: string;
      currentHash: string;
    }
  | {
      status: "drifted";
      expectedHash: string;
      currentHash: string;
    };

function normalizePath(input: string): string {
  return path.resolve(input.trim());
}

function isSameOrWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hashBytes(input: string | Uint8Array): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashRuntimeSourceBytes(input: string | Uint8Array): string {
  return hashBytes(input);
}

export function normalizeRuntimePathAliases(
  runtimeHome: string,
  aliases: RuntimePathAlias[] = [],
): RuntimePathAlias[] {
  const canonicalRuntimeHome = normalizePath(runtimeHome);
  const defaultRuntimeAlias = normalizePath("/home/node/.openclaw");
  const normalizedAliases = aliases.map((alias) => ({
    ...alias,
    aliasPath: normalizePath(alias.aliasPath),
    canonicalPath: normalizePath(alias.canonicalPath),
  }));
  if (
    defaultRuntimeAlias !== canonicalRuntimeHome &&
    !normalizedAliases.some((alias) => alias.aliasPath === defaultRuntimeAlias)
  ) {
    normalizedAliases.push({
      aliasPath: defaultRuntimeAlias,
      canonicalPath: canonicalRuntimeHome,
      label: "container-runtime-home-alias",
    });
  }
  return normalizedAliases;
}

export function resolveRuntimePath(
  inputPath: string,
  options: {
    runtimeHome: string;
    aliases?: RuntimePathAlias[];
  },
): RuntimePathResolution {
  const input = normalizePath(inputPath);
  for (const alias of normalizeRuntimePathAliases(options.runtimeHome, options.aliases)) {
    if (!isSameOrWithin(input, alias.aliasPath)) {
      continue;
    }
    const relative = path.relative(alias.aliasPath, input);
    return {
      inputPath: input,
      canonicalPath: path.join(alias.canonicalPath, relative),
      isAlias: true,
      alias,
    };
  }
  return {
    inputPath: input,
    canonicalPath: input,
    isAlias: false,
  };
}

export function classifyRuntimePath(
  inputPath: string,
  options: {
    runtimeHome: string;
    aliases?: RuntimePathAlias[];
    sourceMaterializedPaths?: string[];
    hotPatchPaths?: string[];
  },
): RuntimeFileClassification {
  const resolved = resolveRuntimePath(inputPath, options);
  const canonical = resolved.canonicalPath;
  const runtimeHome = normalizePath(options.runtimeHome);
  const rel = path.relative(runtimeHome, canonical).split(path.sep).join("/");
  const basename = path.basename(canonical);
  const materialized = new Set(
    (options.sourceMaterializedPaths ?? []).map((item) => normalizePath(item)),
  );
  const hotPatches = new Set((options.hotPatchPaths ?? []).map((item) => normalizePath(item)));

  if (hotPatches.has(canonical)) {
    return { ...resolved, fileClass: "hot_patch" };
  }
  if (materialized.has(canonical)) {
    return { ...resolved, fileClass: "source_materialized" };
  }
  if (
    basename === ".env" ||
    rel.startsWith("credentials/") ||
    rel.startsWith("external-auth/") ||
    basename === "auth-profiles.json" ||
    basename === "auth-state.json" ||
    basename === "models.json"
  ) {
    return { ...resolved, fileClass: "secret_auth" };
  }
  if (rel.includes("/sessions/") || rel.startsWith("sessions/") || basename === "sessions.json") {
    return { ...resolved, fileClass: "session_state" };
  }
  if (rel.startsWith("logs/") || rel.startsWith(".cache/") || rel.includes("/cache/")) {
    return { ...resolved, fileClass: "log_cache" };
  }
  if (
    rel.startsWith("artifacts/") ||
    rel.startsWith("workspace/.openclaw/") ||
    rel.includes("/artifacts/")
  ) {
    return { ...resolved, fileClass: "generated_artifact" };
  }
  if (basename === "openclaw.json" || rel.startsWith("overrides/")) {
    return { ...resolved, fileClass: "local_override" };
  }
  return { ...resolved, fileClass: "generated_artifact" };
}

export function runtimeFilePolicy(fileClass: RuntimeFileClass): RuntimeFilePolicy {
  switch (fileClass) {
    case "source_materialized":
      return { canInspect: true, canEdit: true, editMode: "hot_patch" };
    case "local_override":
      return { canInspect: true, canEdit: true, editMode: "local_override" };
    case "hot_patch":
      return { canInspect: true, canEdit: true, editMode: "hot_patch" };
    case "generated_artifact":
    case "log_cache":
    case "session_state":
      return { canInspect: true, canEdit: false };
    case "secret_auth":
      return { canInspect: false, canEdit: false };
  }
  const _exhaustive: never = fileClass;
  return _exhaustive;
}

export function createRuntimeSourceRecord(input: RuntimeSourceRecordInput): RuntimeSourceRecord {
  const afterHash = input.afterHash ?? (input.afterContent ? hashBytes(input.afterContent) : "");
  if (!afterHash) {
    throw new Error("RuntimeSourceRecord requires afterHash or afterContent.");
  }
  const beforeHash =
    input.beforeHash ?? (input.beforeContent ? hashBytes(input.beforeContent) : "");
  const reconciled =
    input.reconciled ?? (input.mode === "materialized" || input.mode === "local_override");
  return {
    runtimePath: normalizePath(input.runtimePath),
    ...(input.sourcePath ? { sourcePath: normalizePath(input.sourcePath) } : {}),
    ...(input.sourceCommit ? { sourceCommit: input.sourceCommit } : {}),
    ...(beforeHash ? { beforeHash } : {}),
    afterHash,
    mode: input.mode,
    reconciled,
  };
}

export function validateRuntimeSourceRecord(record: RuntimeSourceRecord): string[] {
  const issues: string[] = [];
  if (!record.runtimePath.trim()) {
    issues.push("runtimePath is required");
  }
  if (!record.afterHash.trim()) {
    issues.push("afterHash is required");
  }
  if (record.mode === "materialized" && !record.sourcePath?.trim()) {
    issues.push("materialized records require sourcePath");
  }
  if (record.mode === "hot_patch" && !record.beforeHash?.trim()) {
    issues.push("hot_patch records require beforeHash");
  }
  if (record.mode === "generated_state" && record.sourcePath?.trim()) {
    issues.push("generated_state records should not claim a sourcePath");
  }
  return issues;
}

export function detectRuntimeSourceDrift(
  record: RuntimeSourceRecord,
  current: string | Uint8Array | { hash: string },
): RuntimeSourceDrift {
  const currentHash =
    typeof current === "object" && "hash" in current ? current.hash : hashBytes(current);
  if (currentHash === record.afterHash) {
    return { status: "clean", expectedHash: record.afterHash, currentHash };
  }
  return { status: "drifted", expectedHash: record.afterHash, currentHash };
}
