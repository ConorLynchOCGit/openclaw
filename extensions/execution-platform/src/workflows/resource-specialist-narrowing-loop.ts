import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "../runtime-job-repository.ts";

export const RESOURCE_SPECIALIST_NARROWING_TOOL_IDS = [
  "resource.scout.open_ref",
  "resource.scout.search_within_ref",
  "resource.scout.open_window",
  "resource.scout.expand_window",
  "resource.scout.contract_window",
  "resource.scout.choose_file_from_listing",
  "resource.scout.choose_search_query",
  "resource.scout.choose_window_from_matches",
  "resource.scout.report_relevant_window",
  "resource.scout.report_existing_pattern",
  "resource.scout.report_constraint",
  "resource.scout.report_edit_point",
  "resource.scout.submit_exact_handles",
  "resource.scout.mark_narrowing_blocked",
] as const;

export type ResourceSpecialistNarrowingToolId =
  (typeof RESOURCE_SPECIALIST_NARROWING_TOOL_IDS)[number];

export type ResourceSpecialistNarrowingToolCall = {
  toolId: ResourceSpecialistNarrowingToolId | null;
  input: Record<string, JsonValue> | null;
  reasonCodes: string[];
};

export type ResourceSpecialistNarrowingModelResponse = {
  status?: "ok" | "blocked" | "error";
  responseText: string | null;
  responseHash?: string | null;
  latencyMs?: number | null;
  reasonCodes?: string[];
};

export type ResourceSpecialistNarrowingModelCallInput = {
  systemPrompt: string;
  userPayload: Record<string, JsonValue>;
  requestedInputBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningMode: "none" | "exclude" | "omit";
  taskClass: string;
  callSite: string;
  boundaryId: string;
};

export type ResourceSpecialistNarrowingLoopResult = {
  toolId: "resource.scout.submit_exact_handles" | "resource.scout.mark_narrowing_blocked";
  input: Record<string, JsonValue>;
  responseHash: string | null;
  latencyMs: number | null;
  turnCount: number;
  openedRefCount: number;
  searchResultCount: number;
  selectedWindowCount: number;
  windowRevisionCount: number;
  reasonCodes: string[];
};

type ResourceSpecialistReadResult = {
  status: "opened" | "blocked";
  ref: string;
  refKind: "file" | "directory" | "file_window" | "source_prompt" | "unknown";
  summary: string;
  lineCount?: number;
  excerpt?: string;
  fileRefs?: string[];
  exactWindowRefs?: string[];
  reasonCodes: string[];
  rawFileContentStored: false;
};

type ResourceSpecialistSearchResult = {
  status: "completed" | "blocked";
  ref: string;
  query: string;
  matches: Array<{
    ref: string;
    path: string;
    line: number;
    preview: string;
  }>;
  reasonCodes: string[];
  rawFileContentStored: false;
};

type ResourceSpecialistWindowResult = {
  status: "opened" | "blocked";
  ref: string;
  path: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  excerpt: string;
  reasonCodes: string[];
  rawFileContentStored: false;
};

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function bounded(value: unknown, max = 1_000): string {
  return String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: unknown[], max = 80): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeJsonParseValue(text: string | null): unknown {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string" && parsed.trim().startsWith("{")) {
      return JSON.parse(parsed.trim());
    }
    if (typeof parsed === "string" && parsed.trim().startsWith("[")) {
      return JSON.parse(parsed.trim());
    }
    return parsed;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        if (typeof parsed === "string" && parsed.trim().startsWith("{")) {
          return JSON.parse(parsed.trim());
        }
        return parsed;
      } catch {
        return {};
      }
    }
    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
        if (typeof parsed === "string" && parsed.trim().startsWith("[")) {
          return JSON.parse(parsed.trim());
        }
        return parsed;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function toolCallCandidateRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toolCallCandidateRecords(item));
  }
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return [];
  }
  return [
    record,
    asRecord(record.toolCall),
    asRecord(record.tool_call),
    asRecord(record.contextNarrowingToolCall),
    asRecord(record.contextScoutToolCall),
    asRecord(record.resourceScoutToolCall),
    ...(Array.isArray(record.toolCalls)
      ? record.toolCalls.flatMap((item) => toolCallCandidateRecords(item))
      : []),
    ...(Array.isArray(record.tool_calls)
      ? record.tool_calls.flatMap((item) => toolCallCandidateRecords(item))
      : []),
  ].filter((candidate) => Object.keys(candidate).length > 0);
}

export function parseResourceSpecialistNarrowingToolCall(
  responseText: string | null,
): ResourceSpecialistNarrowingToolCall {
  const parsed = safeJsonParseValue(responseText);
  const candidates = toolCallCandidateRecords(parsed);
  for (const candidate of candidates) {
    const toolId = bounded(
      candidate.toolId ?? candidate.tool ?? candidate.name ?? candidate.toolName,
      180,
    ) as ResourceSpecialistNarrowingToolId;
    const input =
      asRecord(candidate.input).constructor === Object && Object.keys(asRecord(candidate.input)).length > 0
        ? asRecord(candidate.input)
        : Object.keys(asRecord(candidate.arguments)).length > 0
          ? asRecord(candidate.arguments)
          : Object.keys(asRecord(candidate.payload)).length > 0
            ? asRecord(candidate.payload)
            : {};
    if (
      (RESOURCE_SPECIALIST_NARROWING_TOOL_IDS as readonly string[]).includes(toolId) &&
      Object.keys(input).length > 0
    ) {
      return {
        toolId,
        input: input as Record<string, JsonValue>,
        reasonCodes: ["resource_specialist_narrowing_tool_call_structurally_parsed"],
      };
    }
  }
  return {
    toolId: null,
    input: null,
    reasonCodes: [
      "resource_specialist_narrowing_tool_call_missing_legal_tool_envelope",
      `resource_specialist_narrowing_tool_call_top_level_keys:${Object.keys(asRecord(parsed)).slice(0, 12).join(",") || (Array.isArray(parsed) ? "array" : "none")}`,
    ],
  };
}

function normalizedStructuralRef(ref: string): string {
  const withoutScheme = ref.startsWith("file-window://")
    ? ref.slice("file-window://".length)
    : ref;
  const hashIndex = withoutScheme.indexOf("#");
  return hashIndex === -1 ? withoutScheme : withoutScheme.slice(0, hashIndex);
}

function authorityAllowsRef(input: { authorityScopeRefs: string[]; ref: string }): boolean {
  const normalizedRef = normalizedStructuralRef(input.ref);
  return input.authorityScopeRefs.some((authorityRef) => {
    const normalizedAuthority = normalizedStructuralRef(authorityRef);
    if (
      authorityRef === "*" ||
      authorityRef === "authority://all" ||
      normalizedAuthority === normalizedRef
    ) {
      return true;
    }
    if (normalizedAuthority.endsWith("/**")) {
      return normalizedRef.startsWith(normalizedAuthority.slice(0, -2));
    }
    if (normalizedAuthority.endsWith("/")) {
      const directoryAuthority = normalizedAuthority.slice(0, -1);
      return normalizedRef === directoryAuthority || normalizedRef.startsWith(normalizedAuthority);
    }
    return false;
  });
}

function normalizeRepoPath(ref: string, repoRoot: string): string | null {
  const text = ref.trim();
  if (!text || text.includes("\0") || text.includes("://") && !text.startsWith("file-window://")) {
    return null;
  }
  const withoutScheme = text.startsWith("file-window://") ? text.slice("file-window://".length) : text;
  const withoutHash = withoutScheme.split("#L")[0] ?? "";
  if (!withoutHash || withoutHash.includes("://")) {
    return null;
  }
  const resolved = path.resolve(repoRoot, withoutHash);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return path.relative(repoRoot, resolved) || ".";
}

function parseFileWindow(ref: string): { path: string; lineStart: number; lineEnd: number } | null {
  const normalized = ref.startsWith("file-window://") ? ref.slice("file-window://".length) : ref;
  const match = /^(?<path>.+)#L(?<start>[1-9]\d*)-L(?<end>[1-9]\d*)$/u.exec(normalized);
  if (!match?.groups) {
    return null;
  }
  const lineStart = Number.parseInt(match.groups.start, 10);
  const lineEnd = Number.parseInt(match.groups.end, 10);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd) || lineEnd < lineStart) {
    return null;
  }
  return { path: match.groups.path, lineStart, lineEnd };
}

async function listFilesUnder(input: { repoRoot: string; relativePath: string; maxFiles?: number }) {
  const maxFiles = input.maxFiles ?? 80;
  const output: string[] = [];
  const rootPath = path.join(input.repoRoot, input.relativePath);
  const walk = async (current: string): Promise<void> => {
    if (output.length >= maxFiles) {
      return;
    }
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      if (output.length >= maxFiles) {
        return;
      }
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === ".turbo" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".artifacts"
      ) {
        continue;
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        output.push(path.relative(input.repoRoot, absolute));
      }
    }
  };
  await walk(rootPath);
  return output;
}

async function readWindow(input: {
  repoRoot: string;
  relativePath: string;
  lineStart: number;
  lineEnd: number;
}): Promise<ResourceSpecialistWindowResult> {
  const normalized = normalizeRepoPath(input.relativePath, input.repoRoot);
  if (!normalized || normalized === ".") {
    return {
      status: "blocked",
      ref: `file-window://${input.relativePath}#L${input.lineStart}-L${input.lineEnd}`,
      path: null,
      lineStart: null,
      lineEnd: null,
      excerpt: "",
      reasonCodes: ["resource_specialist_open_window_path_invalid"],
      rawFileContentStored: false,
    };
  }
  const absolute = path.join(input.repoRoot, normalized);
  const info = await stat(absolute).catch(() => null);
  if (!info?.isFile() || info.size > 1_000_000) {
    return {
      status: "blocked",
      ref: `file-window://${normalized}#L${input.lineStart}-L${input.lineEnd}`,
      path: normalized,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      excerpt: "",
      reasonCodes: ["resource_specialist_open_window_file_unavailable_or_oversized"],
      rawFileContentStored: false,
    };
  }
  const lines = (await readFile(absolute, "utf8")).split(/\r?\n/u);
  const lineStart = Math.max(1, Math.min(input.lineStart, lines.length));
  const lineEnd = Math.max(lineStart, Math.min(input.lineEnd, lineStart + 159, lines.length));
  const excerpt = lines
    .slice(lineStart - 1, lineEnd)
    .map((line, index) => `${lineStart + index}: ${line.slice(0, 260)}`)
    .join("\n")
    .slice(0, 18_000);
  return {
    status: "opened",
    ref: `file-window://${normalized}#L${lineStart}-L${lineEnd}`,
    path: normalized,
    lineStart,
    lineEnd,
    excerpt,
    reasonCodes: ["resource_specialist_open_window_succeeded"],
    rawFileContentStored: false,
  };
}

async function openRef(input: {
  repoRoot: string;
  ref: string;
  authorityScopeRefs: string[];
}): Promise<ResourceSpecialistReadResult> {
  const ref = input.ref.trim();
  const fileWindow = parseFileWindow(ref);
  if (fileWindow) {
    if (!authorityAllowsRef({ authorityScopeRefs: input.authorityScopeRefs, ref })) {
      return {
        status: "blocked",
        ref,
        refKind: "file_window",
        summary: "Requested file window is outside authority.",
        reasonCodes: ["resource_specialist_open_ref_authority_denied"],
        rawFileContentStored: false,
      };
    }
    const window = await readWindow({
      repoRoot: input.repoRoot,
      relativePath: fileWindow.path,
      lineStart: fileWindow.lineStart,
      lineEnd: fileWindow.lineEnd,
    });
    return {
      status: window.status,
      ref: window.ref,
      refKind: "file_window",
      summary: window.status === "opened" ? "Opened exact file window." : "Could not open file window.",
      lineCount:
        window.lineStart && window.lineEnd ? window.lineEnd - window.lineStart + 1 : undefined,
      excerpt: window.excerpt,
      exactWindowRefs: window.status === "opened" ? [window.ref] : [],
      reasonCodes: window.reasonCodes,
      rawFileContentStored: false,
    };
  }
  const relativePath = normalizeRepoPath(ref, input.repoRoot);
  if (!relativePath) {
    return {
      status: "blocked",
      ref,
      refKind: ref.startsWith("source-prompt://") ? "source_prompt" : "unknown",
      summary: "Only repo file, repo directory, and file-window refs are directly openable in this subturn.",
      reasonCodes: ["resource_specialist_open_ref_unsupported_ref_shape"],
      rawFileContentStored: false,
    };
  }
  if (!authorityAllowsRef({ authorityScopeRefs: input.authorityScopeRefs, ref: relativePath })) {
    return {
      status: "blocked",
      ref,
      refKind: "unknown",
      summary: "Requested ref is outside authority.",
      reasonCodes: ["resource_specialist_open_ref_authority_denied"],
      rawFileContentStored: false,
    };
  }
  const absolute = path.join(input.repoRoot, relativePath);
  const info = await stat(absolute).catch(() => null);
  if (!info) {
    return {
      status: "blocked",
      ref,
      refKind: "unknown",
      summary: "Requested ref does not exist.",
      reasonCodes: ["resource_specialist_open_ref_missing"],
      rawFileContentStored: false,
    };
  }
  if (info.isDirectory()) {
    const fileRefs = await listFilesUnder({ repoRoot: input.repoRoot, relativePath, maxFiles: 80 });
    return {
      status: "opened",
      ref: relativePath,
      refKind: "directory",
      summary: `Opened directory listing with ${fileRefs.length} file ref(s).`,
      fileRefs,
      reasonCodes: ["resource_specialist_open_ref_directory_listed"],
      rawFileContentStored: false,
    };
  }
  if (!info.isFile() || info.size > 1_000_000) {
    return {
      status: "blocked",
      ref,
      refKind: "file",
      summary: "Requested ref is not a readable bounded text file.",
      reasonCodes: ["resource_specialist_open_ref_file_unavailable_or_oversized"],
      rawFileContentStored: false,
    };
  }
  const lines = (await readFile(absolute, "utf8")).split(/\r?\n/u);
  const preview = lines
    .slice(0, Math.min(120, lines.length))
    .map((line, index) => `${index + 1}: ${line.slice(0, 260)}`)
    .join("\n")
    .slice(0, 18_000);
  return {
    status: "opened",
    ref: relativePath,
    refKind: "file",
    summary: `Opened file preview with ${lines.length} total line(s). Use open_window for precise ranges.`,
    lineCount: lines.length,
    excerpt: preview,
    exactWindowRefs: [`file-window://${relativePath}#L1-L${Math.min(120, lines.length)}`],
    reasonCodes: ["resource_specialist_open_ref_file_previewed"],
    rawFileContentStored: false,
  };
}

async function searchWithinRef(input: {
  repoRoot: string;
  ref: string;
  query: string;
  authorityScopeRefs: string[];
}): Promise<ResourceSpecialistSearchResult> {
  const query = input.query.trim().toLowerCase();
  const queryAlternates = uniqueStrings(
    [
      query,
      ...query
        .split(/(?:\s+|\bor\b|,|;|\||`|"|'|\(|\)|\[|\]|\{|\})/iu)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    ],
    12,
  ).map((part) => part.toLowerCase());
  if (query.length < 2) {
    return {
      status: "blocked",
      ref: input.ref,
      query: input.query,
      matches: [],
      reasonCodes: ["resource_specialist_search_query_too_short"],
      rawFileContentStored: false,
    };
  }
  const relativePath = normalizeRepoPath(input.ref, input.repoRoot);
  if (!relativePath || !authorityAllowsRef({ authorityScopeRefs: input.authorityScopeRefs, ref: relativePath })) {
    return {
      status: "blocked",
      ref: input.ref,
      query: input.query,
      matches: [],
      reasonCodes: ["resource_specialist_search_ref_invalid_or_authority_denied"],
      rawFileContentStored: false,
    };
  }
  const absolute = path.join(input.repoRoot, relativePath);
  const info = await stat(absolute).catch(() => null);
  const files = info?.isDirectory()
    ? await listFilesUnder({ repoRoot: input.repoRoot, relativePath, maxFiles: 140 })
    : info?.isFile()
      ? [relativePath]
      : [];
  const matches: ResourceSpecialistSearchResult["matches"] = [];
  for (const file of files) {
    if (matches.length >= 40) {
      break;
    }
    if (!authorityAllowsRef({ authorityScopeRefs: input.authorityScopeRefs, ref: file })) {
      continue;
    }
    const fileInfo = await stat(path.join(input.repoRoot, file)).catch(() => null);
    if (!fileInfo?.isFile() || fileInfo.size > 500_000) {
      continue;
    }
    const lines = (await readFile(path.join(input.repoRoot, file), "utf8").catch(() => "")).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (queryAlternates.some((alternate) => line.toLowerCase().includes(alternate))) {
        const lineNumber = index + 1;
        const start = Math.max(1, lineNumber - 20);
        const end = Math.min(lines.length, lineNumber + 40);
        matches.push({
          ref: `file-window://${file}#L${start}-L${end}`,
          path: file,
          line: lineNumber,
          preview: `${lineNumber}: ${line.trim().slice(0, 260)}`,
        });
        if (matches.length >= 40) {
          break;
        }
      }
    }
  }
  return {
    status: "completed",
    ref: relativePath,
    query: input.query,
    matches,
    reasonCodes: ["resource_specialist_search_completed"],
    rawFileContentStored: false,
  };
}

function refFromToolInput(input: Record<string, JsonValue>): string | null {
  return (
    bounded(input.ref ?? input.resourceRef ?? input.fileRef ?? input.windowRef ?? input.path, 620) ||
    null
  );
}

function stringsFromInput(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeSubmitExactHandlesInput(
  toolInput: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const exactRefs = uniqueStrings([
    ...stringsFromInput(toolInput.exactContextRefs),
    ...stringsFromInput(toolInput.exactFileWindowRefs),
    ...stringsFromInput(toolInput.selectedExactRefs),
    ...stringsFromInput(toolInput.requestedRefs),
    ...stringsFromInput(toolInput.boundedSnapshotRefs),
    ...stringsFromInput(toolInput.refs),
  ], 24);
  const handoffSummary = bounded(toolInput.handoffSummary, 1_200);
  const relevantFiles = Array.isArray(toolInput.relevantFiles)
    ? toolInput.relevantFiles
    : Array.isArray(toolInput.relevantFileReports)
      ? toolInput.relevantFileReports
      : [];
  const hasStructuredRelevantFile = relevantFiles.some(
    (item) => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  if (exactRefs.length === 0 || hasStructuredRelevantFile || !handoffSummary) {
    return toolInput;
  }
  return {
    ...toolInput,
    relevantFiles: exactRefs.map((ref) => ({
      ref,
      fileRef: normalizedStructuralRef(ref),
      summary: handoffSummary,
      expectedUse: bounded(toolInput.expectedUse, 1_200) || handoffSummary,
    })),
  };
}

function refsFromToolInput(input: Record<string, JsonValue>): string[] {
  return uniqueStrings([
    ...stringsFromInput(input.refs),
    ...stringsFromInput(input.selectedRefs),
    ...stringsFromInput(input.fileRefs),
    ...stringsFromInput(input.selectedFileRefs),
    ...stringsFromInput(input.windowRefs),
    ...stringsFromInput(input.selectedWindowRefs),
    ...stringsFromInput(input.matchRefs),
    ...stringsFromInput(input.selectedMatchRefs),
    ...stringsFromInput(input.searchMatchRefs),
    ...stringsFromInput(input.selectedSearchMatchRefs),
    ...stringsFromInput(input.exactContextRefs),
    ...stringsFromInput(input.exactFileWindowRefs),
    ...stringsFromInput(input.selectedExactRefs),
    input.ref,
    input.resourceRef,
    input.fileRef,
    input.path,
    input.windowRef,
    input.matchRef,
    input.searchMatchRef,
  ], 48);
}

function directoryFileRefs(openedRefs: ResourceSpecialistReadResult[]): string[] {
  return uniqueStrings(
    openedRefs.flatMap((result) =>
      result.status === "opened" && result.refKind === "directory" ? (result.fileRefs ?? []) : [],
    ),
    120,
  );
}

function openedFileRefs(openedRefs: ResourceSpecialistReadResult[]): string[] {
  return uniqueStrings(
    openedRefs
      .filter((result) => result.status === "opened" && result.refKind === "file")
      .map((result) => result.ref),
    80,
  );
}

function searchMatchRefs(searchResults: ResourceSpecialistSearchResult[]): string[] {
  return uniqueStrings(
    searchResults.flatMap((result) =>
      result.status === "completed" ? result.matches.map((match) => match.ref) : [],
    ),
    120,
  );
}

function openedExactWindowRefs(input: {
  openedRefs: ResourceSpecialistReadResult[];
  openedWindows: ResourceSpecialistWindowResult[];
}): string[] {
  return uniqueStrings(
    [
      ...input.openedRefs.flatMap((result) =>
        result.status === "opened" ? (result.exactWindowRefs ?? []) : [],
      ),
      ...input.openedWindows
        .filter((window) => window.status === "opened")
        .map((window) => window.ref),
    ],
    80,
  );
}

function selectedBoundedWindowRefs(input: {
  openedRefs: ResourceSpecialistReadResult[];
  openedWindows: ResourceSpecialistWindowResult[];
}): string[] {
  return uniqueStrings(
    [
      ...input.openedRefs
        .filter((result) => result.status === "opened" && result.refKind === "file_window")
        .map((result) => result.ref),
      ...input.openedWindows
        .filter((window) => window.status === "opened")
        .map((window) => window.ref),
    ],
    80,
  );
}

function knownInspectableRefs(input: {
  legalBroadRefs: string[];
  openedRefs: ResourceSpecialistReadResult[];
  searchResults: ResourceSpecialistSearchResult[];
  openedWindows: ResourceSpecialistWindowResult[];
  chosenFileRefs: string[];
}): string[] {
  return uniqueStrings(
    [
      ...input.legalBroadRefs,
      ...directoryFileRefs(input.openedRefs),
      ...openedFileRefs(input.openedRefs),
      ...input.chosenFileRefs,
      ...searchMatchRefs(input.searchResults),
      ...openedExactWindowRefs({
        openedRefs: input.openedRefs,
        openedWindows: input.openedWindows,
      }),
    ],
    240,
  );
}

function compactOpenedRefForPayload(
  result: ResourceSpecialistReadResult,
): ResourceSpecialistReadResult {
  return {
    ...result,
    excerpt: result.excerpt ? result.excerpt.slice(0, 1_600) : undefined,
    fileRefs: result.refKind === "directory" ? undefined : result.fileRefs?.slice(0, 12),
    exactWindowRefs: result.exactWindowRefs?.slice(0, 8),
  };
}

function compactSearchResultForPayload(
  result: ResourceSpecialistSearchResult,
): ResourceSpecialistSearchResult {
  return {
    ...result,
    matches: result.matches.slice(0, 8).map((match) => ({
      ...match,
      preview: match.preview.slice(0, 140),
    })),
  };
}

function compactOpenedWindowForPayload(
  result: ResourceSpecialistWindowResult,
): ResourceSpecialistWindowResult {
  return {
    ...result,
    excerpt: result.excerpt.slice(0, 1_800),
  };
}

function legalNextResourceScoutToolIds(input: {
  turn: number;
  maxTurns: number;
  finalHandoffTurn?: boolean;
  legalBroadRefs: string[];
  openedRefs: ResourceSpecialistReadResult[];
  searchResults: ResourceSpecialistSearchResult[];
  openedWindows: ResourceSpecialistWindowResult[];
  chosenFileRefs: string[];
}): ResourceSpecialistNarrowingToolId[] {
  const tools = new Set<ResourceSpecialistNarrowingToolId>();
  const fileRefs = directoryFileRefs(input.openedRefs);
  const openedFiles = openedFileRefs(input.openedRefs);
  const matchRefs = searchMatchRefs(input.searchResults);
  const exactWindowRefs = openedExactWindowRefs({
    openedRefs: input.openedRefs,
    openedWindows: input.openedWindows,
  });
  if (input.finalHandoffTurn) {
    if (input.openedWindows.some((window) => window.status === "opened") || exactWindowRefs.length > 0) {
      tools.add("resource.scout.report_relevant_window");
      tools.add("resource.scout.report_existing_pattern");
      tools.add("resource.scout.report_constraint");
      tools.add("resource.scout.report_edit_point");
      tools.add("resource.scout.expand_window");
      tools.add("resource.scout.contract_window");
      tools.add("resource.scout.submit_exact_handles");
    }
    tools.add("resource.scout.mark_narrowing_blocked");
    return [...tools];
  }
  if (input.legalBroadRefs.length > 0) {
    tools.add("resource.scout.open_ref");
    tools.add("resource.scout.choose_search_query");
  }
  if (fileRefs.length > 0) {
    tools.add("resource.scout.choose_file_from_listing");
    tools.add("resource.scout.choose_search_query");
  }
  if (openedFiles.length > 0 || input.chosenFileRefs.length > 0) {
    tools.add("resource.scout.open_window");
    tools.add("resource.scout.choose_search_query");
  }
  if (matchRefs.length > 0 || exactWindowRefs.length > 0) {
    tools.add("resource.scout.choose_window_from_matches");
  }
  if (input.openedWindows.some((window) => window.status === "opened") || exactWindowRefs.length > 0) {
    tools.add("resource.scout.report_relevant_window");
    tools.add("resource.scout.report_existing_pattern");
    tools.add("resource.scout.report_constraint");
    tools.add("resource.scout.report_edit_point");
    tools.add("resource.scout.expand_window");
    tools.add("resource.scout.contract_window");
    tools.add("resource.scout.submit_exact_handles");
  }
  if (
    input.turn >= input.maxTurns ||
    (input.openedRefs.length > 0 &&
      fileRefs.length === 0 &&
      matchRefs.length === 0 &&
      openedFiles.length === 0 &&
      exactWindowRefs.length === 0)
  ) {
    tools.add("resource.scout.mark_narrowing_blocked");
  }
  return [...tools];
}

export async function runResourceSpecialistNarrowingLoop(input: {
  repoRoot: string;
  selectionInput: {
    graphId: string;
    iteration: number;
    nodeId: string;
    nodeKind: string;
    assignedRole?: string | null;
    capabilityId: string | null;
    workIntentRef?: string | null;
    nodeExecutionContractRef?: string | null;
    nodeResourceDemandSessionRef: string;
    resourceObjectiveFocusRef: string;
    legalRefUniverseRef: string;
    resourceSpecialistSpecialistRequestRef: string;
    nodeResourceLedgerRef: string;
    selectedFocusRefs: string[];
    candidateRefs: string[];
    authorityScopeRefs: string[];
    expectedUse: string;
    scoutReason: string;
    allowedToolIds: string[];
    requiredFields: string[];
    exactRefRequirements: Record<string, JsonValue>;
    repairReasonCodes: string[];
  };
  exactWindowOptions?: JsonValue[];
  modelRef: string;
  providerPath: string;
  maxTurns?: number;
  callModel: (
    call: ResourceSpecialistNarrowingModelCallInput,
  ) => Promise<ResourceSpecialistNarrowingModelResponse>;
  onEvent?: (event: {
    event: string;
    status: "running" | "completed";
    details: Record<string, JsonValue>;
  }) => Promise<void> | void;
}): Promise<ResourceSpecialistNarrowingLoopResult> {
  const openedRefs: ResourceSpecialistReadResult[] = [];
  const searchResults: ResourceSpecialistSearchResult[] = [];
  const openedWindows: ResourceSpecialistWindowResult[] = [];
  const modelReports: Array<{ toolId: string; input: Record<string, JsonValue> }> = [];
  const chosenFileRefs: string[] = [];
  const chosenSearches: Array<{ ref: string; query: string }> = [];
  const chosenWindowRefs: string[] = [];
  const maxTurns = input.maxTurns ?? 6;
  const maxModelTurns = maxTurns + 1;
  let lastResponseHash: string | null = null;
  let lastLatencyMs: number | null = null;
  let windowRevisionCount = 0;
  const legalBroadRefs = uniqueStrings([
    ...input.selectionInput.candidateRefs,
    ...input.selectionInput.selectedFocusRefs,
  ], 120);
  for (let turn = 1; turn <= maxModelTurns; turn += 1) {
    const directoryRefs = directoryFileRefs(openedRefs);
    const fileRefs = openedFileRefs(openedRefs);
    const matchRefs = searchMatchRefs(searchResults);
    const exactWindowRefs = openedExactWindowRefs({ openedRefs, openedWindows });
    const finalHandoffTurn =
      turn > maxTurns &&
      (openedWindows.some((window) => window.status === "opened") || exactWindowRefs.length > 0);
    if (turn > maxTurns && !finalHandoffTurn) {
      break;
    }
    const knownRefs = knownInspectableRefs({
      legalBroadRefs,
      openedRefs,
      searchResults,
      openedWindows,
      chosenFileRefs,
    });
    const legalNextToolIds = legalNextResourceScoutToolIds({
      turn,
      maxTurns,
      finalHandoffTurn,
      legalBroadRefs,
      openedRefs,
      searchResults,
      openedWindows,
      chosenFileRefs,
    });
    const userPayload = {
      graphId: input.selectionInput.graphId,
      iteration: input.selectionInput.iteration,
      nodeId: input.selectionInput.nodeId,
      nodeKind: input.selectionInput.nodeKind,
      assignedRole: input.selectionInput.assignedRole ?? null,
      capabilityId: input.selectionInput.capabilityId,
      workIntentRef: input.selectionInput.workIntentRef ?? null,
      nodeExecutionContractRef: input.selectionInput.nodeExecutionContractRef ?? null,
      nodeResourceDemandSessionRef: input.selectionInput.nodeResourceDemandSessionRef,
      resourceObjectiveFocusRef: input.selectionInput.resourceObjectiveFocusRef,
      legalRefUniverseRef: input.selectionInput.legalRefUniverseRef,
      resourceSpecialistSpecialistRequestRef:
        input.selectionInput.resourceSpecialistSpecialistRequestRef,
      nodeResourceLedgerRef: input.selectionInput.nodeResourceLedgerRef,
      legalBroadRefs: legalBroadRefs.slice(0, 80),
      authorityScopeRefs: input.selectionInput.authorityScopeRefs.slice(0, 80),
      expectedUse: input.selectionInput.expectedUse,
      scoutReason: input.selectionInput.scoutReason,
      exactWindowOptions: (input.exactWindowOptions ?? []).slice(0, 20),
      suggestedSearchTerms: Array.isArray(input.selectionInput.exactRefRequirements.suggestedSearchTerms)
        ? input.selectionInput.exactRefRequirements.suggestedSearchTerms
            .filter((term): term is string => typeof term === "string" && term.trim().length > 0)
            .slice(0, 12)
        : [],
      legalNextToolIds,
      allAvailableToolIds: [...RESOURCE_SPECIALIST_NARROWING_TOOL_IDS],
      directoryFileRefs: directoryRefs.slice(0, 80),
      openedFileRefs: fileRefs.slice(0, 80),
      searchMatchRefs: matchRefs.slice(0, 40),
      openedExactWindowRefs: exactWindowRefs.slice(0, 24),
      chosenFileRefs: chosenFileRefs.slice(-24),
      chosenSearches: chosenSearches.slice(-12),
      chosenWindowRefs: chosenWindowRefs.slice(-24),
      openedRefs: openedRefs.slice(-4).map(compactOpenedRefForPayload),
      searchResults: searchResults.slice(-3).map(compactSearchResultForPayload),
      openedWindows: openedWindows.slice(-2).map(compactOpenedWindowForPayload),
      windowRevisionCount,
      modelReports: modelReports.slice(-6),
      requiredFinalFields: input.selectionInput.requiredFields,
      exactRefRequirements: input.selectionInput.exactRefRequirements,
      turn,
      maxTurns,
      finalHandoffTurn,
      allowedToolIds: legalNextToolIds,
      rawPromptStored: false,
      rawResponseStored: false,
    } satisfies Record<string, JsonValue>;
    await input.onEvent?.({
      event: "resource_specialist_narrowing_loop_turn_started",
      status: "running",
      details: {
        nodeId: input.selectionInput.nodeId,
        turn,
        candidateRefCount: legalBroadRefs.length,
        openedRefCount: openedRefs.length,
        searchResultCount: searchResults.reduce((count, result) => count + result.matches.length, 0),
        openedWindowCount: openedWindows.length,
        legalNextToolIds,
        finalHandoffTurn,
        requestByteCount: Buffer.byteLength(JSON.stringify(userPayload), "utf8"),
        payloadHash: `sha256:${sha256(userPayload)}`,
      },
    });
    const response = await input.callModel({
      boundaryId: "context_narrowing_selector",
      taskClass: "tool_selection",
      callSite: "resource.scout.narrowing_selector",
      systemPrompt: [
        "You are a consumer-bound OpenClaw resource scout specialist for one node-local resource demand.",
        "This is not graph scheduling. Do not return graph nodes, scheduler decisions, or durable scout nodes.",
        "Return exactly one compact JSON tool call with top-level toolId and input.",
        "Use only legalNextToolIds from the payload. If a tool is not in legalNextToolIds, do not call it.",
        "Choose semantic scope with small verbs: choose_file_from_listing selects listed file refs, choose_search_query supplies your own query for a broad ref/file, and choose_window_from_matches selects exact file-window refs from previous matches or previews.",
        "For choose_search_query, use ref:'legal_refs' when the query should search across all currently legal refs rather than one exact file.",
        "If suggestedSearchTerms are present, prefer one of those terms or a close variant when it matches the objective. The model still chooses the query; runtime only executes it.",
        "open_ref, search_within_ref, and open_window are mechanical inspection tools. The model must still choose the ref, query, or range; runtime only validates and executes it.",
        "After opening a bounded window, use expand_window or contract_window if the mechanical bounds are too narrow or too broad. The model chooses revised bounds; runtime only validates and hydrates.",
        "If exactRefRequirements.modelMustReviseWindowBeforeSubmit is true, you must call expand_window or contract_window after opening a window before submit_exact_handles.",
        "Directory listings and search matches become legal child handles for later model choices, as long as runtime authority accepts them.",
        "Runtime validates authority, bounds, and schema only. Runtime will not choose meaningful files, lines, or semantic sub-scope.",
        "When you have enough context, return resource.scout.submit_exact_handles with exactContextRefs, handoffSummary, relevantFiles, and expectedUse.",
        "exactContextRefs must be exact file-window://<path>#L<start>-L<end> refs you inspected or selected from search/window results.",
        "If finalHandoffTurn is true, do not inspect more. Submit exact handles from openedExactWindowRefs or mark a precise blocker.",
        "You may also report context substance with report_existing_pattern, report_constraint, report_edit_point, or report_relevant_window before final submission.",
        "Do not mark blocked immediately after one broad directory open or one empty search. First open at least one specific file/window from a directory listing or run a narrower/broader model-authored search.",
        "resource.scout.mark_narrowing_blocked is accepted only after real bounded inspection has failed or the turn budget is exhausted.",
        "Do not store raw prompts, raw responses, transcripts, provider logs, secrets, or hidden reasoning.",
      ].join("\n"),
      userPayload,
      requestedInputBytes: Buffer.byteLength(JSON.stringify(userPayload), "utf8"),
      maxOutputTokens: 2_400,
      timeoutMs: 60_000,
      reasoningMode: "none",
    });
    lastResponseHash = response.responseHash ?? null;
    lastLatencyMs = response.latencyMs ?? null;
    if (response.status === "blocked") {
      throw new Error(
        `resource_specialist_narrowing_model_blocked:${(response.reasonCodes ?? []).join(",")}`,
      );
    }
    const parsed = parseResourceSpecialistNarrowingToolCall(response.responseText);
    if (!parsed.toolId || !parsed.input) {
      if (turn < maxModelTurns) {
        modelReports.push({
          toolId: "resource.scout.invalid_tool_envelope",
          input: {
            rejectedByRuntime: true,
            reason:
              "The previous model response did not contain a legal compact JSON tool call. Return exactly one object with toolId and input.",
            legalNextToolIds,
            reasonCodes: parsed.reasonCodes.slice(0, 12),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      throw new Error(`resource_specialist_narrowing_invalid_tool:${parsed.reasonCodes.join(",")}`);
    }
    await input.onEvent?.({
      event: "resource_specialist_narrowing_loop_turn_completed",
      status: "completed",
      details: {
        nodeId: input.selectionInput.nodeId,
        turn,
        toolId: parsed.toolId,
        responseHash: response.responseHash ?? null,
        latencyMs: response.latencyMs ?? null,
      },
    });
    if (!legalNextToolIds.includes(parsed.toolId)) {
      modelReports.push({
        toolId: parsed.toolId,
        input: {
          rejectedByRuntime: true,
          reason: "Tool was not legal for the current specialist phase.",
          legalNextToolIds,
          directoryFileRefCount: directoryRefs.length,
          searchMatchRefCount: matchRefs.length,
          openedExactWindowRefCount: exactWindowRefs.length,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      continue;
    }
    if (parsed.toolId === "resource.scout.submit_exact_handles") {
      const exactRefRequirements = asRecord(input.selectionInput.exactRefRequirements);
      const searchResultCount = searchResults.reduce(
        (count, result) => count + result.matches.length,
        0,
      );
      const selectedWindowCount = selectedBoundedWindowRefs({
        openedRefs,
        openedWindows,
      }).length;
      if (exactRefRequirements.modelMustSearchBeforeSubmit === true && searchResultCount === 0) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason:
              "submit_exact_handles requires at least one model-authored search result for this demand.",
            legalBroadRefs: legalBroadRefs.slice(0, 80),
            openedExactWindowRefs: exactWindowRefs.slice(0, 40),
            requiredNextTool: "resource.scout.choose_search_query",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      if (
        exactRefRequirements.modelMustOpenWindowBeforeSubmit === true &&
        selectedWindowCount === 0
      ) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason:
              "submit_exact_handles requires at least one opened bounded window for this demand.",
            searchMatchRefs: matchRefs.slice(0, 80),
            openedExactWindowRefs: exactWindowRefs.slice(0, 40),
            requiredNextTool: "resource.scout.choose_window_from_matches",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      if (
        exactRefRequirements.modelMustReviseWindowBeforeSubmit === true &&
        windowRevisionCount === 0
      ) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason:
              "submit_exact_handles requires at least one model-authored expand_window or contract_window after opening a bounded window.",
            openedExactWindowRefs: exactWindowRefs.slice(0, 40),
            requiredNextTool: "resource.scout.expand_window_or_contract_window",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      const normalizedInput = normalizeSubmitExactHandlesInput(parsed.input);
      return {
        toolId: parsed.toolId,
        input: normalizedInput,
        responseHash: lastResponseHash,
        latencyMs: lastLatencyMs,
        turnCount: turn,
        openedRefCount: openedRefs.length,
        searchResultCount,
        selectedWindowCount,
        windowRevisionCount,
        reasonCodes: [
          "resource_specialist_narrowing_loop_completed",
          ...(normalizedInput === parsed.input
            ? []
            : ["resource_specialist_narrowing_relevant_files_derived_from_model_summary"]),
          ...(finalHandoffTurn
            ? ["resource_specialist_narrowing_final_handoff_turn_after_window"]
            : []),
          ...parsed.reasonCodes,
        ],
      };
    }
    if (parsed.toolId === "resource.scout.mark_narrowing_blocked") {
      const inspectedConcreteContext =
        openedWindows.some((window) => window.status === "opened") ||
        openedRefs.some((ref) => ref.status === "opened" && ref.refKind === "file");
      if (!inspectedConcreteContext && turn < maxTurns) {
        modelReports.push({
          toolId: "resource.scout.mark_narrowing_blocked",
          input: {
            rejectedByRuntime: true,
            reason: "Blocked result was premature for the current specialist phase.",
            legalNextToolIds,
            directoryFileRefs: directoryRefs.slice(0, 40),
            searchMatchRefs: matchRefs.slice(0, 40),
            openedExactWindowRefs: exactWindowRefs.slice(0, 40),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      return {
        toolId: parsed.toolId,
        input: parsed.input,
        responseHash: lastResponseHash,
        latencyMs: lastLatencyMs,
        turnCount: turn,
        openedRefCount: openedRefs.length,
        searchResultCount: searchResults.reduce((count, result) => count + result.matches.length, 0),
        selectedWindowCount: selectedBoundedWindowRefs({ openedRefs, openedWindows }).length,
        windowRevisionCount,
        reasonCodes: [
          "resource_specialist_narrowing_loop_completed",
          ...(!inspectedConcreteContext ? ["resource_specialist_narrowing_blocked_after_turn_budget"] : []),
          ...(finalHandoffTurn
            ? ["resource_specialist_narrowing_final_handoff_turn_after_window"]
            : []),
          ...parsed.reasonCodes,
        ],
      };
    }
    if (parsed.toolId === "resource.scout.choose_file_from_listing") {
      const selectedRefs = refsFromToolInput(parsed.input).filter((ref) =>
        directoryRefs.includes(ref),
      );
      if (selectedRefs.length === 0) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason: "choose_file_from_listing requires fileRefs selected from directoryFileRefs.",
            directoryFileRefs: directoryRefs.slice(0, 80),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      for (const ref of selectedRefs.slice(0, 8)) {
        if (!chosenFileRefs.includes(ref)) {
          chosenFileRefs.push(ref);
        }
        openedRefs.push(
          await openRef({
            repoRoot: input.repoRoot,
            ref,
            authorityScopeRefs: input.selectionInput.authorityScopeRefs,
          }),
        );
      }
      modelReports.push({
        toolId: parsed.toolId,
        input: {
          acceptedByRuntime: true,
          selectedFileRefs: selectedRefs.slice(0, 8),
          reasonCodes: ["resource_specialist_choose_file_from_listing_accepted"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      continue;
    }
    if (parsed.toolId === "resource.scout.choose_search_query") {
      const ref = refFromToolInput(parsed.input);
      const query = bounded(parsed.input.query ?? parsed.input.pattern, 240);
      const searchAllLegalRefs =
        !ref ||
        ["all", "legal_refs", "legalBroadRefs", "authority", "authority_scope"].includes(ref);
      if (!searchAllLegalRefs && !knownRefs.includes(ref)) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason:
              "choose_search_query requires a ref from legalBroadRefs, directoryFileRefs, openedFileRefs, searchMatchRefs, or ref:'legal_refs' to search all legal refs.",
            knownInspectableRefs: knownRefs.slice(0, 120),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      const refsToSearch = searchAllLegalRefs ? legalBroadRefs : [ref];
      for (const selectedRef of refsToSearch.slice(0, 16)) {
        chosenSearches.push({ ref: selectedRef, query });
        searchResults.push(
          await searchWithinRef({
            repoRoot: input.repoRoot,
            ref: selectedRef,
            query,
            authorityScopeRefs: input.selectionInput.authorityScopeRefs,
          }),
        );
      }
      continue;
    }
    if (parsed.toolId === "resource.scout.choose_window_from_matches") {
      const legalWindowRefs = uniqueStrings([...matchRefs, ...exactWindowRefs], 160);
      const selectedRefs = refsFromToolInput(parsed.input).filter((ref) =>
        legalWindowRefs.includes(ref),
      );
      if (selectedRefs.length === 0) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason: "choose_window_from_matches requires refs selected from searchMatchRefs or openedExactWindowRefs.",
            searchMatchRefs: matchRefs.slice(0, 80),
            openedExactWindowRefs: exactWindowRefs.slice(0, 80),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      for (const ref of selectedRefs.slice(0, 8)) {
        const parsedWindow = parseFileWindow(ref);
        if (!parsedWindow) {
          continue;
        }
        chosenWindowRefs.push(ref);
        const window = await readWindow({
          repoRoot: input.repoRoot,
          relativePath: parsedWindow.path,
          lineStart: parsedWindow.lineStart,
          lineEnd: parsedWindow.lineEnd,
        });
        openedWindows.push(
          window.status === "opened" &&
            !authorityAllowsRef({
              authorityScopeRefs: input.selectionInput.authorityScopeRefs,
              ref: window.ref,
            })
            ? {
                status: "blocked",
                ref: window.ref,
                path: window.path,
                lineStart: window.lineStart,
                lineEnd: window.lineEnd,
                excerpt: "",
                reasonCodes: ["resource_specialist_choose_window_authority_denied"],
                rawFileContentStored: false,
              }
            : window,
        );
      }
      continue;
    }
    if (parsed.toolId === "resource.scout.open_ref") {
      const ref = refFromToolInput(parsed.input);
      openedRefs.push(
        ref
          ? await openRef({
              repoRoot: input.repoRoot,
              ref,
              authorityScopeRefs: input.selectionInput.authorityScopeRefs,
            })
          : {
              status: "blocked",
              ref: "missing",
              refKind: "unknown",
              summary: "open_ref requires ref.",
              reasonCodes: ["resource_specialist_open_ref_ref_missing"],
              rawFileContentStored: false,
            },
      );
      continue;
    }
    if (parsed.toolId === "resource.scout.search_within_ref") {
      const ref = refFromToolInput(parsed.input);
      const query = bounded(parsed.input.query ?? parsed.input.pattern, 240);
      const searchAllLegalRefs =
        !ref ||
        ["all", "legal_refs", "legalBroadRefs", "authority", "authority_scope"].includes(ref);
      if (searchAllLegalRefs) {
        for (const selectedRef of legalBroadRefs.slice(0, 16)) {
          searchResults.push(
            await searchWithinRef({
              repoRoot: input.repoRoot,
              ref: selectedRef,
              query,
              authorityScopeRefs: input.selectionInput.authorityScopeRefs,
            }),
          );
        }
      } else {
        searchResults.push(
          knownRefs.includes(ref)
            ? await searchWithinRef({
                repoRoot: input.repoRoot,
                ref,
                query,
                authorityScopeRefs: input.selectionInput.authorityScopeRefs,
              })
            : {
                status: "blocked",
                ref,
                query,
                matches: [],
                reasonCodes: ["resource_specialist_search_ref_not_known_to_current_phase"],
                rawFileContentStored: false,
              },
        );
      }
      continue;
    }
    if (parsed.toolId === "resource.scout.open_window") {
      const ref = refFromToolInput(parsed.input);
      const parsedWindow = ref ? parseFileWindow(ref) : null;
      const requestedPath =
        parsedWindow?.path ??
        bounded(parsed.input.path ?? parsed.input.fileRef ?? parsed.input.resourceRef, 620);
      if (
        requestedPath &&
        !knownRefs.includes(requestedPath) &&
        !knownRefs.includes(`file-window://${requestedPath}`)
      ) {
        openedWindows.push({
          status: "blocked",
          ref: ref ?? `file-window://${requestedPath}#L${String(parsed.input.lineStart ?? 1)}-L${String(parsed.input.lineEnd ?? 120)}`,
          path: requestedPath,
          lineStart: typeof parsed.input.lineStart === "number" ? parsed.input.lineStart : null,
          lineEnd: typeof parsed.input.lineEnd === "number" ? parsed.input.lineEnd : null,
          excerpt: "",
          reasonCodes: ["resource_specialist_open_window_path_not_known_to_current_phase"],
          rawFileContentStored: false,
        });
        continue;
      }
      const window = await readWindow({
        repoRoot: input.repoRoot,
        relativePath: requestedPath,
        lineStart:
          parsedWindow?.lineStart ??
          (typeof parsed.input.lineStart === "number" ? parsed.input.lineStart : 1),
        lineEnd:
          parsedWindow?.lineEnd ??
          (typeof parsed.input.lineEnd === "number" ? parsed.input.lineEnd : 120),
      });
      if (
        window.status === "opened" &&
        !authorityAllowsRef({
          authorityScopeRefs: input.selectionInput.authorityScopeRefs,
          ref: window.ref,
        })
      ) {
        openedWindows.push({
          status: "blocked",
          ref: window.ref,
          path: window.path,
          lineStart: window.lineStart,
          lineEnd: window.lineEnd,
          excerpt: "",
          reasonCodes: ["resource_specialist_open_window_authority_denied"],
          rawFileContentStored: false,
        });
      } else {
        openedWindows.push(window);
      }
      continue;
    }
    if (
      parsed.toolId === "resource.scout.expand_window" ||
      parsed.toolId === "resource.scout.contract_window"
    ) {
      const ref = refFromToolInput(parsed.input);
      const parsedWindow = ref ? parseFileWindow(ref) : null;
      if (!parsedWindow || !exactWindowRefs.includes(ref ?? "")) {
        modelReports.push({
          toolId: parsed.toolId,
          input: {
            rejectedByRuntime: true,
            reason: "expand_window/contract_window requires an opened exact file-window ref.",
            openedExactWindowRefs: exactWindowRefs.slice(0, 80),
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      const beforeLines =
        typeof parsed.input.beforeLines === "number"
          ? Math.max(0, Math.floor(parsed.input.beforeLines))
          : typeof parsed.input.before_lines === "number"
            ? Math.max(0, Math.floor(parsed.input.before_lines))
            : 80;
      const afterLines =
        typeof parsed.input.afterLines === "number"
          ? Math.max(0, Math.floor(parsed.input.afterLines))
          : typeof parsed.input.after_lines === "number"
            ? Math.max(0, Math.floor(parsed.input.after_lines))
            : 80;
      const explicitStart =
        typeof parsed.input.lineStart === "number"
          ? Math.floor(parsed.input.lineStart)
          : typeof parsed.input.startLine === "number"
            ? Math.floor(parsed.input.startLine)
            : null;
      const explicitEnd =
        typeof parsed.input.lineEnd === "number"
          ? Math.floor(parsed.input.lineEnd)
          : typeof parsed.input.endLine === "number"
            ? Math.floor(parsed.input.endLine)
            : null;
      const lineStart =
        explicitStart ??
        (parsed.toolId === "resource.scout.expand_window"
          ? Math.max(1, parsedWindow.lineStart - beforeLines)
          : parsedWindow.lineStart);
      const lineEnd =
        explicitEnd ??
        (parsed.toolId === "resource.scout.expand_window"
          ? parsedWindow.lineEnd + afterLines
          : parsedWindow.lineEnd);
      const window = await readWindow({
        repoRoot: input.repoRoot,
        relativePath: parsedWindow.path,
        lineStart,
        lineEnd,
      });
      openedWindows.push(
        window.status === "opened" &&
          !authorityAllowsRef({
            authorityScopeRefs: input.selectionInput.authorityScopeRefs,
            ref: window.ref,
          })
          ? {
              status: "blocked",
              ref: window.ref,
              path: window.path,
              lineStart: window.lineStart,
              lineEnd: window.lineEnd,
              excerpt: "",
              reasonCodes: ["resource_specialist_revised_window_authority_denied"],
              rawFileContentStored: false,
            }
          : {
              ...window,
              reasonCodes: [
                ...window.reasonCodes,
                parsed.toolId === "resource.scout.expand_window"
                  ? "resource_specialist_window_expanded_by_model"
                  : "resource_specialist_window_contracted_by_model",
              ],
            },
      );
      if (
        window.status === "opened" &&
        authorityAllowsRef({
          authorityScopeRefs: input.selectionInput.authorityScopeRefs,
          ref: window.ref,
        })
      ) {
        windowRevisionCount += 1;
      }
      continue;
    }
    modelReports.push({ toolId: parsed.toolId, input: parsed.input });
  }
  return {
    toolId: "resource.scout.mark_narrowing_blocked",
    input: {
      blockerSummary:
        "Resource specialist narrowing reached its bounded tool-turn limit before submitting exact handles.",
      limitations: [
        {
          summary:
            "The model inspected/search/opened bounded refs but did not complete resource.scout.submit_exact_handles.",
          severity: "blocking",
        },
      ],
      expectedUse: input.selectionInput.expectedUse,
    },
    responseHash: lastResponseHash,
    latencyMs: lastLatencyMs,
    turnCount: maxTurns,
    openedRefCount: openedRefs.length,
    searchResultCount: searchResults.reduce((count, result) => count + result.matches.length, 0),
    selectedWindowCount: selectedBoundedWindowRefs({ openedRefs, openedWindows }).length,
    windowRevisionCount,
    reasonCodes: ["resource_specialist_narrowing_loop_turn_limit_reached"],
  };
}
