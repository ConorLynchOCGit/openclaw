import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  emitMemoryIngestionCloseoutIfConfigured,
  type MemoryIngestionCloseoutArtifact,
} from "../ingestion/closeout-artifacts.ts";
import {
  classifyMemoryIngestionFailure,
  createMemoryIngestionTelemetryEvent,
  type MemoryIngestionPath,
  type MemoryIngestionStage,
} from "../ingestion/shared-pipeline.ts";

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
      closeoutArtifact?: MemoryIngestionCloseoutArtifact;
    }
  | {
      status: "written";
      record: HashGatedImportRecord;
      event: HashGatedImportEvent;
      closeoutArtifact?: MemoryIngestionCloseoutArtifact;
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
      closeoutArtifact?: MemoryIngestionCloseoutArtifact;
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

function resolveIngestionPath(
  sourceType: HashGatedImportSourceType,
): Extract<MemoryIngestionPath, "bootstrap_import" | "memory_file_import"> {
  return sourceType === "agent_bootstrap" ? "bootstrap_import" : "memory_file_import";
}

function resolveFailureStage(error: unknown): MemoryIngestionStage {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "EISDIR") {
    return "source_intake";
  }
  if (code === "EACCES" || code === "EPERM") {
    return "source_intake";
  }
  return "execution";
}

async function emitHashGatedImportCloseout(input: {
  env: NodeJS.ProcessEnv | undefined;
  source: HashGatedImportSource;
  sourceHash: string;
  importedAt: Date;
  status: "written" | "skipped" | "failed";
  importedIds?: {
    sourceId?: string;
    memoryIds?: string[];
    eventIds?: string[];
  };
  failure?: {
    message: string;
    stage: MemoryIngestionStage;
  };
}): Promise<MemoryIngestionCloseoutArtifact | undefined> {
  const admittedIds = input.importedIds?.memoryIds ?? [];
  const eventIds = input.importedIds?.eventIds ?? [];
  const failureClass =
    input.failure?.message !== undefined
      ? classifyMemoryIngestionFailure(input.failure.message)
      : undefined;
  return emitMemoryIngestionCloseoutIfConfigured({
    env: input.env,
    path: resolveIngestionPath(input.source.sourceType),
    runId: `${input.source.sourceType}:${input.source.sourceId}:${input.importedAt.toISOString()}`,
    sourceId: input.importedIds?.sourceId ?? input.source.sourceId,
    sourceHash: input.sourceHash,
    telemetryEvents: [
      createMemoryIngestionTelemetryEvent({
        path: resolveIngestionPath(input.source.sourceType),
        stage:
          input.failure?.stage ??
          (input.status === "skipped" ? "source_fingerprint" : "persistence_boundary"),
        status:
          input.status === "written"
            ? "completed"
            : input.status === "skipped"
              ? "skipped"
              : "failed",
        failure_class: failureClass,
        candidate_counts:
          input.status === "written"
            ? {
                valid: admittedIds.length,
                admitted: admittedIds.length,
              }
            : undefined,
        ids: {
          source_ids: [input.importedIds?.sourceId ?? input.source.sourceId],
          memory_ids: admittedIds,
          event_ids: eventIds,
        },
      }),
    ],
    dirtyState: { status: "not_required", reason: "hash_gated_import" },
  });
}

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
      let previous: HashGatedImportRecord | undefined;
      let sourceContentForFailure = typeof content === "string" ? content : "";
      try {
        const sourceContent = content ?? (await readFile(source.absolutePath, "utf8"));
        sourceContentForFailure = sourceContent;
        const sourceHash = sha256(sourceContent);
        const records = await readStateFile(statePath);
        previous = records.find((record) => record.source_id === source.sourceId);
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
          const closeoutArtifact = await emitHashGatedImportCloseout({
            env: input.env ?? process.env,
            source,
            sourceHash,
            importedAt: importedTime,
            status: "skipped",
          });
          return {
            status: "skipped",
            reason: "unchanged_hash",
            record: previous,
            event: skipped,
            closeoutArtifact,
          };
        }

        await appendJsonLine(
          eventsPath,
          event({ eventType: "import_queued", source, sourceHash, observedAt: importedTime }),
        );
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
        const closeoutArtifact = await emitHashGatedImportCloseout({
          env: input.env ?? process.env,
          source,
          sourceHash,
          importedAt: importedTime,
          status: "written",
          importedIds: importedIds ?? undefined,
        });
        return {
          status: "written",
          record: nextRecord,
          event: written,
          closeoutArtifact,
          importedIds: importedIds ?? undefined,
        };
      } catch (error) {
        const sourceHash =
          typeof content === "string"
            ? sha256(content)
            : sha256(`${source.absolutePath}:${source.sourceId}`);
        const nextRecord = buildRecord({
          source,
          sourceHash,
          content: sourceContentForFailure,
          importedAt: importedTime,
          previous,
        });
        const failed = event({
          eventType: "import_failed",
          source,
          sourceHash,
          observedAt: importedTime,
          failureClass: classifyMemoryIngestionFailure(
            error instanceof Error ? error.message : String(error),
          ),
          failureStage: resolveFailureStage(error),
        });
        await appendJsonLine(eventsPath, failed);
        const closeoutArtifact = await emitHashGatedImportCloseout({
          env: input.env ?? process.env,
          source,
          sourceHash,
          importedAt: importedTime,
          status: "failed",
          failure: {
            message: error instanceof Error ? error.message : String(error),
            stage: resolveFailureStage(error),
          },
        });
        return {
          status: "failed",
          record: nextRecord,
          event: failed,
          closeoutArtifact,
        };
      }
    },
  };
}
