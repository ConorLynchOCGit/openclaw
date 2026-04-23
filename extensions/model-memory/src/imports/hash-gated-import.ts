import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type HashGatedImportSourceType =
  | "agent_bootstrap"
  | "memory_file"
  | "root_user_md"
  | "root_memory_md"
  | "daily_note";

export type HashGatedImportAuthority = "bootstrap" | "root_compatibility" | "workspace_note";

export type HashGatedImportSource = {
  sourceId: string;
  sourceType: HashGatedImportSourceType;
  absolutePath: string;
  authority: HashGatedImportAuthority;
  importedBy: string;
};

export type HashGatedImportRecord = {
  schema_version: "model_memory_hash_gated_import.v1";
  source_id: string;
  source_type: HashGatedImportSourceType;
  source_hash: string;
  path_authority: HashGatedImportAuthority;
  imported_by: string;
  import_timestamp: string;
  line_count: number;
  byte_count: number;
  bounded_evidence_hashes: string[];
  import_count: number;
  raw_content_persisted: false;
  generated_root_write_back: false;
};

export type HashGatedImportEvent = {
  schema_version: "model_memory_hash_gated_import_event.v1";
  event_type: "import_skipped" | "import_queued" | "import_written" | "import_failed";
  source_id: string;
  source_type: HashGatedImportSourceType;
  source_hash: string;
  observed_at: string;
  path_authority: HashGatedImportAuthority;
  failure_class?: string;
  failure_stage?: string;
  raw_content_persisted: false;
  generated_root_write_back: false;
};

export type HashGatedImportResult =
  | {
      status: "skipped";
      reason: "unchanged_hash";
      record: HashGatedImportRecord;
      event: HashGatedImportEvent;
    }
  | {
      status: "written";
      record: HashGatedImportRecord;
      event: HashGatedImportEvent;
      importedIds?: {
        sourceId?: string;
        memoryIds?: string[];
        eventIds?: string[];
      };
    }
  | {
      status: "failed";
      record: HashGatedImportRecord;
      event: HashGatedImportEvent;
    };

export type HashGatedImportStore = {
  baseDir: string;
  evaluate(input: {
    source: HashGatedImportSource;
    content?: string;
    importedAt?: Date;
    onChanged?: (input: {
      source: HashGatedImportSource;
      sourceHash: string;
      content: string;
    }) => Promise<{ sourceId?: string; memoryIds?: string[]; eventIds?: string[] } | void>;
  }): Promise<HashGatedImportResult>;
  readState(): Promise<HashGatedImportRecord[]>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function defaultStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.OPENCLAW_STATE_DIR?.trim() || path.join(env.HOME || "/root", ".openclaw");
  return path.join(root, "model-memory", "hash-gated-imports");
}

function assertSafeSourceId(sourceId: string): void {
  if (!/^[A-Za-z0-9_.:@/-]{1,160}$/u.test(sourceId)) {
    throw new Error(`unsafe hash-gated import source id: ${sourceId}`);
  }
}

function lineCount(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/u).length;
}

function boundedEvidenceHashes(content: string): string[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 16)
    .map((line) => sha256(line));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, filePath);
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, {
    flag: "a",
    mode: 0o600,
  });
}

async function readStateFile(filePath: string): Promise<HashGatedImportRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
      records?: HashGatedImportRecord[];
    };
    return parsed.records ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function event(input: {
  eventType: HashGatedImportEvent["event_type"];
  source: HashGatedImportSource;
  sourceHash: string;
  observedAt: Date;
  failureClass?: string;
  failureStage?: string;
}): HashGatedImportEvent {
  return {
    schema_version: "model_memory_hash_gated_import_event.v1",
    event_type: input.eventType,
    source_id: input.source.sourceId,
    source_type: input.source.sourceType,
    source_hash: input.sourceHash,
    observed_at: input.observedAt.toISOString(),
    path_authority: input.source.authority,
    failure_class: input.failureClass,
    failure_stage: input.failureStage,
    raw_content_persisted: false,
    generated_root_write_back: false,
  };
}

function buildRecord(input: {
  source: HashGatedImportSource;
  sourceHash: string;
  content: string;
  importedAt: Date;
  previous?: HashGatedImportRecord;
}): HashGatedImportRecord {
  return {
    schema_version: "model_memory_hash_gated_import.v1",
    source_id: input.source.sourceId,
    source_type: input.source.sourceType,
    source_hash: input.sourceHash,
    path_authority: input.source.authority,
    imported_by: input.source.importedBy,
    import_timestamp: input.importedAt.toISOString(),
    line_count: lineCount(input.content),
    byte_count: Buffer.byteLength(input.content, "utf8"),
    bounded_evidence_hashes: boundedEvidenceHashes(input.content),
    import_count: (input.previous?.import_count ?? 0) + 1,
    raw_content_persisted: false,
    generated_root_write_back: false,
  };
}

export function createHashGatedImportStore(
  input: {
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): HashGatedImportStore {
  const baseDir = path.resolve(input.baseDir ?? defaultStateDir(input.env ?? process.env));
  const statePath = path.join(baseDir, "state.json");
  const eventsPath = path.join(baseDir, "events.jsonl");

  async function persistState(records: HashGatedImportRecord[]): Promise<void> {
    await writeJsonAtomic(statePath, {
      schema_version: "model_memory_hash_gated_import_state.v1",
      updated_at: new Date().toISOString(),
      records: records.toSorted((left, right) => left.source_id.localeCompare(right.source_id)),
    });
  }

  return {
    baseDir,
    readState() {
      return readStateFile(statePath);
    },
    async evaluate({ source, content, importedAt, onChanged }) {
      assertSafeSourceId(source.sourceId);
      const importedTime = importedAt ?? new Date();
      const sourceContent = content ?? (await readFile(source.absolutePath, "utf8"));
      const sourceHash = sha256(sourceContent);
      const records = await readStateFile(statePath);
      const previous = records.find((record) => record.source_id === source.sourceId);
      const nextRecord = buildRecord({
        source,
        sourceHash,
        content: sourceContent,
        importedAt: importedTime,
        previous,
      });

      if (previous?.source_hash === sourceHash) {
        const skipped = event({
          eventType: "import_skipped",
          source,
          sourceHash,
          observedAt: importedTime,
        });
        await appendJsonLine(eventsPath, skipped);
        return {
          status: "skipped",
          reason: "unchanged_hash",
          record: previous,
          event: skipped,
        };
      }

      await appendJsonLine(
        eventsPath,
        event({ eventType: "import_queued", source, sourceHash, observedAt: importedTime }),
      );
      try {
        const importedIds = await onChanged?.({
          source,
          sourceHash,
          content: sourceContent,
        });
        const nextRecords = [
          ...records.filter((record) => record.source_id !== source.sourceId),
          nextRecord,
        ];
        await persistState(nextRecords);
        const written = event({
          eventType: "import_written",
          source,
          sourceHash,
          observedAt: importedTime,
        });
        await appendJsonLine(eventsPath, written);
        return {
          status: "written",
          record: nextRecord,
          event: written,
          importedIds: importedIds ?? undefined,
        };
      } catch (error) {
        const failed = event({
          eventType: "import_failed",
          source,
          sourceHash,
          observedAt: importedTime,
          failureClass: "import_callback_failed",
          failureStage: error instanceof Error ? error.name : "unknown",
        });
        await appendJsonLine(eventsPath, failed);
        return {
          status: "failed",
          record: nextRecord,
          event: failed,
        };
      }
    },
  };
}
