import { createHash } from "node:crypto";
import path from "node:path";

const GENERATED_BOOTSTRAP_BLOCK_PATTERN =
  /<!-- BEGIN GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->[\s\S]*?<!-- END GENERATED:\s*(?:model-memory|openclaw-canonical)\s*-->\n*/g;
const LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN =
  /<!-- OPENCLAW:MEMORY-PROJECTION:START\b[\s\S]*?<!-- OPENCLAW:MEMORY-PROJECTION:END\b[^\n]*-->\n*/g;

export type WorkspaceMemorySourceAuthority =
  | "workspace_root_human_owned"
  | "workspace_daily_note_lower_authority"
  | "workspace_document";

function normalizeWorkspacePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isRootWorkspaceUserOrMemoryFile(relativePath: string): boolean {
  const normalized = normalizeWorkspacePath(relativePath);
  return normalized === "USER.md" || normalized === "MEMORY.md" || normalized === "memory.md";
}

export function isDailyWorkspaceMemoryNote(relativePath: string): boolean {
  return /^memory\/\d{4}-\d{2}-\d{2}\.md$/u.test(normalizeWorkspacePath(relativePath));
}

export function stripGeneratedWorkspaceMemoryZones(params: {
  relativePath: string;
  content?: string;
}): string {
  const raw = params.content ?? "";
  if (!isRootWorkspaceUserOrMemoryFile(params.relativePath)) {
    return raw;
  }
  const stripped = raw
    .replace(GENERATED_BOOTSTRAP_BLOCK_PATTERN, "")
    .replace(LEGACY_MEMORY_PROJECTION_BLOCK_PATTERN, "")
    .trim();
  return stripped.length > 0 ? `${stripped}\n` : "";
}

export function buildWorkspaceMemorySourceMetadata(params: {
  relativePath: string;
  content: string;
}): {
  contentHash: string;
  sourceAuthority: WorkspaceMemorySourceAuthority;
  generatedZonesStripped: boolean;
} {
  const relativePath = normalizeWorkspacePath(params.relativePath);
  const filteredContent = stripGeneratedWorkspaceMemoryZones({
    relativePath,
    content: params.content,
  });
  const sourceAuthority: WorkspaceMemorySourceAuthority = isRootWorkspaceUserOrMemoryFile(
    relativePath,
  )
    ? "workspace_root_human_owned"
    : isDailyWorkspaceMemoryNote(relativePath)
      ? "workspace_daily_note_lower_authority"
      : "workspace_document";
  return {
    contentHash: sha256Text(filteredContent),
    sourceAuthority,
    generatedZonesStripped: filteredContent !== params.content,
  };
}

export function isProtectedRootWorkspaceMemoryWritePath(params: {
  root: string;
  filePath: string;
}): boolean {
  const resolved = path.resolve(params.filePath);
  const relative = path.relative(path.resolve(params.root), resolved).replace(/\\/g, "/");
  return relative === "USER.md" || relative === "MEMORY.md" || relative === "memory.md";
}

export function assertWritableWorkspaceMemoryPath(params: { root: string; filePath: string }) {
  if (!isProtectedRootWorkspaceMemoryWritePath(params)) {
    return;
  }
  throw new Error(
    "Direct writes to USER.md or MEMORY.md are blocked for ordinary assistant file tools. Ask for an explicit operator-side file edit or write durable memory through MMV2/session-memory instead.",
  );
}
