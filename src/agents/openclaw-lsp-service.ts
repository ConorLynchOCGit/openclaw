import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as TypeScript from "typescript";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";

const require = createRequire(import.meta.url);
let cachedTypeScript: typeof TypeScript | null = null;

function loadTypeScript(): typeof TypeScript {
  cachedTypeScript ??= require("typescript") as typeof TypeScript;
  return cachedTypeScript;
}

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const TYPESCRIPT_SERVER_ID = "typescript-language-server";
const TYPESCRIPT_SERVER_NAME = "TypeScript language server";
const DEFAULT_MAX_SYMBOLS = 100;
const MAX_DIAGNOSTICS_PER_FILE = 20;
const MAX_DIAGNOSTIC_MESSAGE_CHARS = 320;
const INITIALIZE_TIMEOUT_MS = 45_000;
const DIAGNOSTICS_REQUEST_TIMEOUT_MS = 3_000;
const DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS = 5_000;
const DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS = 10_000;
const DIAGNOSTICS_DEBOUNCE_MS = 150;
const LSP_IDLE_SHUTDOWN_MS = 10 * 60_000;
const FILE_CHANGE_CREATED = 1;
const FILE_CHANGE_CHANGED = 2;
const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2;

const ROOT_MARKERS = [
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package.json",
];

const EXCLUDED_DIRS = new Set([
  ".artifacts",
  ".git",
  ".next",
  ".openclaw",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export type OpenClawLspPosition = {
  line: number;
  character: number;
};

export type OpenClawLspRange = {
  start: OpenClawLspPosition;
  end: OpenClawLspPosition;
};

export type OpenClawLspSymbol = {
  name: string;
  kind: string;
  path: string;
  range: OpenClawLspRange;
  selectionRange?: OpenClawLspRange;
  containerName?: string;
  depth?: number;
};

export type OpenClawLspLocation = {
  path: string;
  range: OpenClawLspRange;
  name?: string;
  kind?: string;
};

export type OpenClawLspDiagnostic = {
  path: string;
  severity: "ERROR" | "WARN" | "INFO" | "HINT";
  line: number;
  character: number;
  message: string;
  code?: string | number;
};

export type OpenClawLspHover = {
  path: string;
  line: number;
  character: number;
  text: string;
};

export type OpenClawLspServerStatus = {
  id: string;
  name: string;
  root: string;
  status: "connected" | "error";
};

export type OpenClawLspService = {
  init: () => Promise<void>;
  status: () => Promise<OpenClawLspServerStatus[]>;
  hasClients: (filePath: string) => Promise<boolean>;
  touchFile: (filePath: string, diagnosticsMode?: "document" | "full") => Promise<void>;
  diagnostics: () => Promise<Record<string, OpenClawLspDiagnostic[]>>;
  diagnosticsForFile: (filePath: string) => Promise<OpenClawLspDiagnostic[]>;
  documentSymbol: (filePath: string) => Promise<OpenClawLspSymbol[]>;
  workspaceSymbol: (query?: string) => Promise<OpenClawLspSymbol[]>;
  definition: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  references: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  implementation: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  hover: (input: OpenClawLspPositionInput) => Promise<OpenClawLspHover[]>;
  prepareCallHierarchy: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  incomingCalls: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  outgoingCalls: (input: OpenClawLspPositionInput) => Promise<OpenClawLspLocation[]>;
  shutdown: () => Promise<void>;
};

export type OpenClawLspPositionInput = {
  filePath: string;
  line: number;
  character: number;
};

type OpenClawLspServiceOptions = {
  workspaceRoot: string;
  externalEnabled?: boolean;
  idleShutdownMs?: number;
};

type ServerCapabilities = {
  textDocumentSync?:
    | number
    | {
        change?: number;
      };
  diagnosticProvider?: unknown;
  [key: string]: unknown;
};

type DiagnosticRequestResult = {
  handled: boolean;
  matched: boolean;
  byFile: Map<string, OpenClawLspDiagnostic[]>;
};

type CapabilityRegistration = {
  id: string;
  method: string;
  registerOptions?: {
    identifier?: string;
    workspaceDiagnostics?: boolean;
  };
};

type LspDocument = {
  version: number;
  text: string;
};

type ExternalLspClient = {
  serverId: string;
  name: string;
  root: string;
  process: ChildProcessWithoutNullStreams;
  connection: MessageConnection;
  documents: Map<string, LspDocument>;
  diagnostics: Map<string, OpenClawLspDiagnostic[]>;
  publishedVersions: Map<string, { at: number; version?: number }>;
  diagnosticRegistrations: Map<string, CapabilityRegistration>;
  diagnosticListeners: Set<(event: { path: string; serverId: string }) => void>;
  registrationListeners: Set<() => void>;
  capabilities: ServerCapabilities;
  syncKind?: number;
  hasStaticPullDiagnostics: boolean;
  shutdown: () => Promise<void>;
  openFile: (filePath: string) => Promise<number>;
  waitForDiagnostics: (request: {
    path: string;
    version: number;
    mode?: "document" | "full";
    after?: number;
  }) => Promise<void>;
};

type SymbolInformation = {
  name?: string;
  kind?: number;
  location?: {
    uri?: string;
    range?: LspRange;
  };
  containerName?: string;
};

type DocumentSymbol = {
  name?: string;
  kind?: number;
  range?: LspRange;
  selectionRange?: LspRange;
  children?: DocumentSymbol[];
  detail?: string;
};

type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

type LspLocation = {
  uri?: string;
  range?: LspRange;
};

type LspLocationLink = {
  targetUri?: string;
  targetRange?: LspRange;
  targetSelectionRange?: LspRange;
};

type LspDiagnostic = {
  severity?: number;
  range?: LspRange;
  message?: string;
  code?: string | number;
};

function pathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeAbsolutePath(workspaceRoot: string, filePath: string): string {
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workspaceRoot, filePath);
  if (!pathWithin(resolved, workspaceRoot)) {
    throw new Error(`LSP path must stay within workspace root: ${filePath}`);
  }
  return resolved;
}

function toModelPath(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath).split(path.sep).join("/");
  if (!relative) {
    return ".";
  }
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : filePath;
}

function isSupportedSourceFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function languageIdForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return "typescriptreact";
    case ".jsx":
      return "javascriptreact";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    default:
      return "typescript";
  }
}

function scriptKindForPath(filePath: string): TypeScript.ScriptKind {
  const ts = loadTypeScript();
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function rangeFromNode(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): OpenClawLspRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line + 1, character: start.character + 1 },
    end: { line: end.line + 1, character: end.character + 1 },
  };
}

function symbolKindForNode(node: TypeScript.Node): string {
  const ts = loadTypeScript();
  if (ts.isClassDeclaration(node)) {
    return "class";
  }
  if (ts.isInterfaceDeclaration(node)) {
    return "interface";
  }
  if (ts.isFunctionDeclaration(node)) {
    return "function";
  }
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    return "method";
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return "property";
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return "type";
  }
  if (ts.isEnumDeclaration(node)) {
    return "enum";
  }
  if (ts.isVariableDeclaration(node)) {
    return "variable";
  }
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isModuleDeclaration(node)) {
    return "module";
  }
  return "symbol";
}

function symbolKindFromLsp(kind: number | undefined): string {
  switch (kind) {
    case 5:
      return "class";
    case 6:
      return "method";
    case 7:
    case 8:
      return "property";
    case 9:
      return "constructor";
    case 10:
      return "enum";
    case 11:
      return "interface";
    case 12:
      return "function";
    case 13:
    case 14:
      return "variable";
    case 23:
      return "struct";
    default:
      return "symbol";
  }
}

function getNodeName(node: TypeScript.Node): string | null {
  const ts = loadTypeScript();
  if ("name" in node) {
    const name = (node as { name?: TypeScript.Node }).name;
    if (name && ts.isIdentifier(name)) {
      return name.text;
    }
    if (name && ts.isStringLiteral(name)) {
      return name.text;
    }
  }
  return null;
}

function isNamedSymbolNode(node: TypeScript.Node): boolean {
  const ts = loadTypeScript();
  return (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

function collectDocumentSymbols(params: {
  workspaceRoot: string;
  filePath: string;
  text: string;
}): OpenClawLspSymbol[] {
  const ts = loadTypeScript();
  const sourceFile = ts.createSourceFile(
    params.filePath,
    params.text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(params.filePath),
  );
  const symbols: OpenClawLspSymbol[] = [];
  const visit = (node: TypeScript.Node, containerName?: string, depth = 0) => {
    const nodeName = getNodeName(node);
    let nextContainerName = containerName;
    let nextDepth = depth;
    if (nodeName && isNamedSymbolNode(node)) {
      const nameNode = "name" in node ? (node as { name?: TypeScript.Node }).name : undefined;
      symbols.push({
        name: nodeName,
        kind: symbolKindForNode(node),
        path: toModelPath(params.workspaceRoot, params.filePath),
        range: rangeFromNode(sourceFile, node),
        ...(nameNode ? { selectionRange: rangeFromNode(sourceFile, nameNode) } : {}),
        ...(containerName ? { containerName } : {}),
        depth,
      });
      nextContainerName = nodeName;
      nextDepth = depth + 1;
    }
    ts.forEachChild(node, (child) => visit(child, nextContainerName, nextDepth));
  };
  visit(sourceFile);
  return symbols;
}

function severityFromLspDiagnostic(diagnostic: LspDiagnostic): OpenClawLspDiagnostic["severity"] {
  switch (diagnostic.severity) {
    case 2:
      return "WARN";
    case 3:
      return "INFO";
    case 4:
      return "HINT";
    case 1:
    default:
      return "ERROR";
  }
}

export function formatOpenClawLspDiagnostic(
  diagnostic: Pick<OpenClawLspDiagnostic, "severity" | "line" | "character" | "message">,
): string {
  const message =
    diagnostic.message.length > MAX_DIAGNOSTIC_MESSAGE_CHARS
      ? `${diagnostic.message.slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS)}...`
      : diagnostic.message;
  return `${diagnostic.severity} [${diagnostic.line}:${diagnostic.character}] ${message}`;
}

export function formatOpenClawLspDiagnosticReport(
  filePath: string,
  diagnostics: readonly OpenClawLspDiagnostic[],
): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR");
  if (errors.length === 0) {
    return "";
  }
  const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE);
  const more = errors.length - limited.length;
  const suffix = more > 0 ? `\n... and ${more} more` : "";
  return `<diagnostics file="${filePath}">\n${limited
    .map(formatOpenClawLspDiagnostic)
    .join("\n")}${suffix}\n</diagnostics>`;
}

export function formatOpenClawLspSymbolsText(symbols: readonly OpenClawLspSymbol[]): string {
  if (symbols.length === 0) {
    return "No LSP symbols found.";
  }
  return symbols
    .map((symbol) => {
      const container = symbol.containerName ? ` container=${symbol.containerName}` : "";
      return `${symbol.path}:${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character} ${symbol.kind} ${symbol.name}${container}`;
    })
    .join("\n");
}

export function formatOpenClawLspLocationsText(
  operation: string,
  locations: readonly OpenClawLspLocation[],
): string {
  if (locations.length === 0) {
    return `No LSP results found for ${operation}.`;
  }
  return locations
    .map((location) => {
      const name = location.name ? ` ${location.name}` : "";
      const kind = location.kind ? ` ${location.kind}` : "";
      return `${location.path}:${location.range.start.line}:${location.range.start.character}-${location.range.end.line}:${location.range.end.character}${kind}${name}`;
    })
    .join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeLspPath(uri: string | undefined): string | null {
  if (!uri?.startsWith("file://")) {
    return null;
  }
  return path.resolve(fileURLToPath(uri));
}

function fromLspPosition(position: LspPosition | undefined): OpenClawLspPosition {
  return {
    line: (position?.line ?? 0) + 1,
    character: (position?.character ?? 0) + 1,
  };
}

function fromLspRange(range: LspRange | undefined): OpenClawLspRange {
  return {
    start: fromLspPosition(range?.start),
    end: fromLspPosition(range?.end),
  };
}

function endPosition(text: string): LspPosition {
  const lines = text.split(/\r\n|\r|\n/);
  return {
    line: Math.max(0, lines.length - 1),
    character: lines.at(-1)?.length ?? 0,
  };
}

function getSyncKind(capabilities: ServerCapabilities): number | undefined {
  const sync = capabilities.textDocumentSync;
  return typeof sync === "number" ? sync : sync?.change;
}

function collectDiagnosticIdentifiers(
  registrations: Map<string, CapabilityRegistration>,
  workspaceDiagnostics: boolean,
): string[] {
  return [
    ...new Set(
      [...registrations.values()]
        .filter(
          (registration) =>
            registration.registerOptions?.workspaceDiagnostics === workspaceDiagnostics,
        )
        .flatMap((registration) => registration.registerOptions?.identifier ?? []),
    ),
  ];
}

function mergeDiagnostics(results: DiagnosticRequestResult[]): {
  handled: boolean;
  matched: boolean;
  byFile: Map<string, OpenClawLspDiagnostic[]>;
} {
  const handled = results.some((result) => result.handled);
  const matched = results.some((result) => result.matched);
  const byFile = new Map<string, OpenClawLspDiagnostic[]>();
  for (const result of results) {
    for (const [filePath, diagnostics] of result.byFile.entries()) {
      byFile.set(filePath, [...(byFile.get(filePath) ?? []), ...diagnostics]);
    }
  }
  return { handled, matched, byFile };
}

function toOpenClawDiagnostic(params: {
  workspaceRoot: string;
  filePath: string;
  diagnostic: LspDiagnostic;
}): OpenClawLspDiagnostic {
  return {
    path: toModelPath(params.workspaceRoot, params.filePath),
    severity: severityFromLspDiagnostic(params.diagnostic),
    line: (params.diagnostic.range?.start.line ?? 0) + 1,
    character: (params.diagnostic.range?.start.character ?? 0) + 1,
    message: params.diagnostic.message ?? "LSP diagnostic",
    ...(params.diagnostic.code ? { code: params.diagnostic.code } : {}),
  };
}

function toOpenClawLocation(params: {
  workspaceRoot: string;
  location: LspLocation | LspLocationLink;
}): OpenClawLspLocation | null {
  const uri =
    "targetUri" in params.location
      ? params.location.targetUri
      : (params.location as LspLocation).uri;
  const range =
    "targetSelectionRange" in params.location
      ? (params.location.targetSelectionRange ?? params.location.targetRange)
      : (params.location as LspLocation).range;
  const filePath = normalizeLspPath(uri);
  if (!filePath) {
    return null;
  }
  return {
    path: toModelPath(params.workspaceRoot, filePath),
    range: fromLspRange(range),
  };
}

function flattenLspDocumentSymbols(params: {
  workspaceRoot: string;
  filePath: string;
  symbols: readonly DocumentSymbol[];
  containerName?: string;
  depth?: number;
}): OpenClawLspSymbol[] {
  const output: OpenClawLspSymbol[] = [];
  const depth = params.depth ?? 0;
  for (const symbol of params.symbols) {
    if (!symbol.name || !symbol.range) {
      continue;
    }
    output.push({
      name: symbol.name,
      kind: symbolKindFromLsp(symbol.kind),
      path: toModelPath(params.workspaceRoot, params.filePath),
      range: fromLspRange(symbol.range),
      ...(symbol.selectionRange ? { selectionRange: fromLspRange(symbol.selectionRange) } : {}),
      ...(params.containerName ? { containerName: params.containerName } : {}),
      depth,
    });
    output.push(
      ...flattenLspDocumentSymbols({
        workspaceRoot: params.workspaceRoot,
        filePath: params.filePath,
        symbols: symbol.children ?? [],
        containerName: symbol.name,
        depth: depth + 1,
      }),
    );
  }
  return output;
}

function normalizeDocumentSymbolResult(params: {
  workspaceRoot: string;
  filePath: string;
  result: unknown;
}): OpenClawLspSymbol[] {
  const entries = Array.isArray(params.result) ? params.result : [];
  if (entries.length === 0) {
    return [];
  }
  const first = entries[0] as Record<string, unknown>;
  if (first && typeof first === "object" && "location" in first) {
    return (entries as SymbolInformation[])
      .map((symbol): OpenClawLspSymbol | null => {
        const filePath = normalizeLspPath(symbol.location?.uri);
        if (!symbol.name || !filePath || !symbol.location?.range) {
          return null;
        }
        return {
          name: symbol.name,
          kind: symbolKindFromLsp(symbol.kind),
          path: toModelPath(params.workspaceRoot, filePath),
          range: fromLspRange(symbol.location.range),
          ...(symbol.containerName ? { containerName: symbol.containerName } : {}),
        };
      })
      .filter((symbol): symbol is OpenClawLspSymbol => !!symbol);
  }
  return flattenLspDocumentSymbols({
    workspaceRoot: params.workspaceRoot,
    filePath: params.filePath,
    symbols: entries as DocumentSymbol[],
  });
}

function normalizeWorkspaceSymbolResult(params: {
  workspaceRoot: string;
  result: unknown;
}): OpenClawLspSymbol[] {
  const entries = Array.isArray(params.result) ? (params.result as SymbolInformation[]) : [];
  return entries
    .map((symbol): OpenClawLspSymbol | null => {
      const filePath = normalizeLspPath(symbol.location?.uri);
      if (!symbol.name || !filePath || !symbol.location?.range) {
        return null;
      }
      return {
        name: symbol.name,
        kind: symbolKindFromLsp(symbol.kind),
        path: toModelPath(params.workspaceRoot, filePath),
        range: fromLspRange(symbol.location.range),
        ...(symbol.containerName ? { containerName: symbol.containerName } : {}),
      };
    })
    .filter((symbol): symbol is OpenClawLspSymbol => !!symbol)
    .slice(0, DEFAULT_MAX_SYMBOLS);
}

function normalizeLocationResult(params: {
  workspaceRoot: string;
  result: unknown;
}): OpenClawLspLocation[] {
  if (!params.result) {
    return [];
  }
  const entries = Array.isArray(params.result) ? params.result : [params.result];
  return (entries as Array<LspLocation | LspLocationLink>)
    .map((location) => toOpenClawLocation({ workspaceRoot: params.workspaceRoot, location }))
    .filter((location): location is OpenClawLspLocation => !!location);
}

function normalizeHoverResult(params: {
  workspaceRoot: string;
  filePath: string;
  input: OpenClawLspPositionInput;
  result: unknown;
}): OpenClawLspHover[] {
  const result = params.result as { contents?: unknown } | null | undefined;
  const contents = result?.contents;
  let text = "";
  if (typeof contents === "string") {
    text = contents;
  } else if (Array.isArray(contents)) {
    text = contents
      .map((entry) =>
        typeof entry === "string"
          ? entry
          : entry &&
              typeof entry === "object" &&
              typeof (entry as { value?: unknown }).value === "string"
            ? (entry as { value: string }).value
            : "",
      )
      .filter(Boolean)
      .join("\n");
  } else if (contents && typeof contents === "object") {
    const value = (contents as { value?: unknown }).value;
    text = typeof value === "string" ? value : "";
  }
  return text
    ? [
        {
          path: toModelPath(params.workspaceRoot, params.filePath),
          line: params.input.line,
          character: params.input.character,
          text,
        },
      ]
    : [];
}

async function findNearestRoot(filePath: string, workspaceRoot: string): Promise<string> {
  let current = path.dirname(filePath);
  while (pathWithin(current, workspaceRoot)) {
    for (const marker of ROOT_MARKERS) {
      const markerPath = path.join(current, marker);
      const stat = await fs.stat(markerPath).catch(() => null);
      if (stat?.isFile()) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return workspaceRoot;
}

function resolvePackagePath(packagePath: string, from: string): string | null {
  try {
    return require.resolve(packagePath, { paths: [from] });
  } catch {
    try {
      return require.resolve(packagePath);
    } catch {
      return null;
    }
  }
}

function resolveTypeScriptServerLaunch(root: string): {
  cliPath: string;
  tsserverPath: string;
} | null {
  const cliPath = resolvePackagePath("typescript-language-server/lib/cli.mjs", root);
  const tsserverPath = resolvePackagePath("typescript/lib/tsserver.js", root);
  return cliPath && tsserverPath ? { cliPath, tsserverPath } : null;
}

function parseDiagnosticReport(params: {
  workspaceRoot: string;
  filePath: string;
  report: unknown;
}): DiagnosticRequestResult {
  if (!params.report || typeof params.report !== "object") {
    return { handled: false, matched: false, byFile: new Map() };
  }
  const report = params.report as {
    items?: LspDiagnostic[];
    relatedDocuments?: Record<string, { items?: LspDiagnostic[] }>;
  };
  const byFile = new Map<string, OpenClawLspDiagnostic[]>();
  let handled = false;
  let matched = false;
  if (Array.isArray(report.items)) {
    byFile.set(
      params.filePath,
      report.items.map((diagnostic) =>
        toOpenClawDiagnostic({
          workspaceRoot: params.workspaceRoot,
          filePath: params.filePath,
          diagnostic,
        }),
      ),
    );
    handled = true;
    matched = true;
  }
  for (const [uri, related] of Object.entries(report.relatedDocuments ?? {})) {
    const filePath = normalizeLspPath(uri);
    if (!filePath || !Array.isArray(related.items)) {
      continue;
    }
    byFile.set(
      filePath,
      related.items.map((diagnostic) =>
        toOpenClawDiagnostic({ workspaceRoot: params.workspaceRoot, filePath, diagnostic }),
      ),
    );
    handled = true;
    matched = matched || filePath === params.filePath;
  }
  return { handled, matched, byFile };
}

function createExternalClient(params: {
  workspaceRoot: string;
  root: string;
  cliPath: string;
  tsserverPath: string;
}): Promise<ExternalLspClient> {
  const child = spawn(process.execPath, [params.cliPath, "--stdio"], {
    cwd: params.root,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.resume();
  const spawnError = new Promise<never>((_, reject) => {
    child.once("error", (error) => {
      reject(error);
    });
  });
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  const documents = new Map<string, LspDocument>();
  const diagnostics = new Map<string, OpenClawLspDiagnostic[]>();
  const publishedVersions = new Map<string, { at: number; version?: number }>();
  const diagnosticRegistrations = new Map<string, CapabilityRegistration>();
  const diagnosticListeners = new Set<(event: { path: string; serverId: string }) => void>();
  const registrationListeners = new Set<() => void>();
  let capabilities: ServerCapabilities = {};
  let disposed = false;

  const updateDiagnostics = (filePath: string, items: OpenClawLspDiagnostic[]) => {
    diagnostics.set(filePath, items);
    for (const listener of diagnosticListeners) {
      listener({ path: filePath, serverId: TYPESCRIPT_SERVER_ID });
    }
  };

  connection.onNotification("textDocument/publishDiagnostics", (rawParams: unknown) => {
    const notification = rawParams as {
      uri?: string;
      version?: number;
      diagnostics?: LspDiagnostic[];
    };
    const filePath = normalizeLspPath(notification.uri);
    if (!filePath) {
      return;
    }
    publishedVersions.set(filePath, {
      at: Date.now(),
      ...(typeof notification.version === "number" ? { version: notification.version } : {}),
    });
    updateDiagnostics(
      filePath,
      (notification.diagnostics ?? []).map((diagnostic) =>
        toOpenClawDiagnostic({ workspaceRoot: params.workspaceRoot, filePath, diagnostic }),
      ),
    );
  });
  connection.onRequest("window/workDoneProgress/create", async () => null);
  connection.onRequest("workspace/configuration", async () => [
    {
      tsserver: {
        path: params.tsserverPath,
      },
    },
  ]);
  connection.onRequest("workspace/workspaceFolders", async () => [
    {
      name: "workspace",
      uri: pathToFileURL(params.root).href,
    },
  ]);
  connection.onRequest("workspace/diagnostic/refresh", async () => null);
  connection.onRequest("client/registerCapability", async (rawParams: unknown) => {
    const registrations =
      (rawParams as { registrations?: CapabilityRegistration[] }).registrations ?? [];
    let changed = false;
    for (const registration of registrations) {
      if (registration.method !== "textDocument/diagnostic") {
        continue;
      }
      diagnosticRegistrations.set(registration.id, registration);
      changed = true;
    }
    if (changed) {
      for (const listener of registrationListeners) {
        listener();
      }
    }
    return null;
  });
  connection.onRequest("client/unregisterCapability", async (rawParams: unknown) => {
    const registrations =
      (rawParams as { unregisterations?: { id: string; method: string }[] }).unregisterations ?? [];
    let changed = false;
    for (const registration of registrations) {
      if (registration.method !== "textDocument/diagnostic") {
        continue;
      }
      diagnosticRegistrations.delete(registration.id);
      changed = true;
    }
    if (changed) {
      for (const listener of registrationListeners) {
        listener();
      }
    }
    return null;
  });
  connection.listen();

  const sendRequest = async <T>(
    method: string,
    requestParams: unknown,
    timeoutMs: number,
  ): Promise<T> =>
    withTimeout(
      connection.sendRequest<T>(method, requestParams),
      timeoutMs,
      `LSP request ${method} timed out after ${timeoutMs}ms`,
    );

  const waitForRegistrationChange = async (timeoutMs: number): Promise<boolean> => {
    if (timeoutMs <= 0) {
      return false;
    }
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value: boolean) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        registrationListeners.delete(listener);
        resolve(value);
      };
      const listener = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      registrationListeners.add(listener);
    });
  };

  const waitForFreshPush = async (request: {
    path: string;
    version: number;
    after: number;
    timeoutMs: number;
  }): Promise<boolean> => {
    if (request.timeoutMs <= 0) {
      return false;
    }
    return new Promise((resolve) => {
      let finished = false;
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value: boolean) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeoutTimer);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        diagnosticListeners.delete(listener);
        resolve(value);
      };
      const schedule = () => {
        const hit = publishedVersions.get(request.path);
        if (!hit) {
          return;
        }
        if (typeof hit.version === "number" && hit.version !== request.version) {
          return;
        }
        if (hit.at < request.after && hit.version !== request.version) {
          return;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(
          () => finish(true),
          Math.max(0, DIAGNOSTICS_DEBOUNCE_MS - (Date.now() - hit.at)),
        );
      };
      const listener = (event: { path: string; serverId: string }) => {
        if (event.path === request.path && event.serverId === TYPESCRIPT_SERVER_ID) {
          schedule();
        }
      };
      const timeoutTimer = setTimeout(() => finish(false), request.timeoutMs);
      diagnosticListeners.add(listener);
      schedule();
    });
  };

  const requestDiagnosticReport = async (
    filePath: string,
    identifier?: string,
  ): Promise<DiagnosticRequestResult> => {
    const report = await sendRequest<unknown>(
      "textDocument/diagnostic",
      {
        ...(identifier ? { identifier } : {}),
        textDocument: { uri: pathToFileURL(filePath).href },
      },
      DIAGNOSTICS_REQUEST_TIMEOUT_MS,
    ).catch(() => null);
    return parseDiagnosticReport({ workspaceRoot: params.workspaceRoot, filePath, report });
  };

  const requestDocumentDiagnostics = async (
    filePath: string,
  ): Promise<{
    handled: boolean;
    matched: boolean;
  }> => {
    const identifiers = collectDiagnosticIdentifiers(diagnosticRegistrations, false);
    if (!capabilities.diagnosticProvider && identifiers.length === 0) {
      return { handled: false, matched: false };
    }
    const merged = mergeDiagnostics(
      await Promise.all([
        requestDiagnosticReport(filePath),
        ...identifiers.map((identifier) => requestDiagnosticReport(filePath, identifier)),
      ]),
    );
    for (const [target, items] of merged.byFile.entries()) {
      diagnostics.set(target, items);
    }
    return { handled: merged.handled, matched: merged.matched };
  };

  const requestWorkspaceDiagnostics = async (
    filePath: string,
  ): Promise<{
    handled: boolean;
    matched: boolean;
  }> => {
    const identifiers = collectDiagnosticIdentifiers(diagnosticRegistrations, true);
    if (identifiers.length === 0) {
      return { handled: false, matched: false };
    }
    const results = await Promise.all(
      identifiers.map(async (identifier): Promise<DiagnosticRequestResult> => {
        const report = await sendRequest<{
          items?: { uri?: string; items?: LspDiagnostic[] }[];
        } | null>(
          "workspace/diagnostic",
          { identifier, previousResultIds: [] },
          DIAGNOSTICS_REQUEST_TIMEOUT_MS,
        ).catch(() => null);
        const byFile = new Map<string, OpenClawLspDiagnostic[]>();
        let matched = false;
        for (const item of report?.items ?? []) {
          const target = normalizeLspPath(item.uri);
          if (!target || !Array.isArray(item.items)) {
            continue;
          }
          byFile.set(
            target,
            item.items.map((diagnostic) =>
              toOpenClawDiagnostic({
                workspaceRoot: params.workspaceRoot,
                filePath: target,
                diagnostic,
              }),
            ),
          );
          matched = matched || target === filePath;
        }
        return { handled: Boolean(report), matched, byFile };
      }),
    );
    const merged = mergeDiagnostics(results);
    for (const [target, items] of merged.byFile.entries()) {
      diagnostics.set(target, items);
    }
    return { handled: merged.handled, matched: merged.matched };
  };

  const waitForDiagnostics = async (request: {
    path: string;
    version: number;
    mode?: "document" | "full";
    after?: number;
  }) => {
    const startedAt = request.after ?? Date.now();
    const timeoutMs =
      request.mode === "full"
        ? DIAGNOSTICS_FULL_WAIT_TIMEOUT_MS
        : DIAGNOSTICS_DOCUMENT_WAIT_TIMEOUT_MS;
    const pushWait = waitForFreshPush({
      path: request.path,
      version: request.version,
      after: startedAt,
      timeoutMs,
    });
    while (Date.now() - startedAt < timeoutMs) {
      const documentResult = await requestDocumentDiagnostics(request.path);
      const workspaceResult =
        request.mode === "full" ? await requestWorkspaceDiagnostics(request.path) : undefined;
      if (documentResult.matched || workspaceResult?.matched || workspaceResult?.handled) {
        return;
      }
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        return;
      }
      const next = await Promise.race([
        pushWait.then((ready) => (ready ? "push" : ("timeout" as const))),
        waitForRegistrationChange(remaining).then((changed) =>
          changed ? "registration" : ("timeout" as const),
        ),
      ]);
      if (next !== "registration") {
        return;
      }
    }
  };

  const openFile = async (filePath: string): Promise<number> => {
    const text = await fs.readFile(filePath, "utf8");
    const existing = documents.get(filePath);
    if (existing) {
      const version = existing.version + 1;
      documents.set(filePath, { version, text });
      await connection.sendNotification("workspace/didChangeWatchedFiles", {
        changes: [{ uri: pathToFileURL(filePath).href, type: FILE_CHANGE_CHANGED }],
      });
      await connection.sendNotification("textDocument/didChange", {
        textDocument: { uri: pathToFileURL(filePath).href, version },
        contentChanges:
          capabilities.textDocumentSync &&
          getSyncKind(capabilities) === TEXT_DOCUMENT_SYNC_INCREMENTAL
            ? [
                {
                  range: { start: { line: 0, character: 0 }, end: endPosition(existing.text) },
                  text,
                },
              ]
            : [{ text }],
      });
      return version;
    }
    documents.set(filePath, { version: 0, text });
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(filePath).href, type: FILE_CHANGE_CREATED }],
    });
    await connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: pathToFileURL(filePath).href,
        languageId: languageIdForPath(filePath),
        version: 0,
        text,
      },
    });
    return 0;
  };

  const shutdown = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      if (child.exitCode === null && !child.killed && !child.stdin.destroyed) {
        await connection.sendRequest("shutdown").catch(() => undefined);
      }
      if (child.exitCode === null && !child.killed && !child.stdin.destroyed) {
        connection.sendNotification("exit").catch(() => undefined);
      }
    } finally {
      connection.end();
      connection.dispose();
      if (child.exitCode === null && !child.killed) {
        child.kill();
      }
    }
  };

  return withTimeout(
    Promise.race([
      spawnError,
      (async () => {
        const initialized = await sendRequest<{ capabilities?: ServerCapabilities }>(
          "initialize",
          {
            rootUri: pathToFileURL(params.root).href,
            processId: child.pid,
            workspaceFolders: [{ name: "workspace", uri: pathToFileURL(params.root).href }],
            initializationOptions: { tsserver: { path: params.tsserverPath } },
            capabilities: {
              window: { workDoneProgress: true },
              workspace: {
                configuration: true,
                didChangeWatchedFiles: { dynamicRegistration: true },
                diagnostics: { refreshSupport: false },
              },
              textDocument: {
                synchronization: { didOpen: true, didChange: true },
                diagnostic: { dynamicRegistration: true, relatedDocumentSupport: true },
                publishDiagnostics: { versionSupport: false },
              },
            },
          },
          INITIALIZE_TIMEOUT_MS,
        );
        capabilities = initialized.capabilities ?? {};
        await connection.sendNotification("initialized", {});
        await connection.sendNotification("workspace/didChangeConfiguration", {
          settings: { tsserver: { path: params.tsserverPath } },
        });
        return {
          serverId: TYPESCRIPT_SERVER_ID,
          name: TYPESCRIPT_SERVER_NAME,
          root: params.root,
          process: child,
          connection,
          documents,
          diagnostics,
          publishedVersions,
          diagnosticRegistrations,
          diagnosticListeners,
          registrationListeners,
          capabilities,
          syncKind: getSyncKind(capabilities),
          hasStaticPullDiagnostics: Boolean(capabilities.diagnosticProvider),
          shutdown,
          openFile,
          waitForDiagnostics,
        };
      })(),
    ]),
    INITIALIZE_TIMEOUT_MS,
    `LSP initialize timed out after ${INITIALIZE_TIMEOUT_MS}ms`,
  ).catch(async (error) => {
    await shutdown().catch(() => undefined);
    throw error;
  });
}

async function scanWorkspaceSymbolsFallback(params: {
  workspaceRoot: string;
  query: string;
}): Promise<OpenClawLspSymbol[]> {
  const needle = params.query.trim().toLowerCase();
  const symbols: OpenClawLspSymbol[] = [];
  async function walk(dir: string): Promise<void> {
    if (symbols.length >= DEFAULT_MAX_SYMBOLS) {
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (symbols.length >= DEFAULT_MAX_SYMBOLS) {
        return;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          await walk(absolute);
        }
        continue;
      }
      if (!entry.isFile() || !isSupportedSourceFile(absolute)) {
        continue;
      }
      const text = await fs.readFile(absolute, "utf8").catch(() => "");
      if (!text) {
        continue;
      }
      for (const symbol of collectDocumentSymbols({
        workspaceRoot: params.workspaceRoot,
        filePath: absolute,
        text,
      })) {
        if (!needle || symbol.name.toLowerCase().includes(needle)) {
          symbols.push(symbol);
        }
        if (symbols.length >= DEFAULT_MAX_SYMBOLS) {
          return;
        }
      }
    }
  }
  await walk(params.workspaceRoot);
  return symbols;
}

export function createOpenClawLspService(options: OpenClawLspServiceOptions): OpenClawLspService {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const externalEnabled = options.externalEnabled !== false;
  const clients = new Map<string, Promise<ExternalLspClient | null>>();
  const broken = new Set<string>();
  const touchedFiles = new Set<string>();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let shuttingDown = false;

  const resetIdleTimer = () => {
    if (shuttingDown) {
      return;
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      void shutdown();
    }, options.idleShutdownMs ?? LSP_IDLE_SHUTDOWN_MS);
    idleTimer.unref?.();
  };

  const getClient = async (filePath: string): Promise<ExternalLspClient | null> => {
    if (!externalEnabled) {
      return null;
    }
    const absolutePath = normalizeAbsolutePath(workspaceRoot, filePath);
    if (!isSupportedSourceFile(absolutePath)) {
      return null;
    }
    const root = await findNearestRoot(absolutePath, workspaceRoot);
    const key = `${root}:${TYPESCRIPT_SERVER_ID}`;
    if (broken.has(key)) {
      return null;
    }
    const launch = resolveTypeScriptServerLaunch(root);
    if (!launch) {
      broken.add(key);
      return null;
    }
    const existing = clients.get(key);
    if (existing) {
      resetIdleTimer();
      return existing;
    }
    const pending = createExternalClient({
      workspaceRoot,
      root,
      cliPath: launch.cliPath,
      tsserverPath: launch.tsserverPath,
    })
      .then((client) => {
        resetIdleTimer();
        return client;
      })
      .catch(() => {
        broken.add(key);
        clients.delete(key);
        return null;
      });
    clients.set(key, pending);
    return pending;
  };

  async function shutdown(): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
    const currentClients = await Promise.all(clients.values());
    clients.clear();
    await Promise.all(
      currentClients.map(async (client) => {
        try {
          await client?.shutdown();
        } catch {
          // Shutdown is best-effort during process/session cleanup.
        }
      }),
    );
  }

  const service: OpenClawLspService = {
    init: async () => {
      // Avoid eager workspace scanning. Clients start lazily when a source file is touched.
    },
    status: async () => {
      const result: OpenClawLspServerStatus[] = [];
      for (const client of await Promise.all(clients.values())) {
        if (!client) {
          continue;
        }
        result.push({
          id: client.serverId,
          name: client.name,
          root: toModelPath(workspaceRoot, client.root),
          status: "connected",
        });
      }
      for (const key of broken) {
        const [root] = key.split(`:${TYPESCRIPT_SERVER_ID}`);
        result.push({
          id: TYPESCRIPT_SERVER_ID,
          name: TYPESCRIPT_SERVER_NAME,
          root: toModelPath(workspaceRoot, root || workspaceRoot),
          status: "error",
        });
      }
      return result;
    },
    hasClients: async (filePath) =>
      isSupportedSourceFile(normalizeAbsolutePath(workspaceRoot, filePath)),
    touchFile: async (filePath, diagnosticsMode) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, filePath);
      if (!isSupportedSourceFile(absolutePath)) {
        return;
      }
      touchedFiles.add(absolutePath);
      const client = await getClient(absolutePath);
      if (!client) {
        return;
      }
      const after = Date.now();
      const version = await client.openFile(absolutePath);
      if (diagnosticsMode) {
        await client.waitForDiagnostics({
          path: absolutePath,
          version,
          mode: diagnosticsMode,
          after,
        });
      }
    },
    diagnostics: async () => {
      const result: Record<string, OpenClawLspDiagnostic[]> = {};
      for (const client of await Promise.all(clients.values())) {
        if (!client) {
          continue;
        }
        for (const filePath of touchedFiles) {
          const diagnostics = client.diagnostics.get(filePath);
          if (diagnostics) {
            result[filePath] = diagnostics;
          }
        }
      }
      return result;
    },
    diagnosticsForFile: async (filePath) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, filePath);
      const client = await getClient(absolutePath);
      return client?.diagnostics.get(absolutePath) ?? [];
    },
    documentSymbol: async (filePath) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, filePath);
      if (!isSupportedSourceFile(absolutePath)) {
        throw new Error(`No LSP server available for this file type: ${filePath}`);
      }
      const client = await getClient(absolutePath);
      if (client) {
        await client.openFile(absolutePath);
        const result = await withTimeout(
          client.connection.sendRequest<unknown>("textDocument/documentSymbol", {
            textDocument: { uri: pathToFileURL(absolutePath).href },
          }),
          DIAGNOSTICS_REQUEST_TIMEOUT_MS,
          `LSP request textDocument/documentSymbol timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
        ).catch(() => null);
        if (result) {
          return normalizeDocumentSymbolResult({ workspaceRoot, filePath: absolutePath, result });
        }
      }
      const text = await fs.readFile(absolutePath, "utf8");
      return collectDocumentSymbols({ workspaceRoot, filePath: absolutePath, text });
    },
    workspaceSymbol: async (query = "") => {
      const clientsSnapshot = (await Promise.all(clients.values())).filter(
        (client): client is ExternalLspClient => !!client,
      );
      const symbols = (
        await Promise.all(
          clientsSnapshot.map(async (client) => {
            const result = await withTimeout(
              client.connection.sendRequest<unknown>("workspace/symbol", { query }),
              DIAGNOSTICS_REQUEST_TIMEOUT_MS,
              `LSP request workspace/symbol timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
            ).catch(() => null);
            return normalizeWorkspaceSymbolResult({ workspaceRoot, result });
          }),
        )
      )
        .flat()
        .slice(0, DEFAULT_MAX_SYMBOLS);
      return symbols.length > 0 ? symbols : scanWorkspaceSymbolsFallback({ workspaceRoot, query });
    },
    definition: async (input) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, input.filePath);
      const client = await getClient(absolutePath);
      if (!client) {
        return [];
      }
      await client.openFile(absolutePath);
      const result = await withTimeout(
        client.connection.sendRequest<unknown>("textDocument/definition", {
          textDocument: { uri: pathToFileURL(absolutePath).href },
          position: { line: input.line - 1, character: input.character - 1 },
        }),
        DIAGNOSTICS_REQUEST_TIMEOUT_MS,
        `LSP request textDocument/definition timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
      ).catch(() => null);
      return normalizeLocationResult({ workspaceRoot, result });
    },
    references: async (input) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, input.filePath);
      const client = await getClient(absolutePath);
      if (!client) {
        return [];
      }
      await client.openFile(absolutePath);
      const result = await withTimeout(
        client.connection.sendRequest<unknown>("textDocument/references", {
          textDocument: { uri: pathToFileURL(absolutePath).href },
          position: { line: input.line - 1, character: input.character - 1 },
          context: { includeDeclaration: true },
        }),
        DIAGNOSTICS_REQUEST_TIMEOUT_MS,
        `LSP request textDocument/references timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
      ).catch(() => null);
      return normalizeLocationResult({ workspaceRoot, result });
    },
    implementation: async (input) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, input.filePath);
      const client = await getClient(absolutePath);
      if (!client) {
        return [];
      }
      await client.openFile(absolutePath);
      const result = await withTimeout(
        client.connection.sendRequest<unknown>("textDocument/implementation", {
          textDocument: { uri: pathToFileURL(absolutePath).href },
          position: { line: input.line - 1, character: input.character - 1 },
        }),
        DIAGNOSTICS_REQUEST_TIMEOUT_MS,
        `LSP request textDocument/implementation timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
      ).catch(() => null);
      return normalizeLocationResult({ workspaceRoot, result });
    },
    hover: async (input) => {
      const absolutePath = normalizeAbsolutePath(workspaceRoot, input.filePath);
      const client = await getClient(absolutePath);
      if (!client) {
        return [];
      }
      await client.openFile(absolutePath);
      const result = await withTimeout(
        client.connection.sendRequest<unknown>("textDocument/hover", {
          textDocument: { uri: pathToFileURL(absolutePath).href },
          position: { line: input.line - 1, character: input.character - 1 },
        }),
        DIAGNOSTICS_REQUEST_TIMEOUT_MS,
        `LSP request textDocument/hover timed out after ${DIAGNOSTICS_REQUEST_TIMEOUT_MS}ms`,
      ).catch(() => null);
      return normalizeHoverResult({ workspaceRoot, filePath: absolutePath, input, result });
    },
    prepareCallHierarchy: async (input) => {
      const symbols = await collectEnclosingSymbols({ workspaceRoot, input });
      return symbols.slice(0, 1).map((symbol) => ({
        path: symbol.path,
        range: symbol.range,
        name: symbol.name,
        kind: symbol.kind,
      }));
    },
    incomingCalls: async () => [],
    outgoingCalls: async () => [],
    shutdown,
  };

  return service;
}

export async function collectEnclosingSymbols(params: {
  workspaceRoot: string;
  input: OpenClawLspPositionInput;
}): Promise<OpenClawLspSymbol[]> {
  const absolutePath = normalizeAbsolutePath(params.workspaceRoot, params.input.filePath);
  if (!isSupportedSourceFile(absolutePath)) {
    return [];
  }
  const text = await fs.readFile(absolutePath, "utf8").catch(() => "");
  if (!text) {
    return [];
  }
  const ts = loadTypeScript();
  const sourceFile = ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(absolutePath),
  );
  const lineStarts = sourceFile.getLineStarts();
  const line = Math.max(1, Math.min(params.input.line, lineStarts.length));
  const lineStart = lineStarts[line - 1] ?? 0;
  const nextLineStart = lineStarts[line] ?? sourceFile.text.length;
  const character = Math.max(1, Math.min(params.input.character, nextLineStart - lineStart + 1));
  const offset = sourceFile.getPositionOfLineAndCharacter(line - 1, character - 1);
  return collectDocumentSymbols({
    workspaceRoot: params.workspaceRoot,
    filePath: absolutePath,
    text,
  })
    .filter((symbol) => {
      const start = sourceFile.getPositionOfLineAndCharacter(
        symbol.range.start.line - 1,
        symbol.range.start.character - 1,
      );
      const end = sourceFile.getPositionOfLineAndCharacter(
        symbol.range.end.line - 1,
        symbol.range.end.character - 1,
      );
      return start <= offset && offset <= end;
    })
    .toSorted((a, b) => {
      const aSize = a.range.end.line - a.range.start.line;
      const bSize = b.range.end.line - b.range.start.line;
      return aSize - bSize;
    });
}
