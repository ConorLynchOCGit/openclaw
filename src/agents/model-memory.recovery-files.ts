import fs from "node:fs/promises";
import path from "node:path";

export type ModelMemoryRuntimeStateRecoveryClass =
  | "corrupt_json"
  | "corrupt_jsonl"
  | "truncated_jsonl"
  | "locked_or_busy";

export type ModelMemoryRuntimeStateRecovery = {
  recoveryClass: ModelMemoryRuntimeStateRecoveryClass;
  originalPath: string;
  quarantinedPath?: string;
  detail?: string;
  preservedEntryCount?: number;
  droppedEntryCount?: number;
};

type JsonReadResult<T> = {
  value: T;
  recoveries: ModelMemoryRuntimeStateRecovery[];
};

type JsonLineReadResult<T> = {
  entries: T[];
  recoveries: ModelMemoryRuntimeStateRecovery[];
};

function safeFileSegment(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/gu, "-");
  return normalized.length > 0 ? normalized.slice(0, 48) : "unknown";
}

function isSyntaxErrorLike(error: unknown): boolean {
  return error instanceof SyntaxError;
}

export function isModelMemoryRuntimeStateBusyError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EBUSY" || code === "EAGAIN" || code === "EWOULDBLOCK";
}

async function quarantineRuntimeStateFile(params: {
  filePath: string;
  quarantineDir: string | undefined;
  recoveryClass: ModelMemoryRuntimeStateRecoveryClass;
}): Promise<string | undefined> {
  if (!params.quarantineDir) {
    return undefined;
  }

  const extension = path.extname(params.filePath);
  const baseName = path.basename(params.filePath, extension);
  const quarantinedPath = path.join(
    params.quarantineDir,
    `${safeFileSegment(baseName)}.${params.recoveryClass}.${Date.now()}${extension || ".state"}`,
  );

  try {
    await fs.mkdir(params.quarantineDir, { recursive: true, mode: 0o700 });
    await fs.rename(params.filePath, quarantinedPath);
    return quarantinedPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    if (isModelMemoryRuntimeStateBusyError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function rewriteRecoveredJsonlFile<T>(params: {
  filePath: string;
  entries: T[];
}): Promise<void> {
  await fs.mkdir(path.dirname(params.filePath), { recursive: true, mode: 0o700 });
  const content = params.entries.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.writeFile(params.filePath, content.length > 0 ? `${content}\n` : "", {
    mode: 0o600,
  });
}

export async function readRecoveredJsonFile<T>(params: {
  filePath: string;
  fallback: T;
  parse?: (value: unknown) => T;
  quarantineDir?: string;
  repairCorruption?: boolean;
}): Promise<JsonReadResult<T>> {
  try {
    const text = await fs.readFile(params.filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return {
      value: params.parse ? params.parse(parsed) : (parsed as T),
      recoveries: [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { value: params.fallback, recoveries: [] };
    }
    if (isModelMemoryRuntimeStateBusyError(error)) {
      return {
        value: params.fallback,
        recoveries: [
          {
            recoveryClass: "locked_or_busy",
            originalPath: params.filePath,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    if (isSyntaxErrorLike(error) || error instanceof Error) {
      const quarantinedPath =
        params.repairCorruption === false
          ? undefined
          : await quarantineRuntimeStateFile({
              filePath: params.filePath,
              quarantineDir: params.quarantineDir,
              recoveryClass: "corrupt_json",
            });
      return {
        value: params.fallback,
        recoveries: [
          {
            recoveryClass: "corrupt_json",
            originalPath: params.filePath,
            quarantinedPath,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    throw error;
  }
}

export async function readRecoveredJsonLines<T>(params: {
  filePath: string;
  parse?: (value: unknown) => T;
  quarantineDir?: string;
  repairCorruption?: boolean;
}): Promise<JsonLineReadResult<T>> {
  try {
    const text = await fs.readFile(params.filePath, "utf8");
    const rawLines = text.split(/\n/u);
    const entries: T[] = [];
    const recoveries: ModelMemoryRuntimeStateRecovery[] = [];
    const nonEmptyLineIndexes = rawLines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter((entry) => entry.line.length > 0)
      .map((entry) => entry.index);
    const lastNonEmptyLineIndex = nonEmptyLineIndexes.at(-1) ?? -1;

    for (const [index, rawLine] of rawLines.entries()) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as unknown;
        entries.push(params.parse ? params.parse(parsed) : (parsed as T));
      } catch (error) {
        const recoveryClass: ModelMemoryRuntimeStateRecoveryClass =
          index === lastNonEmptyLineIndex && !text.endsWith("\n")
            ? "truncated_jsonl"
            : "corrupt_jsonl";
        recoveries.push({
          recoveryClass,
          originalPath: params.filePath,
          detail: error instanceof Error ? error.message : String(error),
          preservedEntryCount: entries.length,
          droppedEntryCount: 1,
        });
      }
    }

    if (recoveries.length === 0) {
      return { entries, recoveries };
    }

    let quarantinedPath: string | undefined;
    if (params.repairCorruption !== false) {
      quarantinedPath = await quarantineRuntimeStateFile({
        filePath: params.filePath,
        quarantineDir: params.quarantineDir,
        recoveryClass: recoveries.some((entry) => entry.recoveryClass === "corrupt_jsonl")
          ? "corrupt_jsonl"
          : "truncated_jsonl",
      });
      if (quarantinedPath) {
        await rewriteRecoveredJsonlFile({
          filePath: params.filePath,
          entries,
        });
      }
    }

    return {
      entries,
      recoveries: recoveries.map((entry) => ({
        ...entry,
        quarantinedPath,
      })),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], recoveries: [] };
    }
    if (isModelMemoryRuntimeStateBusyError(error)) {
      return {
        entries: [],
        recoveries: [
          {
            recoveryClass: "locked_or_busy",
            originalPath: params.filePath,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    throw error;
  }
}

export async function listRecoveryQuarantineFiles(
  quarantineDir: string | undefined,
): Promise<string[]> {
  if (!quarantineDir) {
    return [];
  }
  try {
    const entries = await fs.readdir(quarantineDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(quarantineDir, entry.name))
      .toSorted((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function pruneRecoveryQuarantineFiles(params: {
  quarantineDir: string | undefined;
  olderThanMs: number;
  now?: Date;
}): Promise<{ deletedPaths: string[]; keptPaths: string[] }> {
  const deletedPaths: string[] = [];
  const keptPaths: string[] = [];
  if (!params.quarantineDir) {
    return { deletedPaths, keptPaths };
  }
  const nowMs = (params.now ?? new Date()).getTime();
  try {
    const entries = await fs.readdir(params.quarantineDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(params.quarantineDir, entry.name);
      const stat = await fs.stat(filePath);
      if (nowMs - stat.mtimeMs >= params.olderThanMs) {
        await fs.rm(filePath, { force: true });
        deletedPaths.push(filePath);
      } else {
        keptPaths.push(filePath);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return {
    deletedPaths: deletedPaths.toSorted((left, right) => left.localeCompare(right)),
    keptPaths: keptPaths.toSorted((left, right) => left.localeCompare(right)),
  };
}
