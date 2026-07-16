import { constants as fsConstants, createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createCanonicalRecord, validateCanonicalRecord } from "./schema.js";
import type { CanonicalRecord, ReadResult } from "./types.js";

export const MAX_SCAN_ROWS = 100_000;
const MAX_ROW_BYTES = 256 * 1024;
const MAX_BATCH_ROWS = 10_000;
const MAX_BATCH_BYTES = 16 * 1024 * 1024;
const appendQueues = new Map<string, Promise<void>>();

function resolveMaxRows(value: number | undefined): number {
  if (value === undefined) {
    return MAX_SCAN_ROWS;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SCAN_ROWS) {
    throw new Error(`maxRows must be an integer from 1 to ${MAX_SCAN_ROWS}.`);
  }
  return value;
}

async function serializeAppend<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = appendQueues.get(filePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const settled = current.then(
    () => undefined,
    () => undefined,
  );
  appendQueues.set(filePath, settled);
  try {
    return await current;
  } finally {
    if (appendQueues.get(filePath) === settled) {
      appendQueues.delete(filePath);
    }
  }
}

function canonicalKey(tenantId: string, objectId: string): string {
  return `${tenantId.length}:${tenantId}${objectId}`;
}

export function resolveAgencyDataStateDir(stateDir: string): string {
  return path.join(stateDir, "agency-data");
}

export class AgencyDataStore {
  readonly stateDir: string;
  readonly logPath: string;

  constructor(stateDir: string) {
    this.stateDir = path.resolve(stateDir);
    this.logPath = path.join(this.stateDir, "canonical.jsonl");
  }

  async append(input: Record<string, unknown>): Promise<CanonicalRecord> {
    const record = createCanonicalRecord(input);
    await this.appendValidated([record]);
    return record;
  }

  async appendBatch(inputs: readonly Record<string, unknown>[]): Promise<CanonicalRecord[]> {
    if (inputs.length < 1 || inputs.length > MAX_BATCH_ROWS) {
      throw new Error(`Canonical batch must contain 1-${MAX_BATCH_ROWS} records.`);
    }
    const records = inputs.map((input) => createCanonicalRecord(input));
    await this.appendValidated(records);
    return records;
  }

  private async appendValidated(records: readonly CanonicalRecord[]): Promise<void> {
    const lines = records.map((record) => Buffer.from(`${JSON.stringify(record)}\n`, "utf8"));
    for (const line of lines) {
      if (line.byteLength > MAX_ROW_BYTES) {
        throw new Error(`Canonical record exceeds the ${MAX_ROW_BYTES}-byte row limit.`);
      }
    }
    const payload = Buffer.concat(lines);
    if (payload.byteLength > MAX_BATCH_BYTES) {
      throw new Error(`Canonical batch exceeds the ${MAX_BATCH_BYTES}-byte batch limit.`);
    }

    await serializeAppend(this.logPath, async () => {
      await fs.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
      const flags =
        fsConstants.O_APPEND |
        fsConstants.O_CREAT |
        fsConstants.O_WRONLY |
        (fsConstants.O_NOFOLLOW ?? 0);
      const handle = await fs.open(this.logPath, flags, 0o600);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1) {
          throw new Error("Canonical log must be a regular file with exactly one hard link.");
        }
        await handle.chmod(0o600);
        const { bytesWritten } = await handle.write(payload, 0, payload.byteLength, null);
        if (bytesWritten !== payload.byteLength) {
          throw new Error(
            `Canonical append wrote ${bytesWritten} of ${payload.byteLength} bytes; the final row may be incomplete.`,
          );
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
  }

  async read(options: { maxRows?: number; tenantId?: string } = {}): Promise<ReadResult> {
    const maxRows = resolveMaxRows(options.maxRows);
    try {
      await fs.access(this.logPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { records: [], scanned: 0, malformed_rows: 0, truncated: false };
      }
      throw error;
    }

    const input = createReadStream(this.logPath, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    const records: CanonicalRecord[] = [];
    let scanned = 0;
    let malformedRows = 0;
    let truncated = false;
    try {
      for await (const line of lines) {
        if (scanned >= maxRows) {
          truncated = true;
          lines.close();
          input.destroy();
          break;
        }
        scanned += 1;
        if (line.length === 0) {
          malformedRows += 1;
          continue;
        }
        if (Buffer.byteLength(line) > MAX_ROW_BYTES) {
          malformedRows += 1;
          continue;
        }
        try {
          const parsed = validateCanonicalRecord(JSON.parse(line));
          if (!options.tenantId || parsed.tenant_id === options.tenantId) {
            records.push(parsed);
          }
        } catch {
          malformedRows += 1;
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
    return { records, scanned, malformed_rows: malformedRows, truncated };
  }
}

export function materializeVisibleRecords(records: CanonicalRecord[]): CanonicalRecord[] {
  const latestByObject = new Map<string, CanonicalRecord>();
  for (const record of records) {
    const key = canonicalKey(record.tenant_id, record.object_id);
    // Reinsert so materialized ordering follows each object's latest append.
    latestByObject.delete(key);
    latestByObject.set(key, record);
  }
  const latest = [...latestByObject.values()];
  const available = new Set(
    latest
      .filter((record) => record.object_type !== "correction_tombstone")
      .map((record) => canonicalKey(record.tenant_id, record.object_id)),
  );
  const removed = new Set<string>();
  for (const record of latest) {
    if (record.object_type !== "correction_tombstone") {
      continue;
    }
    const targetKey = canonicalKey(record.tenant_id, String(record.target_object_id));
    if (record.action === "tombstone") {
      removed.add(targetKey);
      continue;
    }
    const replacementKey = canonicalKey(record.tenant_id, String(record.replacement_object_id));
    if (available.has(replacementKey)) {
      removed.add(targetKey);
    }
  }
  return latest.filter(
    (record) =>
      record.object_type !== "correction_tombstone" &&
      !removed.has(canonicalKey(record.tenant_id, record.object_id)),
  );
}
