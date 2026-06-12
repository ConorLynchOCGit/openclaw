import path from "node:path";
import { Type } from "@sinclair/typebox";
import {
  type OpenClawLspHover,
  type OpenClawLspService,
  formatOpenClawLspLocationsText,
} from "../openclaw-lsp-service.js";
import {
  type AnyAgentTool,
  ToolInputError,
  readNumberParam,
  readStringParam,
  textResult,
} from "./common.js";

const LSP_OPERATIONS = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
] as const;

type LspOperation = (typeof LSP_OPERATIONS)[number];

const LspToolSchema = Type.Object({
  operation: Type.Union(
    LSP_OPERATIONS.map((operation) =>
      Type.Literal(operation, { description: "The LSP operation to perform." }),
    ),
  ),
  filePath: Type.String({
    description:
      "Absolute path or workspace-relative path to the file. workspaceSymbol uses this only to select the LSP runtime.",
  }),
  line: Type.Optional(
    Type.Number({ description: "One-based line number, as shown by read and editors." }),
  ),
  character: Type.Optional(
    Type.Number({ description: "One-based character offset, as shown by editors." }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Search query for workspaceSymbol, or a file-local symbol query for documentSymbol. Empty string requests the compact default outline.",
    }),
  ),
});

export type OpenClawLspToolOptions = {
  workspaceRoot: string;
  lspService: OpenClawLspService;
};

function isLspOperation(value: string): value is LspOperation {
  return (LSP_OPERATIONS as readonly string[]).includes(value);
}

function formatHoverText(results: readonly OpenClawLspHover[]): string {
  if (results.length === 0) {
    return "No LSP results found for hover.";
  }
  return results
    .map((result) => `${result.path}:${result.line}:${result.character}\n${result.text}`)
    .join("\n\n");
}

function requirePosition(params: { operation: string; line?: number; character?: number }): {
  line: number;
  character: number;
} {
  const line = params.line;
  const character = params.character;
  if (!line || !character) {
    throw new ToolInputError(
      `${params.operation} requires one-based line and character. Use documentSymbol or workspaceSymbol first when you only know a symbol name.`,
    );
  }
  return { line, character };
}

function displayPath(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath).split(path.sep).join("/");
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : filePath;
}

const DOCUMENT_SYMBOL_DEFAULT_LIMIT = 30;
const DOCUMENT_SYMBOL_QUERY_LIMIT = 12;
const WORKSPACE_SYMBOL_LIMIT = 20;
const READ_WINDOW_MIN_LINES = 40;
const READ_WINDOW_MAX_LINES = 220;

type SymbolTextOptions = {
  operation: "documentSymbol" | "workspaceSymbol";
  filePath?: string;
  query?: string;
  defaultOutline?: boolean;
  maxSymbols: number;
};

type SymbolTextResult = {
  text: string;
  shownSymbols: ReturnType<typeof selectSymbolsForModel>;
  resultCount: number;
  shownCount: number;
  omittedCount: number;
  exactMatchCount: number;
};

function normalizeQuery(query: string | undefined): string {
  return query?.trim().toLowerCase() ?? "";
}

function symbolNameMatchScore(symbol: { name: string }, query: string): number {
  const name = symbol.name.toLowerCase();
  if (name === query) {
    return 0;
  }
  if (name.startsWith(query)) {
    return 1;
  }
  if (name.includes(query)) {
    return 2;
  }
  return Number.POSITIVE_INFINITY;
}

function selectSymbolsForModel(
  symbols: readonly {
    name: string;
    kind: string;
    path: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    containerName?: string;
    depth?: number;
  }[],
  options: { query?: string; defaultOutline?: boolean; maxSymbols: number },
) {
  const query = normalizeQuery(options.query);
  const sorted = [...symbols].toSorted((a, b) => {
    const pathOrder = a.path.localeCompare(b.path);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    return (
      a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character
    );
  });
  if (!query && options.defaultOutline) {
    const topLevel = sorted.filter((symbol) => !symbol.containerName || symbol.depth === 0);
    return (topLevel.length > 0 ? topLevel : sorted).slice(0, options.maxSymbols);
  }
  if (!query) {
    return sorted.slice(0, options.maxSymbols);
  }

  const selected = new Map<string, (typeof sorted)[number]>();
  const keyFor = (symbol: (typeof sorted)[number]) =>
    `${symbol.path}:${symbol.range.start.line}:${symbol.range.start.character}:${symbol.name}`;
  const add = (symbol: (typeof sorted)[number]) => selected.set(keyFor(symbol), symbol);
  const findContainer = (match: (typeof sorted)[number]) =>
    match.containerName
      ? sorted.find(
          (symbol) =>
            symbol.path === match.path &&
            symbol.name === match.containerName &&
            symbol.range.start.line <= match.range.start.line &&
            symbol.range.end.line >= match.range.end.line,
        )
      : undefined;

  const directMatches = sorted
    .map((symbol) => ({ symbol, score: symbolNameMatchScore(symbol, query) }))
    .filter((entry) => Number.isFinite(entry.score))
    .toSorted(
      (a, b) =>
        a.score - b.score ||
        a.symbol.path.localeCompare(b.symbol.path) ||
        a.symbol.range.start.line - b.symbol.range.start.line,
    )
    .map((entry) => entry.symbol);

  for (const match of directMatches) {
    add(match);
    if (match.containerName) {
      const container = findContainer(match);
      if (container) {
        add(container);
      }
    }
  }

  const directContainerNames = new Set(
    directMatches
      .filter((symbol) => !symbol.containerName || symbol.depth === 0)
      .map((symbol) => `${symbol.path}:${symbol.name}`),
  );
  const childSampleLimit = Math.min(4, Math.max(0, options.maxSymbols - selected.size));
  for (const child of sorted) {
    if (selected.size >= options.maxSymbols || childSampleLimit <= 0) {
      break;
    }
    if (
      child.containerName &&
      directContainerNames.has(`${child.path}:${child.containerName}`) &&
      (child.depth ?? 1) <= 1 &&
      !selected.has(keyFor(child))
    ) {
      add(child);
      if (
        [...selected.values()].filter(
          (symbol) => symbol.containerName === child.containerName && symbol.path === child.path,
        ).length >= childSampleLimit
      ) {
        break;
      }
    }
  }

  if (selected.size === 0) {
    for (const child of sorted.filter((symbol) =>
      symbol.containerName?.toLowerCase().includes(query),
    )) {
      const container = findContainer(child);
      if (container) {
        add(container);
      }
      add(child);
      if (selected.size >= Math.min(options.maxSymbols, 6)) {
        break;
      }
    }
  }
  return [...selected.values()].slice(0, options.maxSymbols);
}

function readLimitForSymbol(symbol: {
  range: { start: { line: number }; end: { line: number } };
}): number {
  const span = Math.max(1, symbol.range.end.line - symbol.range.start.line + 1);
  return Math.min(READ_WINDOW_MAX_LINES, Math.max(READ_WINDOW_MIN_LINES, span + 20));
}

function formatReadNextAction(symbol: {
  path: string;
  range: { start: { line: number }; end: { line: number } };
}): string {
  return `read({"path":"${symbol.path}","offset":${symbol.range.start.line},"limit":${readLimitForSymbol(symbol)}})`;
}

function exactSymbolMatchCount(
  symbols: readonly { name: string }[],
  query: string | undefined,
): number {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return 0;
  }
  return symbols.filter((symbol) => symbol.name.toLowerCase() === normalized).length;
}

function formatSymbolForModel(symbol: {
  name: string;
  kind: string;
  path: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  containerName?: string;
  depth?: number;
}): string {
  return [
    symbol.path,
    `symbol: ${symbol.name}`,
    `kind: ${symbol.kind}`,
    `range: ${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character}`,
    symbol.containerName ? `container: ${symbol.containerName}` : undefined,
    `read: ${formatReadNextAction(symbol)}`,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

function formatSymbolsForModel(
  symbols: readonly {
    name: string;
    kind: string;
    path: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    containerName?: string;
    depth?: number;
  }[],
  options: SymbolTextOptions,
): SymbolTextResult {
  const selected = selectSymbolsForModel(symbols, {
    query: options.query,
    defaultOutline: options.defaultOutline,
    maxSymbols: options.maxSymbols,
  });
  const omittedCount = Math.max(0, symbols.length - selected.length);
  const exactMatchCount = exactSymbolMatchCount(symbols, options.query);
  const query = options.query?.trim();
  const target = options.filePath ? ` for ${options.filePath}` : "";
  const header = query
    ? [
        `LSP ${options.operation}${target} query="${query}"`,
        exactMatchCount > 0
          ? `exact matches: ${exactMatchCount}`
          : `no exact symbol match; showing closest locator results`,
        `shown: ${selected.length} of ${symbols.length}`,
      ]
    : [
        `LSP ${options.operation}${target}${
          options.operation === "documentSymbol" ? " outline" : ""
        }`,
        `shown: ${selected.length} of ${symbols.length}`,
      ];
  if (symbols.length === 0) {
    return {
      text: `${header.join("\n")}\nNo LSP symbols found.`,
      shownSymbols: [],
      resultCount: 0,
      shownCount: 0,
      omittedCount: 0,
      exactMatchCount: 0,
    };
  }
  const lines = selected.map(formatSymbolForModel);
  if (omittedCount > 0) {
    const nextAction =
      options.operation === "documentSymbol"
        ? "Too many symbols. Rerun lsp documentSymbol with a specific query from the task names, types, functions, or tests; or read one exact range above."
        : "Too many symbols. Rerun lsp workspaceSymbol with a narrower query; or read one exact range above.";
    lines.push(`omitted: ${omittedCount}\n${nextAction}`);
  }
  return {
    text: [...header, "", ...lines].join("\n"),
    shownSymbols: selected,
    resultCount: symbols.length,
    shownCount: selected.length,
    omittedCount,
    exactMatchCount,
  };
}

export function createLspTool(options: OpenClawLspToolOptions): AnyAgentTool {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  return {
    name: "lsp",
    label: "lsp",
    displaySummary: "Navigate code symbols and diagnostics.",
    description: [
      "Use Language Server Protocol style code intelligence for symbol navigation. Supported operations: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy.",
      "Default large-TypeScript-file structure tool: use documentSymbol or workspaceSymbol before sequential reads unless you already know the exact line window.",
      "For documentSymbol on large files, use query when you know a target symbol; default documentSymbol returns a compact top-level/export outline.",
      "Use file-scoped grep only when LSP is unavailable or when searching exact text rather than navigating symbols.",
      "Results are source coordinates: symbol name, kind, path, start/end line and column, and container name when available. Use read with the returned line range to inspect exact source.",
    ].join(" "),
    parameters: LspToolSchema,
    execute: async (_toolCallId, rawParams) => {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const operation = readStringParam(params, "operation", { required: true });
      if (!isLspOperation(operation)) {
        throw new ToolInputError(`Unsupported LSP operation: ${operation}`);
      }
      const filePath = readStringParam(params, "filePath", { required: true });
      const line = readNumberParam(params, "line", { integer: true, strict: true });
      const character = readNumberParam(params, "character", { integer: true, strict: true });
      const query = readStringParam(params, "query", { allowEmpty: true });
      const absoluteFilePath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : path.resolve(workspaceRoot, filePath);

      const available = await options.lspService.hasClients(absoluteFilePath);
      if (!available) {
        throw new ToolInputError(`No LSP server available for this file type: ${filePath}`);
      }

      if (operation === "documentSymbol") {
        await options.lspService.touchFile(absoluteFilePath);
        const result = await options.lspService.documentSymbol(absoluteFilePath);
        const shaped = formatSymbolsForModel(result, {
          operation,
          filePath: displayPath(workspaceRoot, absoluteFilePath),
          query,
          defaultOutline: !query?.trim(),
          maxSymbols: query?.trim() ? DOCUMENT_SYMBOL_QUERY_LIMIT : DOCUMENT_SYMBOL_DEFAULT_LIMIT,
        });
        return textResult(shaped.text, {
          status: "ok",
          operation,
          filePath: displayPath(workspaceRoot, absoluteFilePath),
          query: query ?? "",
          resultCount: shaped.resultCount,
          shownCount: shaped.shownCount,
          omittedCount: shaped.omittedCount,
          exactMatchCount: shaped.exactMatchCount,
          symbols: shaped.shownSymbols,
        });
      }

      if (operation === "workspaceSymbol") {
        await options.lspService.touchFile(absoluteFilePath);
        const result = await options.lspService.workspaceSymbol(query ?? "");
        const shaped = formatSymbolsForModel(result, {
          operation,
          query: query ?? "",
          maxSymbols: WORKSPACE_SYMBOL_LIMIT,
        });
        return textResult(shaped.text, {
          status: "ok",
          operation,
          query: query ?? "",
          resultCount: shaped.resultCount,
          shownCount: shaped.shownCount,
          omittedCount: shaped.omittedCount,
          exactMatchCount: shaped.exactMatchCount,
          symbols: shaped.shownSymbols,
        });
      }

      await options.lspService.touchFile(absoluteFilePath, "document");
      const position = requirePosition({ operation, line, character });
      if (operation === "hover") {
        const result = await options.lspService.hover({
          filePath: absoluteFilePath,
          ...position,
        });
        const text = formatHoverText(result);
        return textResult(text, {
          status: "ok",
          operation,
          filePath: displayPath(workspaceRoot, absoluteFilePath),
          result,
          text,
        });
      }

      const result =
        operation === "goToDefinition"
          ? await options.lspService.definition({ filePath: absoluteFilePath, ...position })
          : operation === "findReferences"
            ? await options.lspService.references({ filePath: absoluteFilePath, ...position })
            : operation === "goToImplementation"
              ? await options.lspService.implementation({
                  filePath: absoluteFilePath,
                  ...position,
                })
              : await options.lspService.prepareCallHierarchy({
                  filePath: absoluteFilePath,
                  ...position,
                });
      const text = formatOpenClawLspLocationsText(operation, result);
      return textResult(text, {
        status: "ok",
        operation,
        filePath: displayPath(workspaceRoot, absoluteFilePath),
        result,
        text,
      });
    },
  };
}
