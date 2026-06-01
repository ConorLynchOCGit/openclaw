import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export type BoundedRepoContextIndexEntry = {
  fileRef: string;
  evidenceHash: string;
  boundedSummary: string;
  rawFileContentStored: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function readPositiveIntEnv(name: string, fallback: number, input?: { max?: number }): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const value = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.max(1, Math.min(input?.max ?? Number.MAX_SAFE_INTEGER, value));
}

export function resolveContextScoutModelCallBudget(input: {
  startedAtMs: number;
  nowMs: number;
  totalTimeoutMs: number;
  minimumUsefulTimeoutMs?: number;
}):
  | { status: "available"; timeoutMs: number; reasonCodes: string[] }
  | { status: "expired"; timeoutMs: 0; reasonCodes: string[] } {
  const totalTimeoutMs = Number.isFinite(input.totalTimeoutMs)
    ? Math.max(1, Math.floor(input.totalTimeoutMs))
    : 300_000;
  const remainingMs = input.startedAtMs + totalTimeoutMs - input.nowMs;
  const minimumUsefulTimeoutMs = Math.max(1, Math.floor(input.minimumUsefulTimeoutMs ?? 1));
  if (remainingMs < minimumUsefulTimeoutMs) {
    return {
      status: "expired",
      timeoutMs: 0,
      reasonCodes: [
        "resource_scout_total_budget_exhausted",
        `resource_scout_total_budget_ms:${totalTimeoutMs}`,
        `resource_scout_remaining_budget_ms:${Math.max(0, Math.floor(remainingMs))}`,
      ],
    };
  }
  return {
    status: "available",
    timeoutMs: Math.max(1, Math.floor(remainingMs)),
    reasonCodes: [
      "resource_scout_model_call_budget_resolved",
      `resource_scout_total_budget_ms:${totalTimeoutMs}`,
      `resource_scout_remaining_budget_ms:${Math.max(0, Math.floor(remainingMs))}`,
    ],
  };
}

function normalizedRepoFileRef(fileRef: string, repoRoot: string): string | null {
  let candidate = fileRef.trim().replaceAll("\\", "/");
  const root = repoRoot.replaceAll("\\", "/").replace(/\/+$/u, "");
  if (candidate.startsWith(`${root}/`)) {
    candidate = candidate.slice(root.length + 1);
  }
  if (candidate.startsWith("services/openclaw-roles/live/")) {
    candidate = candidate.slice("services/openclaw-roles/live/".length);
  }
  if (!candidate || candidate.startsWith("/") || candidate.includes("..")) {
    return null;
  }
  return candidate;
}

function allowedRepoFileRef(fileRef: string, allowedFileRefs: string[]): boolean {
  return allowedFileRefs.some(
    (allowedRef) =>
      fileRef === allowedRef || (allowedRef.endsWith("/") && fileRef.startsWith(allowedRef)),
  );
}

const CONTEXT_SCOUT_DISCOVERY_STOP_TOKENS = new Set([
  "extensions",
  "execution",
  "platform",
  "src",
  "docs",
  "projects",
  "specs",
  "scripts",
  "test",
  "tests",
  "index",
  "runtime",
  "workflows",
]);

function discoveryTokens(refs: string[]): string[] {
  return [
    ...new Set(
      refs
        .flatMap((ref) => ref.toLowerCase().split(/[^a-z0-9]+/u))
        .filter((token) => token.length >= 3 && !CONTEXT_SCOUT_DISCOVERY_STOP_TOKENS.has(token)),
    ),
  ].slice(0, 24);
}

function scoreContextScoutCandidate(fileRef: string, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const lower = fileRef.toLowerCase();
  const basename = path.basename(lower);
  return tokens.reduce((score, token) => {
    if (!lower.includes(token)) {
      return score;
    }
    return score + 1 + (basename.includes(token) ? 2 : 0);
  }, 0);
}

async function nearestExistingAllowedAncestor(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
}): Promise<string | null> {
  let current = input.fileRef.replace(/\/+$/u, "");
  for (;;) {
    if (!current || current === ".") {
      return null;
    }
    if (
      allowedRepoFileRef(`${current}/`, input.allowedFileRefs) ||
      allowedRepoFileRef(current, input.allowedFileRefs)
    ) {
      const info = await stat(path.join(input.repoRoot, current)).catch(() => null);
      if (info?.isDirectory()) {
        return current;
      }
    }
    const next = path.dirname(current).replaceAll("\\", "/");
    if (next === current) {
      return null;
    }
    current = next;
  }
}

async function collectContextScoutFiles(input: {
  repoRoot: string;
  rootRef: string;
  allowedFileRefs: string[];
  maxFiles: number;
}): Promise<string[]> {
  const absolute = path.join(input.repoRoot, input.rootRef);
  const info = await stat(absolute).catch(() => null);
  if (info?.isFile()) {
    return [input.rootRef];
  }
  if (!info?.isDirectory()) {
    return [];
  }
  const candidates: string[] = [];
  const entries = await readdir(absolute, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (candidates.length >= input.maxFiles) {
      break;
    }
    if (!entry.isFile()) {
      continue;
    }
    const parent = "parentPath" in entry ? entry.parentPath : absolute;
    const relative = path
      .relative(input.repoRoot, path.join(parent, entry.name))
      .replaceAll("\\", "/");
    if (
      /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|md|json)$/iu.test(relative) &&
      !relative.includes("/node_modules/") &&
      !relative.includes("/dist/") &&
      allowedRepoFileRef(relative, input.allowedFileRefs)
    ) {
      candidates.push(relative);
    }
  }
  return candidates;
}

export async function discoverContextScoutRepoCandidateFileRefs(input: {
  repoRoot: string;
  targetRefs: string[];
  allowedFileRefs: string[];
  maxFiles?: number;
}): Promise<string[]> {
  const maxFiles = Math.max(10, Math.min(220, input.maxFiles ?? 120));
  const candidates: string[] = [];
  const roots = input.targetRefs;
  if (roots.length === 0) {
    return [];
  }
  const tokens = discoveryTokens(roots);
  for (const ref of roots.slice(0, 20)) {
    const normalized = normalizedRepoFileRef(ref, input.repoRoot);
    if (!normalized || !allowedRepoFileRef(normalized, input.allowedFileRefs)) {
      continue;
    }
    const absolute = path.join(input.repoRoot, normalized);
    const info = await stat(absolute).catch(() => null);
    if (info?.isFile()) {
      candidates.push(normalized);
      continue;
    }
    const rootRef = info?.isDirectory()
      ? normalized
      : await nearestExistingAllowedAncestor({
          repoRoot: input.repoRoot,
          fileRef: normalized,
          allowedFileRefs: input.allowedFileRefs,
        });
    if (!rootRef) {
      continue;
    }
    candidates.push(
      ...(await collectContextScoutFiles({
        repoRoot: input.repoRoot,
        rootRef,
        allowedFileRefs: input.allowedFileRefs,
        maxFiles: Math.min(800, maxFiles * 6),
      })),
    );
  }
  return [...new Set(candidates)]
    .toSorted((a, b) => {
      const scoreDelta =
        scoreContextScoutCandidate(b, tokens) - scoreContextScoutCandidate(a, tokens);
      return scoreDelta === 0 ? a.localeCompare(b) : scoreDelta;
    })
    .slice(0, maxFiles);
}

export async function buildBoundedContextScoutRepoContextIndex(input: {
  repoRoot: string;
  fileRefs: string[];
  maxFiles?: number;
}): Promise<BoundedRepoContextIndexEntry[]> {
  const maxFiles = Math.max(8, Math.min(80, input.maxFiles ?? 40));
  const entries: BoundedRepoContextIndexEntry[] = [];
  for (const fileRef of input.fileRefs.slice(0, maxFiles)) {
    const text = await readFile(path.join(input.repoRoot, fileRef), "utf8").catch(() => "");
    if (!text) {
      continue;
    }
    const lines = text.split(/\r?\n/u);
    const importLines = lines
      .filter((line) => /^(?:import|export)\s/u.test(line.trim()))
      .slice(0, 8)
      .join(" ");
    const symbolLines = lines
      .filter((line) =>
        /^\s*(?:export\s+)?(?:class|function|const|type|interface|enum)\s+[A-Za-z0-9_]+/u.test(
          line,
        ),
      )
      .slice(0, 12)
      .join(" ");
    const packageOrHeadingLines = lines
      .filter((line) => /^\s*(?:"(?:name|scripts|dependencies)"|#{1,4}\s+)/u.test(line))
      .slice(0, 8)
      .join(" ");
    const boundedSummary = bounded(
      [symbolLines, importLines, packageOrHeadingLines, text.slice(0, 500)]
        .filter(Boolean)
        .join(" "),
      1_200,
    );
    entries.push({
      fileRef,
      evidenceHash: sha256Text(JSON.stringify({ fileRef, boundedSummary })).slice(0, 64),
      boundedSummary:
        boundedSummary || `Verified existing repo file available to resource scout: ${fileRef}`,
      rawFileContentStored: false,
    });
  }
  return entries;
}
