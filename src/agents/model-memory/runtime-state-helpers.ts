import fs from "node:fs/promises";
import path from "node:path";

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function sanitizeSafeSegment(
  value: string | undefined,
  maxLength = 128,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return undefined;
  }
  return /^[A-Za-z0-9_.:@/-]+$/u.test(trimmed) ? trimmed : undefined;
}

export function sanitizeIdList(
  values: string[] | undefined,
  options: {
    maxLength?: number;
    maxEntries?: number;
  } = {},
): string[] | undefined {
  const maxLength = options.maxLength ?? 128;
  const maxEntries = options.maxEntries ?? 16;
  return values
    ?.map((entry) => sanitizeSafeSegment(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxEntries);
}

export function mergeSanitizedIdLists(
  left: string[] | undefined,
  right: string[] | undefined,
  options: {
    maxLength?: number;
    maxEntries?: number;
  } = {},
): string[] | undefined {
  const maxLength = options.maxLength ?? 128;
  const maxEntries = options.maxEntries ?? 16;
  const merged = [...new Set([...(left ?? []), ...(right ?? [])])]
    .map((entry) => sanitizeSafeSegment(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .toSorted()
    .slice(0, maxEntries);
  return merged.length > 0 ? merged : undefined;
}

export function readPositiveIntegerFromEnvValue(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

export function readBooleanEnvFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
