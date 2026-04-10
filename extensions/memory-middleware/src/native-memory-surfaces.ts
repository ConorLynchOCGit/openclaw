export const NATIVE_MEMORY_PROJECTION_TARGETS = [
  "user-profile",
  "tool-preferences",
  "memory-digest",
  "project-memory-digest",
  "daily-continuity",
] as const;

export type NativeMemoryProjectionTarget = (typeof NATIVE_MEMORY_PROJECTION_TARGETS)[number];

export const COMPILER_MANAGED_NATIVE_BOOTSTRAP_FILENAMES = [
  "USER.md",
  "TOOLS.md",
  "MEMORY.md",
] as const;

export const HUMAN_AUTHORED_NATIVE_BOOTSTRAP_FILENAMES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
] as const;

export const OPERATOR_REVIEW_EVIDENCE_ROOT = "archives/daily_memory_evidence";
const DAILY_MEMORY_LEAF_PATTERN = /^memory\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/;
const DAILY_MEMORY_CANONICAL_PATTERN = /^memory\/\d{4}-\d{2}-\d{2}\.md$/;
const PROJECT_MEMORY_DIGEST_PATTERN = /^projects\/[^/]+\/MEMORY\.md$/;

export type NativeMemorySurfaceClass =
  | "compiled-bootstrap-projection"
  | "compiled-project-projection"
  | "compiled-daily-continuity"
  | "raw-daily-leaf"
  | "operator-review-evidence"
  | "human-authored-bootstrap"
  | "other";

export function resolveNativeMemoryProjectionRelativePath(params: {
  target: NativeMemoryProjectionTarget;
  projectSlug?: string;
  date?: string;
}): string {
  switch (params.target) {
    case "user-profile":
      return "USER.md";
    case "tool-preferences":
      return "TOOLS.md";
    case "memory-digest":
      return "MEMORY.md";
    case "project-memory-digest":
      if (!params.projectSlug) {
        throw new Error("project-memory-digest target requires a projectSlug");
      }
      return `projects/${params.projectSlug}/MEMORY.md`;
    case "daily-continuity":
      if (!params.date) {
        throw new Error("daily-continuity target requires a date");
      }
      return `memory/${params.date}.md`;
  }
}

export function classifyNativeMemorySurface(relPath: string): NativeMemorySurfaceClass {
  const normalized = relPath.replace(/\\/g, "/").replace(/^[./]+/, "");
  if (COMPILER_MANAGED_NATIVE_BOOTSTRAP_FILENAMES.includes(normalized as "USER.md")) {
    return "compiled-bootstrap-projection";
  }
  if (HUMAN_AUTHORED_NATIVE_BOOTSTRAP_FILENAMES.includes(normalized as "AGENTS.md")) {
    return "human-authored-bootstrap";
  }
  if (normalized.startsWith(`${OPERATOR_REVIEW_EVIDENCE_ROOT}/`) && normalized.endsWith(".md")) {
    return "operator-review-evidence";
  }
  if (DAILY_MEMORY_CANONICAL_PATTERN.test(normalized)) {
    return "compiled-daily-continuity";
  }
  if (PROJECT_MEMORY_DIGEST_PATTERN.test(normalized)) {
    return "compiled-project-projection";
  }
  if (DAILY_MEMORY_LEAF_PATTERN.test(normalized)) {
    return "raw-daily-leaf";
  }
  return "other";
}

export function isCompilerManagedNativeProjectionPath(relPath: string): boolean {
  const surfaceClass = classifyNativeMemorySurface(relPath);
  return (
    surfaceClass === "compiled-bootstrap-projection" ||
    surfaceClass === "compiled-project-projection" ||
    surfaceClass === "compiled-daily-continuity"
  );
}

export function isRawDailyMemoryLeafPath(relPath: string): boolean {
  return classifyNativeMemorySurface(relPath) === "raw-daily-leaf";
}
