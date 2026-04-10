import type { MemoryObjectKind, MemoryObjectRecord } from "./db/runtime.js";
import { readCanonicalMemoryRecordFromMetadata } from "./memory-canonical-compat.js";
import type { NativeMemoryProjectionTarget } from "./native-memory-surfaces.js";

export type SharedBootstrapProjectionTarget = Extract<
  NativeMemoryProjectionTarget,
  "user-profile" | "tool-preferences" | "memory-digest"
>;

export type NativeMemoryProjectionCandidate = {
  sourceId: string;
  sourceKind: MemoryObjectKind;
  target: SharedBootstrapProjectionTarget;
  priority: number;
  text: string;
  updatedAt: string;
  projectId?: string;
};

function sanitizeProjectionText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const collapsed = value
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^[#>*-]+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > 0 ? collapsed : null;
}

function buildProjectionText(params: {
  subject?: string;
  statement?: string;
  fallback: string;
}): string | null {
  const subject = sanitizeProjectionText(params.subject);
  const statement = sanitizeProjectionText(params.statement);
  if (subject && statement && statement.toLowerCase() !== subject.toLowerCase()) {
    return `${subject}: ${statement}`;
  }
  return statement ?? subject ?? sanitizeProjectionText(params.fallback);
}

function hasTag(tags: readonly string[] | undefined, expected: string): boolean {
  return Array.isArray(tags) && tags.some((tag) => tag === expected);
}

function resolveProjectionTarget(
  record: MemoryObjectRecord,
): SharedBootstrapProjectionTarget | null {
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  const tags = canonical?.tags ?? [];
  const isProjectScoped = typeof record.projectId === "string" && record.projectId.length > 0;

  if (record.memoryKind === "reference" || record.memoryKind === "policy") {
    return null;
  }
  if (record.memoryKind === "project" || isProjectScoped) {
    return "memory-digest";
  }
  if (record.memoryKind === "user") {
    return "user-profile";
  }
  if (record.memoryKind === "feedback") {
    if (hasTag(tags, "response_style") || hasTag(tags, "preference")) {
      return "user-profile";
    }
    return "tool-preferences";
  }
  return null;
}

function resolveProjectionPriority(params: {
  record: MemoryObjectRecord;
  target: SharedBootstrapProjectionTarget;
}): number {
  const canonical = readCanonicalMemoryRecordFromMetadata(params.record.metadata);
  const tags = canonical?.tags ?? [];
  const base =
    params.target === "user-profile" ? 300 : params.target === "tool-preferences" ? 220 : 180;
  const tagBoost =
    hasTag(tags, "response_style") || hasTag(tags, "preference")
      ? 30
      : hasTag(tags, "workflow_guidance") || hasTag(tags, "validated_approach")
        ? 20
        : hasTag(tags, "project_fact") || hasTag(tags, "project_rule") || hasTag(tags, "open_need")
          ? 10
          : 0;
  const recencyBoost = Math.max(
    0,
    20 - Math.floor((Date.now() - Date.parse(params.record.updatedAt)) / 86400000),
  );
  return base + tagBoost + recencyBoost;
}

export function isProjectionEligibleMemoryObject(record: MemoryObjectRecord): boolean {
  if (record.readSurface !== "approved_memory_view" || record.reviewState !== "approved") {
    return false;
  }
  const target = resolveProjectionTarget(record);
  if (!target) {
    return false;
  }
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  return (
    buildProjectionText({
      subject: canonical?.subject,
      statement: canonical?.statement,
      fallback: record.content,
    }) !== null
  );
}

export function buildNativeMemoryProjectionCandidate(
  record: MemoryObjectRecord,
): NativeMemoryProjectionCandidate | null {
  if (!isProjectionEligibleMemoryObject(record)) {
    return null;
  }
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  const target = resolveProjectionTarget(record);
  if (!target) {
    return null;
  }
  const text = buildProjectionText({
    subject: canonical?.subject,
    statement: canonical?.statement,
    fallback: record.content,
  });
  if (!text) {
    return null;
  }
  return {
    sourceId: record.id,
    sourceKind: record.memoryKind,
    target,
    priority: resolveProjectionPriority({ record, target }),
    text,
    updatedAt: record.updatedAt,
    ...(record.projectId ? { projectId: record.projectId } : {}),
  };
}

export function buildNativeMemoryProjectionCandidates(
  records: MemoryObjectRecord[],
): NativeMemoryProjectionCandidate[] {
  const seen = new Set<string>();
  const ranked = records
    .map(buildNativeMemoryProjectionCandidate)
    .filter((candidate): candidate is NativeMemoryProjectionCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        left.sourceId.localeCompare(right.sourceId),
    );
  return ranked.filter((candidate) => {
    const key = `${candidate.target}\u0000${candidate.text.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
