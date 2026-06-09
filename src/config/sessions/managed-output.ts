import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ManagedToolOutputRecord = {
  schemaVersion: 1;
  ref: string;
  id: string;
  createdAt: number;
  stateRoot: string;
  outputPath: string;
  metadataPath: string;
  toolName: string;
  sessionKey?: string;
  toolCallId?: string;
  outputKind?: string;
  byteCount: number;
  textHash: string;
  reason?: string;
};

export type PersistManagedToolOutputResult = {
  ref: string;
  id: string;
  byteCount: number;
  textHash: string;
};

export type ManagedToolOutputStream = {
  ref: string;
  id: string;
  outputPath: string;
  metadataPath: string;
  append: (chunk: string) => void;
  finalize: () => PersistManagedToolOutputResult;
  discard: () => void;
};

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "_").replace(/^_+|_+$/gu, "") || "unknown";
}

function buildManagedOutputId(params: {
  createdAt: number;
  toolName: string;
  textHash: string;
  toolCallId?: string;
}): string {
  const toolName = sanitizePathSegment(params.toolName);
  const callPart = params.toolCallId
    ? `${sanitizePathSegment(params.toolCallId).slice(0, 32)}_`
    : "";
  return `mout_${params.createdAt}_${toolName}_${callPart}${params.textHash.slice(0, 16)}`;
}

export function buildManagedToolOutputRef(params: {
  sessionKey?: string | null;
  id: string;
}): string {
  const sessionPart = encodeURIComponent(params.sessionKey?.trim() || "global");
  return `openclaw-managed-output://${sessionPart}/${encodeURIComponent(params.id.trim())}`;
}

function writeFileAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function buildManagedOutputPaths(params: { stateRoot: string; createdAt: number; id: string }): {
  outputPath: string;
  metadataPath: string;
} {
  const date = new Date(params.createdAt).toISOString().slice(0, 10);
  const outputDir = path.join(params.stateRoot, "managed-tool-output", date);
  return {
    outputPath: path.join(outputDir, `${params.id}.txt`),
    metadataPath: path.join(outputDir, `${params.id}.json`),
  };
}

function writeManagedOutputMetadataSync(record: ManagedToolOutputRecord): void {
  writeFileAtomicSync(record.metadataPath, `${JSON.stringify(record, null, 2)}\n`);
}

export function persistManagedToolOutputSync(params: {
  stateRoot?: string | null;
  sessionKey?: string | null;
  toolCallId?: string | null;
  toolName: string;
  text: string;
  outputKind?: string | null;
  reason?: string | null;
  now?: number;
}): PersistManagedToolOutputResult | null {
  const stateRoot = normalizeOptionalString(params.stateRoot);
  if (!stateRoot || params.text.length === 0) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const createdAt = params.now ?? Date.now();
  const textHash = crypto.createHash("sha256").update(params.text, "utf8").digest("hex");
  const toolCallId = normalizeOptionalString(params.toolCallId);
  const sessionKey = normalizeOptionalString(params.sessionKey);
  const id = buildManagedOutputId({
    createdAt,
    toolName: params.toolName,
    textHash,
    toolCallId,
  });
  const { outputPath, metadataPath } = buildManagedOutputPaths({
    stateRoot: resolvedStateRoot,
    createdAt,
    id,
  });
  const ref = buildManagedToolOutputRef({ sessionKey, id });
  const byteCount = Buffer.byteLength(params.text, "utf8");
  const record: ManagedToolOutputRecord = {
    schemaVersion: 1,
    ref,
    id,
    createdAt,
    stateRoot: resolvedStateRoot,
    outputPath,
    metadataPath,
    toolName: params.toolName,
    ...(sessionKey ? { sessionKey } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(normalizeOptionalString(params.outputKind)
      ? { outputKind: normalizeOptionalString(params.outputKind) }
      : {}),
    byteCount,
    textHash,
    ...(normalizeOptionalString(params.reason)
      ? { reason: normalizeOptionalString(params.reason) }
      : {}),
  };

  writeFileAtomicSync(outputPath, params.text);
  writeManagedOutputMetadataSync(record);
  return {
    ref,
    id,
    byteCount,
    textHash,
  };
}

export function createManagedToolOutputStreamSync(params: {
  stateRoot?: string | null;
  sessionKey?: string | null;
  toolCallId?: string | null;
  toolName: string;
  outputKind?: string | null;
  reason?: string | null;
  now?: number;
}): ManagedToolOutputStream | null {
  const stateRoot = normalizeOptionalString(params.stateRoot);
  if (!stateRoot) {
    return null;
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const createdAt = params.now ?? Date.now();
  const toolCallId = normalizeOptionalString(params.toolCallId);
  const sessionKey = normalizeOptionalString(params.sessionKey);
  const id = `mout_${createdAt}_${sanitizePathSegment(params.toolName)}_${
    toolCallId ? `${sanitizePathSegment(toolCallId).slice(0, 32)}_` : ""
  }${crypto.randomUUID().replace(/-/gu, "").slice(0, 16)}`;
  const { outputPath, metadataPath } = buildManagedOutputPaths({
    stateRoot: resolvedStateRoot,
    createdAt,
    id,
  });
  const ref = buildManagedToolOutputRef({ sessionKey, id });
  const hash = crypto.createHash("sha256");
  let byteCount = 0;
  let finalized = false;
  let finalizedResult: PersistManagedToolOutputResult | null = null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, "", { encoding: "utf8", mode: 0o600 });

  return {
    ref,
    id,
    outputPath,
    metadataPath,
    append: (chunk: string) => {
      if (finalized || chunk.length === 0) {
        return;
      }
      fs.appendFileSync(outputPath, chunk, { encoding: "utf8" });
      hash.update(chunk, "utf8");
      byteCount += Buffer.byteLength(chunk, "utf8");
    },
    finalize: () => {
      if (finalizedResult) {
        return finalizedResult;
      }
      const textHash = hash.digest("hex");
      finalized = true;
      const record: ManagedToolOutputRecord = {
        schemaVersion: 1,
        ref,
        id,
        createdAt,
        stateRoot: resolvedStateRoot,
        outputPath,
        metadataPath,
        toolName: params.toolName,
        ...(sessionKey ? { sessionKey } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(normalizeOptionalString(params.outputKind)
          ? { outputKind: normalizeOptionalString(params.outputKind) }
          : {}),
        byteCount,
        textHash,
        ...(normalizeOptionalString(params.reason)
          ? { reason: normalizeOptionalString(params.reason) }
          : {}),
      };
      writeManagedOutputMetadataSync(record);
      finalizedResult = {
        ref,
        id,
        byteCount,
        textHash,
      };
      return finalizedResult;
    },
    discard: () => {
      if (finalized) {
        return;
      }
      finalized = true;
      try {
        fs.rmSync(outputPath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
    },
  };
}
