import { createRequire } from "node:module";
import path from "node:path";
import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type * as TypeScript from "typescript";
import { expandHomePrefix, resolveOsHomeDir } from "../infra/home-dir.js";
import { type OpenClawLspDiagnostic, type OpenClawLspService } from "./openclaw-lsp-service.js";
import { getToolParamsRecord, normalizeEditToolParams } from "./pi-tools.params.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

const require = createRequire(import.meta.url);
let cachedTypeScript: typeof TypeScript | null = null;

function loadTypeScript(): typeof TypeScript {
  cachedTypeScript ??= require("typescript") as typeof TypeScript;
  return cachedTypeScript;
}

type EditToolRecoveryOptions = {
  root: string;
  readFile: (absolutePath: string) => Promise<string>;
  writeFile?: (absolutePath: string, content: string) => Promise<void>;
  lspService?: OpenClawLspService;
};

type WriteToolMetadataOptions = {
  root: string;
  lspService?: OpenClawLspService;
  access?: (absolutePath: string) => Promise<void>;
};

type EditToolParams = {
  pathParam?: string;
  edits: EditOperation[];
  replaceAll: boolean;
};

type EditReplacement = {
  path?: string;
  oldText: string;
  newText: string;
};

type EditOperation = {
  path?: string;
  oldText?: string;
  newText: string;
  startLine?: number;
  endLine?: number;
  insertBeforeLine?: number;
  insertAfterLine?: number;
  expectedOldText?: string;
};

type MaterializedEditGroup = {
  pathParam: string;
  absolutePath: string;
  originalContent: string;
  edits: EditReplacement[];
};

type EditMatchCandidate = {
  oldText: string;
  start: number;
  end: number;
};

type EditReplacer = (content: string, find: string) => Generator<string, void, unknown>;

const EDIT_MISMATCH_MESSAGE = "Could not find the exact text in";
const RECOVERY_DIFF_CONTEXT_LINES = 3;
const RECOVERY_DIFF_MAX_CHARS = 8_000;
const EDIT_FEEDBACK_DIFF_MAX_CHARS = 12_000;
const LARGE_FILE_SURGICAL_EDIT_LINE_THRESHOLD = 1_000;
const LARGE_OLD_TEXT_LINE_THRESHOLD = 80;
const LARGE_NET_DELETION_LINE_THRESHOLD = 40;
const DECLARATION_REMOVAL_REJECTION_THRESHOLD = 2;
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.65;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.65;
const EDIT_IMPLEMENTATION_GUIDANCE =
  'Primary implementation mutation tool. Code in text output is not saved until this tool runs. Use this one tool for mutation. Canonical exact shape: edit({filePath, oldString, newString, replaceAll?}). Canonical batch shape: edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}, {type:"insert_after", filePath, line, text}]}). Use edit as soon as the target file, target symbol, and patch shape are visible. Prefer the largest currently-grounded coherent vertical edit batch: producer, wiring, and first consumer together when those locations are visible. Keep exact oldString replacements surgical, usually 5-40 lines, and do not include unrelated exported declarations or whole sections. Batch only non-overlapping operations; do not batch conflicting replacements.';

function appendEditImplementationGuidance(description: unknown): string {
  const base = typeof description === "string" && description.trim() ? description.trim() : "";
  return base.includes(EDIT_IMPLEMENTATION_GUIDANCE)
    ? base
    : [base, EDIT_IMPLEMENTATION_GUIDANCE].filter(Boolean).join("\n\n");
}

function resolveEditPath(root: string, pathParam: string): string {
  const home = resolveOsHomeDir();
  const expanded = home ? expandHomePrefix(pathParam, { home }) : pathParam;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

function readStringParam(record: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function readNumberParam(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return parsed >= 1 ? parsed : undefined;
  }
  return undefined;
}

function readEditOperations(record: Record<string, unknown> | undefined): EditOperation[] {
  if (!Array.isArray(record?.edits)) {
    return [];
  }
  const operations: EditOperation[] = [];
  for (const entry of record.edits) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const replacement = entry as Record<string, unknown>;
    if (typeof replacement.newText !== "string") {
      continue;
    }
    const pathParam = readStringParam(replacement, "path", "filePath", "file_path");
    const expectedOldText = readStringParam(replacement, "expectedOldText", "expectedOldString");
    const oldText = readStringParam(replacement, "oldText", "oldString");
    const base = {
      ...(pathParam ? { path: pathParam } : {}),
      newText: replacement.newText,
      ...(expectedOldText ? { expectedOldText } : {}),
    };
    if (oldText && oldText.trim().length > 0) {
      operations.push({ ...base, oldText });
      continue;
    }
    const startLine = readNumberParam(replacement, "startLine");
    const endLine = readNumberParam(replacement, "endLine");
    if (startLine !== undefined && endLine !== undefined && endLine >= startLine) {
      operations.push({ ...base, startLine, endLine });
      continue;
    }
    const insertBeforeLine = readNumberParam(replacement, "insertBeforeLine");
    const insertAfterLine = readNumberParam(replacement, "insertAfterLine");
    if (insertBeforeLine !== undefined && insertAfterLine === undefined) {
      operations.push({ ...base, insertBeforeLine });
      continue;
    }
    if (insertAfterLine !== undefined && insertBeforeLine === undefined) {
      operations.push({ ...base, insertAfterLine });
      continue;
    }
  }
  return operations;
}

function readEditToolParams(params: unknown): EditToolParams {
  const record = getToolParamsRecord(normalizeEditToolParams(params));
  return {
    pathParam: readStringParam(record, "path"),
    edits: readEditOperations(record),
    replaceAll: record?.replaceAll === true,
  };
}

function buildReplaceAllEditParams(params: {
  rawParams: unknown;
  pathParam: string;
  currentContent: string;
  edit: EditReplacement;
}): unknown {
  const nextContent = params.currentContent.split(params.edit.oldText).join(params.edit.newText);
  return {
    ...getToolParamsRecord(normalizeEditToolParams(params.rawParams)),
    path: params.pathParam,
    replaceAll: true,
    edits: [
      {
        oldText: params.currentContent,
        newText: nextContent,
      },
    ],
  };
}

function cloneParamsWithMaterializedEdits(params: {
  rawParams: unknown;
  pathParam: string;
  edits: readonly EditReplacement[];
  replaceAll?: boolean;
}): unknown {
  const record = getToolParamsRecord(normalizeEditToolParams(params.rawParams)) ?? {};
  const {
    filePath: _filePath,
    file_path: _file_path,
    oldText: _oldText,
    oldString: _oldString,
    newText: _newText,
    newString: _newString,
    startLine: _startLine,
    endLine: _endLine,
    insertBeforeLine: _insertBeforeLine,
    insertAfterLine: _insertAfterLine,
    expectedOldText: _expectedOldText,
    expectedOldString: _expectedOldString,
    ...rest
  } = record;
  return {
    ...rest,
    path: params.pathParam,
    ...(params.replaceAll !== undefined ? { replaceAll: params.replaceAll } : {}),
    edits: params.edits.map((edit) => ({
      oldText: edit.oldText,
      newText: edit.newText,
    })),
  };
}

async function materializeEditGroups(params: {
  root: string;
  pathParam?: string;
  edits: readonly EditOperation[];
  readFile: (absolutePath: string) => Promise<string>;
}): Promise<MaterializedEditGroup[]> {
  const grouped = new Map<
    string,
    { pathParam: string; absolutePath: string; edits: EditOperation[] }
  >();
  for (const edit of params.edits) {
    const editPath = edit.path ?? params.pathParam;
    if (!editPath) {
      throw new Error(
        'Each edit operation needs a filePath. Use edit({filePath, oldString, newString}) or edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}]}).',
      );
    }
    const absolutePath = resolveEditPath(params.root, editPath);
    const key = absolutePath;
    const group = grouped.get(key) ?? { pathParam: editPath, absolutePath, edits: [] };
    group.edits.push(edit);
    grouped.set(key, group);
  }

  const materialized: MaterializedEditGroup[] = [];
  for (const group of grouped.values()) {
    assertNonOverlappingLineOperations(group.pathParam, group.edits);
    const originalContent = await params.readFile(group.absolutePath);
    const edits = group.edits.map((edit) =>
      materializeLineOperation({
        pathParam: group.pathParam,
        currentContent: originalContent,
        edit,
      }),
    );
    materialized.push({
      pathParam: group.pathParam,
      absolutePath: group.absolutePath,
      originalContent,
      edits,
    });
  }
  return materialized;
}

function mergeBatchEditResults(params: {
  results: AgentToolResult<unknown>[];
  groups: readonly MaterializedEditGroup[];
}): AgentToolResult<unknown> {
  const text = params.results
    .flatMap((result) =>
      result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])),
    )
    .filter((value) => value.trim().length > 0)
    .join("\n\n");
  const details = params.results.reduce<Record<string, unknown>>(
    (merged, result) => mergeRecordDetails(merged, result.details),
    {},
  );
  const changedFilePaths = params.groups.map((group) => group.pathParam);
  return {
    isError: false,
    content: [
      {
        type: "text",
        text: [`Atomic edit batch applied across ${params.groups.length} file(s).`, text]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    details: mergeRecordDetails(details, {
      batchAtomic: true,
      fileCount: params.groups.length,
      changedFilePaths,
      modifiedFilePaths: changedFilePaths,
      editCount: params.groups.reduce((count, group) => count + group.edits.length, 0),
    }),
  } as AgentToolResult<unknown>;
}

function normalizeToLF(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function lineCount(value: string): number {
  return normalizeToLF(value).split("\n").length;
}

function splitLinesWithEndings(value: string): string[] {
  const matches = value.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return matches.length > 0 && matches[matches.length - 1] === "" ? matches.slice(0, -1) : matches;
}

function lineEndingForLine(line: string | undefined): string {
  if (line?.endsWith("\r\n")) {
    return "\r\n";
  }
  if (line?.endsWith("\r")) {
    return "\r";
  }
  return "\n";
}

function ensureTrailingLineEnding(value: string, lineEnding: string): string {
  if (value.length === 0 || /\r\n$|\n$|\r$/.test(value)) {
    return value;
  }
  return `${value}${lineEnding}`;
}

function rangeOldText(params: {
  pathParam: string;
  currentContent: string;
  startLine: number;
  endLine: number;
}): string {
  const lines = splitLinesWithEndings(params.currentContent);
  if (
    params.startLine < 1 ||
    params.endLine < params.startLine ||
    params.startLine > lines.length ||
    params.endLine > lines.length
  ) {
    throw new Error(
      [
        `Invalid edit line range for ${params.pathParam}: startLine=${params.startLine}, endLine=${params.endLine}, fileLines=${lines.length}.`,
        `Ready repair call: read({"path":"${params.pathParam}","offset":${Math.max(1, Math.min(params.startLine, lines.length || 1))},"limit":80})`,
      ].join("\n"),
    );
  }
  return lines.slice(params.startLine - 1, params.endLine).join("");
}

function assertExpectedOldText(params: {
  pathParam: string;
  selectedText: string;
  expectedOldText?: string;
  startLine: number;
  endLine: number;
}) {
  if (typeof params.expectedOldText !== "string" || params.expectedOldText.length === 0) {
    return;
  }
  const selected = normalizeToLF(params.selectedText).trimEnd();
  const expected = normalizeToLF(params.expectedOldText).trimEnd();
  if (selected === expected || selected.includes(expected)) {
    return;
  }
  throw new Error(
    [
      `expectedOldText did not match the selected source in ${params.pathParam}:${params.startLine}-${params.endLine}.`,
      `Ready repair call: read({"path":"${params.pathParam}","offset":${params.startLine},"limit":${Math.max(20, params.endLine - params.startLine + 20)}})`,
    ].join("\n"),
  );
}

function materializeLineOperation(params: {
  pathParam: string;
  currentContent: string;
  edit: EditOperation;
}): EditReplacement {
  if (typeof params.edit.oldText === "string" && params.edit.oldText.trim().length > 0) {
    return {
      path: params.edit.path,
      oldText: params.edit.oldText,
      newText: params.edit.newText,
    };
  }

  if (params.edit.startLine !== undefined && params.edit.endLine !== undefined) {
    const oldText = rangeOldText({
      pathParam: params.pathParam,
      currentContent: params.currentContent,
      startLine: params.edit.startLine,
      endLine: params.edit.endLine,
    });
    assertExpectedOldText({
      pathParam: params.pathParam,
      selectedText: oldText,
      expectedOldText: params.edit.expectedOldText,
      startLine: params.edit.startLine,
      endLine: params.edit.endLine,
    });
    return {
      path: params.edit.path,
      oldText,
      newText: ensureTrailingLineEnding(params.edit.newText, lineEndingForLine(oldText)),
    };
  }

  const insertionLine = params.edit.insertBeforeLine ?? params.edit.insertAfterLine;
  if (insertionLine === undefined) {
    throw new Error(
      'Invalid edit operation. Use edit({filePath, oldString, newString}) or edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}]}) or edit({operations:[{type:"insert_after", filePath, line, text}]}).',
    );
  }
  const anchorText = rangeOldText({
    pathParam: params.pathParam,
    currentContent: params.currentContent,
    startLine: insertionLine,
    endLine: insertionLine,
  });
  assertExpectedOldText({
    pathParam: params.pathParam,
    selectedText: anchorText,
    expectedOldText: params.edit.expectedOldText,
    startLine: insertionLine,
    endLine: insertionLine,
  });
  const insertion = ensureTrailingLineEnding(params.edit.newText, lineEndingForLine(anchorText));
  return {
    path: params.edit.path,
    oldText: anchorText,
    newText:
      params.edit.insertBeforeLine !== undefined
        ? `${insertion}${anchorText}`
        : `${anchorText}${insertion}`,
  };
}

function operationLineSpan(edit: EditOperation): { start: number; end: number } | undefined {
  if (edit.startLine !== undefined && edit.endLine !== undefined) {
    return { start: edit.startLine, end: edit.endLine };
  }
  if (edit.insertBeforeLine !== undefined) {
    return { start: edit.insertBeforeLine, end: edit.insertBeforeLine };
  }
  if (edit.insertAfterLine !== undefined) {
    return { start: edit.insertAfterLine, end: edit.insertAfterLine };
  }
  return undefined;
}

function assertNonOverlappingLineOperations(pathParam: string, edits: readonly EditOperation[]) {
  const spans = edits
    .map((edit, index) => ({ index, span: operationLineSpan(edit) }))
    .filter((entry): entry is { index: number; span: { start: number; end: number } } =>
      Boolean(entry.span),
    )
    .toSorted((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1];
    const current = spans[index];
    if (previous.span.end >= current.span.start) {
      throw new Error(
        `Overlapping line/range edits rejected for ${pathParam}: edits ${previous.index + 1} and ${current.index + 1} both touch lines ${current.span.start}-${Math.min(previous.span.end, current.span.end)}. Split the batch or make one coherent range replacement.`,
      );
    }
  }
}

function asExactReplacements(edits: readonly EditOperation[]): EditReplacement[] {
  return edits.flatMap((edit) =>
    typeof edit.oldText === "string" && edit.oldText.trim().length > 0
      ? [{ path: edit.path, oldText: edit.oldText, newText: edit.newText }]
      : [],
  );
}

function collectTopLevelDeclarationNames(value: string): string[] {
  const names = new Set<string>();
  const source = normalizeToLF(value);
  const patterns = [
    /^\s*export\s+(?:declare\s+)?(?:type|interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
    /^\s*(?:type|interface|class|function|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (name) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

function assertSurgicalEditSafety(params: {
  pathParam: string;
  currentContent: string;
  edits: readonly EditReplacement[];
}) {
  const fileLines = lineCount(params.currentContent);
  for (const edit of params.edits) {
    const oldLines = lineCount(edit.oldText);
    const newLines = lineCount(edit.newText);
    const netDeletedLines = Math.max(0, oldLines - newLines);
    const oldDeclarations = collectTopLevelDeclarationNames(edit.oldText);
    const newDeclarations = new Set(collectTopLevelDeclarationNames(edit.newText));
    const removedDeclarations = oldDeclarations.filter((name) => !newDeclarations.has(name));
    const reasons: string[] = [];

    if (
      fileLines >= LARGE_FILE_SURGICAL_EDIT_LINE_THRESHOLD &&
      oldLines >= LARGE_OLD_TEXT_LINE_THRESHOLD
    ) {
      reasons.push(
        `oldText spans ${oldLines} lines in a ${fileLines}-line file; use a smaller anchored replacement`,
      );
    }
    if (netDeletedLines >= LARGE_NET_DELETION_LINE_THRESHOLD) {
      reasons.push(
        `replacement would remove ${netDeletedLines} more line(s) than it adds; split into smaller exact replacements`,
      );
    }
    if (removedDeclarations.length >= DECLARATION_REMOVAL_REJECTION_THRESHOLD) {
      reasons.push(
        `replacement drops exported/top-level declarations: ${removedDeclarations
          .slice(0, 8)
          .join(", ")}`,
      );
    }

    if (reasons.length > 0) {
      throw new Error(
        [
          `Large or cross-section edit rejected before mutating ${params.pathParam}.`,
          ...reasons,
          "Use one smaller edit({filePath, oldString, newString}) replacement around the target symbol, or split into non-overlapping exact replacements.",
        ].join("\n"),
      );
    }
  }
}

function lineStartOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let nextOffset = 0;
  for (const line of lines) {
    offsets.push(nextOffset);
    nextOffset += line.length + 1;
  }
  return offsets;
}

function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") {
    return Math.max(a.length, b.length);
  }
  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_, column) =>
      row === 0 ? column : column === 0 ? row : 0,
    ),
  );
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

const simpleReplacer: EditReplacer = function* (_content, find) {
  yield find;
};

const lineTrimmedReplacer: EditReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  const offsets = lineStartOffsets(originalLines);
  for (let startLine = 0; startLine <= originalLines.length - searchLines.length; startLine += 1) {
    let matches = true;
    for (let index = 0; index < searchLines.length; index += 1) {
      if (originalLines[startLine + index].trim() !== searchLines[index].trim()) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    const start = offsets[startLine];
    const endLine = startLine + searchLines.length - 1;
    const end = offsets[endLine] + originalLines[endLine].length;
    yield content.slice(start, end);
  }
};

const blockAnchorReplacer: EditReplacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines.length < 3) {
    return;
  }
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;
  const maxLineDelta = Math.max(1, Math.floor(searchBlockSize * 0.25));
  const candidates: Array<{ startLine: number; endLine: number }> = [];
  for (let startLine = 0; startLine < originalLines.length; startLine += 1) {
    if (originalLines[startLine].trim() !== firstLineSearch) {
      continue;
    }
    for (let endLine = startLine + 2; endLine < originalLines.length; endLine += 1) {
      if (originalLines[endLine].trim() !== lastLineSearch) {
        continue;
      }
      const actualBlockSize = endLine - startLine + 1;
      if (Math.abs(actualBlockSize - searchBlockSize) <= maxLineDelta) {
        candidates.push({ startLine, endLine });
      }
      break;
    }
  }
  if (candidates.length === 0) {
    return;
  }
  const offsets = lineStartOffsets(originalLines);
  let bestMatch: { startLine: number; endLine: number } | null = null;
  let maxSimilarity = -1;
  for (const candidate of candidates) {
    const { startLine, endLine } = candidate;
    const actualBlockSize = endLine - startLine + 1;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);
    let similarity = linesToCheck > 0 ? 0 : 1;
    for (let index = 1; index < searchBlockSize - 1 && index < actualBlockSize - 1; index += 1) {
      const originalLine = originalLines[startLine + index].trim();
      const searchLine = searchLines[index].trim();
      const maxLength = Math.max(originalLine.length, searchLine.length);
      if (maxLength === 0) {
        continue;
      }
      similarity += (1 - levenshtein(originalLine, searchLine) / maxLength) / linesToCheck;
    }
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = candidate;
    }
  }
  const threshold =
    candidates.length === 1
      ? SINGLE_CANDIDATE_SIMILARITY_THRESHOLD
      : MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD;
  if (!bestMatch || maxSimilarity < threshold) {
    return;
  }
  const start = offsets[bestMatch.startLine];
  const end = offsets[bestMatch.endLine] + originalLines[bestMatch.endLine].length;
  yield content.slice(start, end);
};

const whitespaceNormalizedReplacer: EditReplacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalizeWhitespace(find);
  const lines = content.split("\n");
  for (const line of lines) {
    const normalizedLine = normalizeWhitespace(line);
    if (normalizedLine === normalizedFind) {
      yield line;
      continue;
    }
    if (!normalizedLine.includes(normalizedFind)) {
      continue;
    }
    const words = find.trim().split(/\s+/);
    if (words.length === 0) {
      continue;
    }
    const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    try {
      const match = line.match(new RegExp(pattern));
      if (match) {
        yield match[0];
      }
    } catch {
      // Invalid pattern after escaping should be impossible, but skip defensively.
    }
  }
  const findLines = find.split("\n");
  if (findLines.length <= 1) {
    return;
  }
  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join("\n");
    if (normalizeWhitespace(block) === normalizedFind) {
      yield block;
    }
  }
};

const indentationFlexibleReplacer: EditReplacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) {
      return text;
    }
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0),
    );
    return lines
      .map((line) => (line.trim().length === 0 ? line : line.slice(minIndent)))
      .join("\n");
  };
  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  for (let startLine = 0; startLine <= contentLines.length - findLines.length; startLine += 1) {
    const block = contentLines.slice(startLine, startLine + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) {
      yield block;
    }
  }
};

const escapeNormalizedReplacer: EditReplacer = function* (content, find) {
  const unescapeString = (value: string) =>
    value.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, capturedChar: string) => {
      switch (capturedChar) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "\n":
          return "\n";
        case "$":
          return "$";
        default:
          return match;
      }
    });
  const unescapedFind = unescapeString(find);
  if (content.includes(unescapedFind)) {
    yield unescapedFind;
  }
  const lines = content.split("\n");
  const findLines = unescapedFind.split("\n");
  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join("\n");
    if (unescapeString(block) === unescapedFind) {
      yield block;
    }
  }
};

const trimmedBoundaryReplacer: EditReplacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (trimmedFind === find) {
    return;
  }
  if (content.includes(trimmedFind)) {
    yield trimmedFind;
  }
  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join("\n");
    if (block.trim() === trimmedFind) {
      yield block;
    }
  }
};

const contextAwareReplacer: EditReplacer = function* (content, find) {
  const findLines = find.split("\n");
  if (findLines.length < 3) {
    return;
  }
  if (findLines[findLines.length - 1] === "") {
    findLines.pop();
  }
  const contentLines = content.split("\n");
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();
  for (let startLine = 0; startLine < contentLines.length; startLine += 1) {
    if (contentLines[startLine].trim() !== firstLine) {
      continue;
    }
    for (let endLine = startLine + 2; endLine < contentLines.length; endLine += 1) {
      if (contentLines[endLine].trim() !== lastLine) {
        continue;
      }
      const blockLines = contentLines.slice(startLine, endLine + 1);
      if (blockLines.length !== findLines.length) {
        break;
      }
      let matchingLines = 0;
      let totalNonEmptyLines = 0;
      for (let index = 1; index < blockLines.length - 1; index += 1) {
        const blockLine = blockLines[index].trim();
        const findLine = findLines[index].trim();
        if (blockLine.length > 0 || findLine.length > 0) {
          totalNonEmptyLines += 1;
          if (blockLine === findLine) {
            matchingLines += 1;
          }
        }
      }
      if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
        yield blockLines.join("\n");
      }
      break;
    }
  }
};

const OPENCODE_STYLE_EDIT_REPLACERS: readonly EditReplacer[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  blockAnchorReplacer,
  whitespaceNormalizedReplacer,
  indentationFlexibleReplacer,
  escapeNormalizedReplacer,
  trimmedBoundaryReplacer,
  contextAwareReplacer,
];

function isDisproportionateMatch(search: string, oldText: string) {
  const oldLines = oldText.split("\n").length;
  const searchLines = search.split("\n").length;
  if (searchLines >= Math.max(oldLines + 3, oldLines * 2)) {
    return true;
  }
  if (oldLines === 1) {
    return false;
  }
  return search.trim().length > Math.max(oldText.trim().length + 500, oldText.trim().length * 4);
}

function findUniqueTolerantOldText(content: string, oldText: string): EditMatchCandidate | null {
  const normalizedContent = normalizeToLF(content);
  const normalizedOldText = normalizeToLF(oldText);
  if (normalizedOldText.length === 0) {
    return null;
  }
  for (const replacer of OPENCODE_STYLE_EDIT_REPLACERS) {
    const seen = new Set<string>();
    for (const search of replacer(normalizedContent, normalizedOldText)) {
      if (!search || seen.has(search)) {
        continue;
      }
      seen.add(search);
      const start = normalizedContent.indexOf(search);
      if (start === -1 || start !== normalizedContent.lastIndexOf(search)) {
        continue;
      }
      if (isDisproportionateMatch(search, normalizedOldText)) {
        continue;
      }
      return {
        oldText: search,
        start,
        end: start + search.length,
      };
    }
  }
  return null;
}

function cloneParamsWithTolerantOldText(
  params: unknown,
  oldTexts: readonly string[],
): Record<string, unknown> | null {
  if (
    !params ||
    typeof params !== "object" ||
    !Array.isArray((params as { edits?: unknown }).edits)
  ) {
    return null;
  }
  return {
    ...(params as Record<string, unknown>),
    edits: (params as { edits: unknown[] }).edits.map((entry, index) =>
      entry && typeof entry === "object"
        ? {
            ...(entry as Record<string, unknown>),
            oldText: oldTexts[index] ?? (entry as { oldText?: unknown }).oldText,
          }
        : entry,
    ),
  };
}

function buildTolerantRetryParams(
  params: unknown,
  currentContent: string,
): Record<string, unknown> | null {
  const edits = asExactReplacements(readEditToolParams(params).edits);
  if (edits.length === 0) {
    return null;
  }
  const candidates: EditMatchCandidate[] = [];
  for (const edit of edits) {
    const candidate = findUniqueTolerantOldText(currentContent, edit.oldText);
    if (!candidate) {
      return null;
    }
    candidates.push(candidate);
  }
  const sorted = [...candidates].toSorted((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].end > sorted[index].start) {
      return null;
    }
  }
  return cloneParamsWithTolerantOldText(
    params,
    candidates.map((candidate) => candidate.oldText),
  );
}

function trimTrailingEmptyLine(lines: string[]): string[] {
  return lines.length > 1 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

function findFirstChangedLine(originalContent: string, currentContent: string): number | undefined {
  const originalLines = trimTrailingEmptyLine(normalizeToLF(originalContent).split("\n"));
  const currentLines = trimTrailingEmptyLine(normalizeToLF(currentContent).split("\n"));
  const max = Math.max(originalLines.length, currentLines.length);
  for (let index = 0; index < max; index += 1) {
    if (originalLines[index] !== currentLines[index]) {
      return index + 1;
    }
  }
  return undefined;
}

function buildRecoveredDiff(params: {
  originalContent?: string;
  currentContent: string;
  pathParam: string;
}): { diff: string; firstChangedLine?: number } {
  if (typeof params.originalContent !== "string") {
    return { diff: "", firstChangedLine: undefined };
  }
  const firstChangedLine = findFirstChangedLine(params.originalContent, params.currentContent);
  if (firstChangedLine === undefined) {
    return { diff: "", firstChangedLine: undefined };
  }
  const originalLines = trimTrailingEmptyLine(normalizeToLF(params.originalContent).split("\n"));
  const currentLines = trimTrailingEmptyLine(normalizeToLF(params.currentContent).split("\n"));
  const start = Math.max(1, firstChangedLine - RECOVERY_DIFF_CONTEXT_LINES);
  const end = Math.min(
    Math.max(originalLines.length, currentLines.length),
    firstChangedLine + RECOVERY_DIFF_CONTEXT_LINES,
  );
  const lines = [`--- ${params.pathParam}`, `+++ ${params.pathParam}`, `@@ ${start},${end} @@`];
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    const originalLine = originalLines[lineNumber - 1];
    const currentLine = currentLines[lineNumber - 1];
    if (originalLine === currentLine) {
      if (originalLine !== undefined) {
        lines.push(` ${lineNumber}: ${originalLine}`);
      }
      continue;
    }
    if (originalLine !== undefined) {
      lines.push(`-${lineNumber}: ${originalLine}`);
    }
    if (currentLine !== undefined) {
      lines.push(`+${lineNumber}: ${currentLine}`);
    }
  }
  const diff = lines.join("\n");
  return {
    diff:
      diff.length > RECOVERY_DIFF_MAX_CHARS
        ? `${diff.slice(0, RECOVERY_DIFF_MAX_CHARS)}\n... (diff truncated)`
        : diff,
    firstChangedLine,
  };
}

function computeLineChangeStats(originalContent: string, currentContent: string) {
  const originalLines = trimTrailingEmptyLine(normalizeToLF(originalContent).split("\n"));
  const currentLines = trimTrailingEmptyLine(normalizeToLF(currentContent).split("\n"));
  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < currentLines.length &&
    originalLines[prefix] === currentLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < originalLines.length - prefix &&
    suffix < currentLines.length - prefix &&
    originalLines[originalLines.length - 1 - suffix] ===
      currentLines[currentLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    additions: Math.max(0, currentLines.length - prefix - suffix),
    deletions: Math.max(0, originalLines.length - prefix - suffix),
  };
}

function computeReplacementLineChangeStats(edits: readonly EditReplacement[]) {
  return edits.reduce(
    (stats, edit) => {
      const replacementStats = computeLineChangeStats(edit.oldText, edit.newText);
      return {
        additions: stats.additions + replacementStats.additions,
        deletions: stats.deletions + replacementStats.deletions,
      };
    },
    { additions: 0, deletions: 0 },
  );
}

function lineNumberForOffset(content: string, offset: number): number {
  if (offset <= 0) {
    return 1;
  }
  return content.slice(0, offset).split(/\r\n|\n|\r/).length;
}

function findExactTextLineRanges(
  content: string,
  needle: string,
  maxRanges = 8,
): Array<{ startLine: number; endLine: number }> {
  if (needle.length === 0) {
    return [];
  }
  const ranges: Array<{ startLine: number; endLine: number }> = [];
  let cursor = 0;
  while (ranges.length < maxRanges) {
    const offset = content.indexOf(needle, cursor);
    if (offset === -1) {
      break;
    }
    ranges.push({
      startLine: lineNumberForOffset(content, offset),
      endLine: lineNumberForOffset(content, offset + Math.max(needle.length - 1, 0)),
    });
    cursor = offset + Math.max(needle.length, 1);
  }
  return ranges;
}

function formatEditCandidateRanges(params: {
  pathParam: string;
  currentContent: string;
  edits: readonly EditReplacement[];
}): string[] {
  return params.edits.flatMap((edit, index) => {
    if (!edit.oldText) {
      return [];
    }
    const ranges = findExactTextLineRanges(params.currentContent, edit.oldText);
    if (ranges.length === 0) {
      const firstLine = Math.max(1, lineNumberForOffset(params.currentContent, 0));
      return [
        `Replacement ${index + 1} oldString currently has no exact matches. Ready repair call: read({"path":"${params.pathParam}","offset":${firstLine},"limit":120})`,
      ];
    }
    const rangeText = ranges.map((range) => `${range.startLine}-${range.endLine}`).join(", ");
    const first = ranges[0];
    return [
      `Replacement ${index + 1} candidate line range(s): ${rangeText}. Ready operation: edit({operations:[{type:"replace_lines", filePath:"${params.pathParam}", startLine:${first.startLine}, endLine:${first.endLine}, text:"..."}]})`,
    ];
  });
}

function applyExactReplacements(params: {
  pathParam: string;
  currentContent: string;
  edits: readonly EditReplacement[];
  replaceAll?: boolean;
}): string {
  let nextContent = params.currentContent;
  for (const [index, edit] of params.edits.entries()) {
    const count = nextContent.split(edit.oldText).length - 1;
    if (count === 0) {
      throw new Error(
        [
          `Could not find the exact text in ${params.pathParam}.`,
          ...formatEditCandidateRanges({
            pathParam: params.pathParam,
            currentContent: nextContent,
            edits: [edit],
          }),
        ].join("\n"),
      );
    }
    if (!params.replaceAll && count > 1) {
      const ranges = findExactTextLineRanges(nextContent, edit.oldText, 20);
      throw new Error(
        [
          `Replacement ${index + 1} oldString is not unique in ${params.pathParam}; it matches ${count} occurrence(s).`,
          `Candidate line range(s): ${ranges.map((range) => `${range.startLine}-${range.endLine}`).join(", ")}`,
          `Use edit({filePath, oldString, newString}) with more surrounding context, edit({operations:[{type:"replace_lines", filePath:"${params.pathParam}", startLine:${ranges[0]?.startLine ?? 1}, endLine:${ranges[0]?.endLine ?? 1}, text:"..."}]}) for the intended occurrence, or set replaceAll:true only if every occurrence should change.`,
        ].join("\n"),
      );
    }
    nextContent = params.replaceAll
      ? nextContent.split(edit.oldText).join(edit.newText)
      : nextContent.replace(edit.oldText, edit.newText);
  }
  return nextContent;
}

type EditSyntaxDiagnostic = {
  line: number;
  column: number;
  message: string;
};

function scriptKindForPath(pathParam: string): TypeScript.ScriptKind {
  const ts = loadTypeScript();
  if (pathParam.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (pathParam.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (pathParam.endsWith(".mts")) {
    return ts.ScriptKind.TS;
  }
  if (pathParam.endsWith(".cts")) {
    return ts.ScriptKind.TS;
  }
  if (pathParam.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  if (pathParam.endsWith(".js")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.Unknown;
}

function collectTypeScriptSyntaxDiagnostics(params: {
  pathParam: string;
  currentContent: string;
}): EditSyntaxDiagnostic[] {
  const ts = loadTypeScript();
  const scriptKind = scriptKindForPath(params.pathParam);
  if (scriptKind === ts.ScriptKind.Unknown) {
    return [];
  }
  const sourceFile = ts.createSourceFile(
    params.pathParam,
    params.currentContent,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const parseDiagnostics =
    (
      sourceFile as TypeScript.SourceFile & {
        parseDiagnostics?: readonly TypeScript.Diagnostic[];
      }
    ).parseDiagnostics ?? [];
  return parseDiagnostics.slice(0, 8).map((diagnostic: TypeScript.Diagnostic) => {
    const position = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return {
      line: position.line + 1,
      column: position.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    };
  });
}

function buildModelVisibleEditFeedback(params: {
  pathParam: string;
  originalContent?: string;
  currentContent: string;
  edits?: readonly EditReplacement[];
  lspDiagnostics?: readonly OpenClawLspDiagnostic[];
  lspDiagnosticsText?: string;
}): {
  text: string;
  details: Record<string, unknown>;
} {
  if (typeof params.originalContent !== "string") {
    return {
      text: "Edit applied. No pre-edit snapshot was available for diff feedback.",
      details: {},
    };
  }
  const diff = buildRecoveredDiff(params);
  const fileStats = computeLineChangeStats(params.originalContent, params.currentContent);
  const replacementStats =
    params.edits && params.edits.length > 0
      ? computeReplacementLineChangeStats(params.edits)
      : undefined;
  const stats = replacementStats ?? fileStats;
  const broadStatsDisagree =
    replacementStats &&
    (Math.abs(fileStats.additions - replacementStats.additions) > 20 ||
      Math.abs(fileStats.deletions - replacementStats.deletions) > 20);
  const syntaxDiagnostics = collectTypeScriptSyntaxDiagnostics(params);
  const diffText =
    diff.diff.length > EDIT_FEEDBACK_DIFF_MAX_CHARS
      ? `${diff.diff.slice(0, EDIT_FEEDBACK_DIFF_MAX_CHARS)}\n... (diff truncated)`
      : diff.diff;
  const lines = [
    "Edit applied successfully.",
    "",
    "Diff:",
    `+${stats.additions} -${stats.deletions}${
      diff.firstChangedLine ? `, first changed line ${diff.firstChangedLine}` : ""
    }`,
  ];
  if (diffText) {
    lines.push("```diff", diffText, "```");
  }
  if (syntaxDiagnostics.length > 0) {
    lines.push(
      "Syntax diagnostics:",
      ...syntaxDiagnostics.map(
        (diagnostic) =>
          `- ${params.pathParam}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
      ),
    );
  }
  if (params.lspDiagnosticsText) {
    lines.push(params.lspDiagnosticsText);
  }
  return {
    text: lines.join("\n"),
    details: {
      diff: diff.diff,
      firstChangedLine: diff.firstChangedLine,
      additions: stats.additions,
      deletions: stats.deletions,
      ...(replacementStats
        ? {
            statsSource: "replacement_local",
            wholeFileAdditions: fileStats.additions,
            wholeFileDeletions: fileStats.deletions,
            wholeFileStatsSuppressed: Boolean(broadStatsDisagree),
          }
        : { statsSource: "whole_file" }),
      syntaxDiagnostics,
      ...(params.lspDiagnostics ? { lspDiagnostics: params.lspDiagnostics } : {}),
    },
  };
}

function formatLspDiagnosticTargets(
  pathParam: string,
  diagnostics: readonly OpenClawLspDiagnostic[],
): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR");
  if (errors.length === 0) {
    return "LSP diagnostics:\nnone";
  }
  const limited = errors.slice(0, 8);
  const more = errors.length - limited.length;
  return [
    "LSP diagnostics, next repair targets:",
    ...limited.map((diagnostic) => {
      const message =
        diagnostic.message.length > 240
          ? `${diagnostic.message.slice(0, 240)}...`
          : diagnostic.message;
      return `- ${pathParam}:${diagnostic.line}:${diagnostic.character} ${diagnostic.severity} ${message}`;
    }),
    more > 0 ? `- ... and ${more} more` : undefined,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

async function collectPostMutationLspFeedback(params: {
  lspService?: OpenClawLspService;
  absolutePath?: string;
  pathParam: string;
}): Promise<{
  lspDiagnostics?: OpenClawLspDiagnostic[];
  lspDiagnosticsText?: string;
}> {
  if (!params.lspService || !params.absolutePath) {
    return {};
  }
  try {
    await params.lspService.touchFile(params.absolutePath, "document");
    const diagnostics = await params.lspService.diagnosticsForFile(params.absolutePath);
    return {
      lspDiagnostics: diagnostics,
      lspDiagnosticsText: formatLspDiagnosticTargets(params.pathParam, diagnostics),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      lspDiagnostics: [],
      lspDiagnosticsText: `LSP diagnostics:\nunavailable: ${message}`,
    };
  }
}

async function appendModelVisibleEditFeedback(params: {
  result: AgentToolResult<unknown>;
  pathParam: string;
  absolutePath?: string;
  originalContent?: string;
  currentContent: string;
  editCount: number;
  recoveredAfterTolerantMatch?: boolean;
  lspService?: OpenClawLspService;
  edits?: readonly EditReplacement[];
}): Promise<AgentToolResult<unknown>> {
  const lspFeedback = await collectPostMutationLspFeedback({
    lspService: params.lspService,
    absolutePath: params.absolutePath,
    pathParam: params.pathParam,
  });
  const feedback = buildModelVisibleEditFeedback({
    pathParam: params.pathParam,
    originalContent: params.originalContent,
    currentContent: params.currentContent,
    edits: params.edits,
    ...lspFeedback,
  });
  const existingTextBlocks = params.result.content.filter(
    (block): block is Extract<AgentToolResult<unknown>["content"][number], { type: "text" }> =>
      block.type === "text",
  );
  const text =
    existingTextBlocks.length > 0
      ? `${existingTextBlocks[0].text}\n\n${feedback.text}`
      : feedback.text;
  const content =
    existingTextBlocks.length > 0
      ? [
          { ...existingTextBlocks[0], text },
          ...params.result.content.filter((block) => block !== existingTextBlocks[0]),
        ]
      : [{ type: "text" as const, text }, ...params.result.content];
  return {
    ...params.result,
    isError: false,
    content,
    details: mergeRecordDetails(params.result.details, {
      ...feedback.details,
      changedFilePaths: [params.pathParam],
      modifiedFilePaths: [params.pathParam],
      editCount: params.editCount,
      ...(params.recoveredAfterTolerantMatch ? { recoveredAfterTolerantMatch: true } : {}),
    }),
  } as AgentToolResult<unknown>;
}

function isErrorLikeToolResult(result: AgentToolResult<unknown>): boolean {
  const details = result.details;
  return (
    (result as { isError?: unknown }).isError === true ||
    (Boolean(details) &&
      typeof details === "object" &&
      !Array.isArray(details) &&
      (details as { status?: unknown }).status === "error")
  );
}

function markToolResultError(result: AgentToolResult<unknown>): AgentToolResult<unknown> {
  return (result as { isError?: unknown }).isError === true
    ? result
    : ({ ...result, isError: true } as AgentToolResult<unknown>);
}

function removeExactOccurrences(content: string, needle: string): string {
  return needle.length > 0 ? content.split(needle).join("") : content;
}

function didEditLikelyApply(params: {
  originalContent?: string;
  currentContent: string;
  edits: EditReplacement[];
}) {
  if (params.edits.length === 0) {
    return false;
  }
  const normalizedCurrent = normalizeToLF(params.currentContent);
  const normalizedOriginal =
    typeof params.originalContent === "string" ? normalizeToLF(params.originalContent) : undefined;

  if (normalizedOriginal !== undefined && normalizedOriginal === normalizedCurrent) {
    return false;
  }

  let withoutInsertedNewText = normalizedCurrent;
  for (const edit of params.edits) {
    const normalizedNew = normalizeToLF(edit.newText);
    if (normalizedNew.length > 0 && !normalizedCurrent.includes(normalizedNew)) {
      return false;
    }
    withoutInsertedNewText =
      normalizedNew.length > 0
        ? removeExactOccurrences(withoutInsertedNewText, normalizedNew)
        : withoutInsertedNewText;
  }

  for (const edit of params.edits) {
    const normalizedOld = normalizeToLF(edit.oldText);
    if (withoutInsertedNewText.includes(normalizedOld)) {
      return false;
    }
  }

  return true;
}

function buildEditSuccessResult(params: {
  pathParam: string;
  absolutePath?: string;
  editCount: number;
  originalContent?: string;
  currentContent: string;
  recoveredAfterTolerantMatch?: boolean;
  lspService?: OpenClawLspService;
  edits?: readonly EditReplacement[];
}): Promise<AgentToolResult<unknown>> {
  const text =
    params.editCount > 1
      ? `Successfully replaced ${params.editCount} block(s) in ${params.pathParam}.`
      : `Successfully replaced text in ${params.pathParam}.`;
  return appendModelVisibleEditFeedback({
    result: {
      isError: false,
      content: [
        {
          type: "text",
          text,
        },
      ],
      details: {
        recoveredAfterPostWriteFailure: true,
      },
    } as AgentToolResult<unknown>,
    pathParam: params.pathParam,
    absolutePath: params.absolutePath,
    editCount: params.editCount,
    originalContent: params.originalContent,
    currentContent: params.currentContent,
    edits: params.edits,
    recoveredAfterTolerantMatch: params.recoveredAfterTolerantMatch,
    lspService: params.lspService,
  });
}

function shouldAddMismatchHint(error: unknown) {
  return error instanceof Error && error.message.includes(EDIT_MISMATCH_MESSAGE);
}

function appendMismatchHint(
  error: Error,
  pathParam: string | undefined,
  currentContent: string,
  edits: readonly EditReplacement[] = [],
): Error {
  const target = pathParam ? ` for ${pathParam}` : "";
  const byteCount = Buffer.byteLength(currentContent, "utf8");
  const multipleMatchHints = edits.flatMap((edit, index) => {
    if (!edit.oldText) {
      return [];
    }
    const count = currentContent.split(edit.oldText).length - 1;
    return count > 1
      ? [
          `Replacement ${index + 1} oldString currently matches ${count} occurrence(s); add more surrounding context to make it unique, or use replaceAll:true if every occurrence should change.`,
        ]
      : [];
  });
  const enhanced = new Error(
    [
      error.message,
      `The target file${target} appears to have changed or the provided oldString is stale.`,
      `Current file bytes: ${byteCount}.`,
      ...multipleMatchHints,
      ...formatEditCandidateRanges({
        pathParam: pathParam ?? "<unknown>",
        currentContent,
        edits,
      }),
      "Do not retry from memory or ask for a full file. Repair with one bounded local read around the target, or one exact grep plus a bounded read, then retry edit({filePath, oldString, newString}) using more surrounding context. Do not restart broad discovery.",
    ].join("\n"),
  );
  enhanced.stack = error.stack;
  return enhanced;
}

/**
 * Recover from two edit-tool failure classes without changing edit semantics:
 * - exact-match mismatch errors become actionable by including current file contents
 * - post-write throws are converted back to success only if the file actually changed
 */
export function wrapEditToolWithRecovery(
  base: AnyAgentTool,
  options: EditToolRecoveryOptions,
): AnyAgentTool {
  return {
    ...base,
    description: appendEditImplementationGuidance(base.description),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal: AbortSignal | undefined,
      onUpdate?: AgentToolUpdateCallback<unknown>,
    ) => {
      const normalizedParams = normalizeEditToolParams(params);
      const { pathParam, edits, replaceAll } = readEditToolParams(normalizedParams);
      if (replaceAll && edits.some((edit) => typeof edit.oldText !== "string")) {
        throw new Error(
          "replaceAll is only supported with oldString/newString exact replacements.",
        );
      }
      const materializedGroups =
        edits.length > 0
          ? await materializeEditGroups({
              root: options.root,
              pathParam,
              edits,
              readFile: options.readFile,
            })
          : [];

      if (materializedGroups.length > 1) {
        if (!options.writeFile) {
          throw new Error(
            "Atomic multi-file edit requires writeFile support in the active runtime.",
          );
        }
        const writtenGroups: MaterializedEditGroup[] = [];
        const results: AgentToolResult<unknown>[] = [];
        try {
          for (const group of materializedGroups) {
            assertSurgicalEditSafety({
              pathParam: group.pathParam,
              currentContent: group.originalContent,
              edits: group.edits,
            });
            const nextContent = applyExactReplacements({
              pathParam: group.pathParam,
              currentContent: group.originalContent,
              edits: group.edits,
              replaceAll,
            });
            if (nextContent === group.originalContent) {
              throw new Error(
                `No-op edit rejected for ${group.pathParam}; selected source already equals newText. Ready repair call: read({"path":"${group.pathParam}","offset":1,"limit":120})`,
              );
            }
            await options.writeFile(group.absolutePath, nextContent);
            writtenGroups.push(group);
            results.push(
              await buildEditSuccessResult({
                pathParam: group.pathParam,
                absolutePath: group.absolutePath,
                editCount: group.edits.length,
                originalContent: group.originalContent,
                currentContent: nextContent,
                edits: group.edits,
                lspService: options.lspService,
              }),
            );
          }
          return mergeBatchEditResults({ results, groups: materializedGroups });
        } catch (error) {
          for (const group of writtenGroups.toReversed()) {
            try {
              await options.writeFile(group.absolutePath, group.originalContent);
            } catch {
              // Preserve the original edit failure; rollback is best-effort.
            }
          }
          throw error;
        }
      }

      const group = materializedGroups[0];
      const effectivePathParam = group?.pathParam ?? pathParam;
      const absolutePath =
        group?.absolutePath ??
        (effectivePathParam ? resolveEditPath(options.root, effectivePathParam) : undefined);
      let originalContent: string | undefined;
      let effectiveParams = normalizedParams;
      let effectiveEdits: EditReplacement[] = group?.edits ?? asExactReplacements(edits);

      if (group) {
        originalContent = group.originalContent;
        effectiveParams = cloneParamsWithMaterializedEdits({
          rawParams: normalizedParams,
          pathParam: group.pathParam,
          edits: group.edits,
        });
      } else if (absolutePath && edits.length > 0) {
        try {
          originalContent = await options.readFile(absolutePath);
        } catch {
          // Best-effort snapshot only; recovery should still proceed without it.
        }
      }

      if (
        replaceAll &&
        typeof originalContent === "string" &&
        typeof effectivePathParam === "string"
      ) {
        if (effectiveEdits.length !== 1) {
          throw new Error("replaceAll requires exactly one oldString/newString replacement.");
        }
        const [edit] = effectiveEdits;
        if (!originalContent.includes(edit.oldText)) {
          throw new Error(
            `Could not find the exact text in ${effectivePathParam}. The oldString must match at least one occurrence before replaceAll can run.`,
          );
        }
        effectiveParams = buildReplaceAllEditParams({
          rawParams: normalizedParams,
          pathParam: effectivePathParam,
          currentContent: originalContent,
          edit,
        });
        effectiveEdits = asExactReplacements(readEditToolParams(effectiveParams).edits);
      }

      try {
        if (typeof originalContent === "string" && effectiveEdits.length > 0 && !replaceAll) {
          assertSurgicalEditSafety({
            pathParam: effectivePathParam ?? absolutePath ?? "<unknown>",
            currentContent: originalContent,
            edits: effectiveEdits,
          });
        }
        const result = await base.execute(toolCallId, effectiveParams, signal, onUpdate);
        if (isErrorLikeToolResult(result)) {
          return markToolResultError(result);
        }
        if (absolutePath && effectiveEdits.length > 0 && typeof originalContent === "string") {
          try {
            const currentContent = await options.readFile(absolutePath);
            return appendModelVisibleEditFeedback({
              result,
              pathParam: effectivePathParam ?? absolutePath,
              absolutePath,
              originalContent,
              currentContent,
              editCount: effectiveEdits.length,
              edits: effectiveEdits,
              lspService: options.lspService,
            });
          } catch {
            // If readback fails after a successful edit, preserve base success.
          }
        }
        return result;
      } catch (err) {
        if (!absolutePath) {
          throw err;
        }

        let currentContent: string | undefined;
        try {
          currentContent = await options.readFile(absolutePath);
        } catch {
          // Fall through to the original error if readback fails.
        }

        if (typeof currentContent === "string" && effectiveEdits.length > 0) {
          if (
            didEditLikelyApply({
              originalContent,
              currentContent,
              edits: effectiveEdits,
            })
          ) {
            return await buildEditSuccessResult({
              pathParam: effectivePathParam ?? absolutePath,
              absolutePath,
              editCount: effectiveEdits.length,
              originalContent,
              currentContent,
              lspService: options.lspService,
              edits: effectiveEdits,
            });
          }
        }

        if (
          typeof currentContent === "string" &&
          err instanceof Error &&
          shouldAddMismatchHint(err)
        ) {
          const retryParams = buildTolerantRetryParams(effectiveParams, currentContent);
          if (retryParams) {
            const retryEdits = asExactReplacements(readEditToolParams(retryParams).edits);
            try {
              const retryResult = await base.execute(toolCallId, retryParams, signal, onUpdate);
              if (isErrorLikeToolResult(retryResult)) {
                return markToolResultError(retryResult);
              }
              try {
                const postRetryContent = await options.readFile(absolutePath);
                return appendModelVisibleEditFeedback({
                  result: retryResult,
                  pathParam: effectivePathParam ?? absolutePath,
                  absolutePath,
                  originalContent,
                  currentContent: postRetryContent,
                  editCount: retryEdits.length,
                  edits: retryEdits,
                  recoveredAfterTolerantMatch: true,
                  lspService: options.lspService,
                });
              } catch {
                return {
                  ...retryResult,
                  details: mergeRecordDetails(retryResult.details, {
                    recoveredAfterTolerantMatch: true,
                  }),
                } as AgentToolResult<unknown>;
              }
            } catch {
              try {
                const postRetryContent = await options.readFile(absolutePath);
                if (
                  didEditLikelyApply({
                    originalContent,
                    currentContent: postRetryContent,
                    edits: retryEdits,
                  })
                ) {
                  return await buildEditSuccessResult({
                    pathParam: effectivePathParam ?? absolutePath,
                    absolutePath,
                    editCount: retryEdits.length,
                    edits: retryEdits,
                    originalContent,
                    currentContent: postRetryContent,
                    recoveredAfterTolerantMatch: true,
                    lspService: options.lspService,
                  });
                }
              } catch {
                // Fall through to the actionable mismatch guidance below.
              }
            }
          }
          throw appendMismatchHint(err, effectivePathParam, currentContent, effectiveEdits);
        }

        throw err;
      }
    },
  };
}

async function pathExistedBeforeWrite(
  absolutePath: string | undefined,
  access: ((absolutePath: string) => Promise<void>) | undefined,
): Promise<boolean> {
  if (!absolutePath || !access) {
    return false;
  }
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function readWriteToolParams(params: unknown): { pathParam?: string; content?: string } {
  const record = getToolParamsRecord(params);
  return {
    pathParam: readStringParam(record, "path"),
    content: readStringParam(record, "content"),
  };
}

function mergeRecordDetails(base: unknown, additions: unknown) {
  return {
    ...(base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {}),
    ...(additions && typeof additions === "object" && !Array.isArray(additions)
      ? (additions as Record<string, unknown>)
      : {}),
  };
}

export function wrapWriteToolWithMetadata(
  base: AnyAgentTool,
  options: WriteToolMetadataOptions,
): AnyAgentTool {
  return {
    ...base,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const { pathParam, content } = readWriteToolParams(params);
      const absolutePath =
        typeof pathParam === "string" ? resolveEditPath(options.root, pathParam) : undefined;
      const existedBefore = await pathExistedBeforeWrite(absolutePath, options.access);
      const result = await base.execute(toolCallId, params, signal, onUpdate);
      if (!pathParam || typeof content !== "string") {
        return result;
      }
      const additions = {
        changedFilePaths: [pathParam],
        addedFilePaths: existedBefore ? [] : [pathParam],
        modifiedFilePaths: existedBefore ? [pathParam] : [],
        bytesWritten: Buffer.byteLength(content, "utf8"),
        fullFileReplacement: true,
      };
      const lspFeedback = await collectPostMutationLspFeedback({
        lspService: options.lspService,
        absolutePath,
        pathParam,
      });
      const existingText =
        Array.isArray(result.content) &&
        result.content.find(
          (
            block,
          ): block is Extract<AgentToolResult<unknown>["content"][number], { type: "text" }> =>
            block.type === "text",
        );
      const contentBlocks =
        lspFeedback.lspDiagnosticsText && existingText
          ? result.content.map((block) =>
              block === existingText
                ? {
                    ...block,
                    text: `${block.text.trimEnd()}\n\n${lspFeedback.lspDiagnosticsText}`,
                  }
                : block,
            )
          : lspFeedback.lspDiagnosticsText
            ? [
                ...(result.content ?? []),
                { type: "text" as const, text: lspFeedback.lspDiagnosticsText },
              ]
            : result.content;
      return {
        ...result,
        content: contentBlocks,
        details: mergeRecordDetails(result.details, {
          ...additions,
          ...(lspFeedback.lspDiagnostics ? { lspDiagnostics: lspFeedback.lspDiagnostics } : {}),
        }),
      } as AgentToolResult<unknown>;
    },
  };
}
