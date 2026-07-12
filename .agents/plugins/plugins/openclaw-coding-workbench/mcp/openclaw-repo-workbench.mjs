#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_OUTPUT_BYTES = 64_000;
const MAX_BATCH_ITEMS = 20;
const MAX_READ_BYTES = 80_000;
const MAX_RESULTS = 200;
const MAX_SEARCH_CONTEXT_LINES = 5;
const DEFAULT_LSP_MAX_LOADED_FILES = 24;
const PositiveIntSchema = z.number().int().min(1);
const DEFAULT_EXCLUDE_GLOBS = [
  ".git/**",
  ".openclaw/**",
  "artifacts/**",
  "state/**",
  "transcripts/**",
  "sessions/**",
  "logs/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".turbo/**",
  ".next/**",
  "*.log",
  "*.jsonl",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*secret*",
  "**/*token*",
  "**/*credential*",
  "**/*provider-prompt*",
];

const server = new McpServer(
  {
    name: "openclaw_repo_workbench",
    version: "0.1.0",
  },
  {
    instructions:
      "Prefer these read-only batched tools for broad repository discovery, multi-file reads, globs, git inspection, and TypeScript symbol lookup. Use native shell/exec for commands, tests, formatting, builds, exact one-off checks, or a concrete MCP limitation.",
  },
);

const READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const SearchQuerySchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  glob: z.string().optional(),
  literal: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  contextLines: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Optional context-line count. Values above ${MAX_SEARCH_CONTEXT_LINES} are accepted and clamped.`,
    ),
  maxMatches: PositiveIntSchema.optional().describe(
    `Optional match cap. Values above ${MAX_RESULTS} are accepted and clamped.`,
  ),
});

const ReadRequestSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxBytes: PositiveIntSchema.optional().describe(
    `Optional byte cap. Values above ${MAX_READ_BYTES} are accepted and clamped.`,
  ),
});

const GlobRequestSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  maxResults: PositiveIntSchema.optional().describe(
    `Optional result cap. Values above ${MAX_RESULTS} are accepted and clamped.`,
  ),
});

const GitRequestSchema = z.object({
  kind: z.enum(["status", "diff_stat", "changed_files", "diff_hunks"]),
  path: z.string().optional(),
  maxBytes: PositiveIntSchema.optional().describe(
    `Optional byte cap. Values above ${DEFAULT_OUTPUT_BYTES} are accepted and clamped.`,
  ),
});

const LspLocationSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  character: z.number().int().min(1),
  maxResults: PositiveIntSchema.optional().describe(
    `Optional result cap. Values above ${MAX_RESULTS} are accepted and clamped.`,
  ),
});

server.registerTool(
  "repo_search_many",
  {
    title: "Search Many",
    description:
      "Preferred broad-discovery tool: run multiple independent bounded ripgrep searches concurrently under the active workspace root.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: z.object({
      queries: z.array(SearchQuerySchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoSearchMany(input)),
);

server.registerTool(
  "repo_read_many",
  {
    title: "Read Many",
    description:
      "Preferred multi-file read tool: read multiple bounded files or line ranges concurrently under the active workspace root.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: z.object({
      files: z.array(ReadRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoReadMany(input)),
);

server.registerTool(
  "repo_glob_many",
  {
    title: "Glob Many",
    description:
      "Preferred broad file-discovery tool: resolve multiple bounded globs concurrently under the active workspace root.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: z.object({
      globs: z.array(GlobRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await repoGlobMany(input)),
);

server.registerTool(
  "git_inspect_many",
  {
    title: "Git Inspect Many",
    description:
      "Preferred diff/status discovery tool: inspect the workspace and nested source git roots with bounded read-only requests.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: z.object({
      requests: z.array(GitRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => result(await gitInspectMany(input)),
);

server.registerTool(
  "lsp_hover_typescript",
  {
    title: "TypeScript Hover",
    description:
      "Return bounded TypeScript language-service hover details for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: LspLocationSchema,
  },
  async (input) => result(await lspHoverTypescript(input)),
);

server.registerTool(
  "lsp_definition_typescript",
  {
    title: "TypeScript Definition",
    description:
      "Return bounded cross-file TypeScript language-service definition locations for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: LspLocationSchema,
  },
  async (input) => result(await lspDefinitionTypescript(input)),
);

server.registerTool(
  "lsp_references_typescript",
  {
    title: "TypeScript References",
    description:
      "Return bounded TypeScript language-service references for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: LspLocationSchema,
  },
  async (input) => result(await lspReferencesTypescript(input)),
);

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function repoSearchMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const queries = input.queries.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(queries.map((query) => runSearchQuery(root, query)));
  return { schemaVersion: "openclaw.repo_workbench.search_many.v1", root, results };
}

export async function repoReadMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const files = input.files.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(files.map((request) => readFileRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.read_many.v1", root, results };
}

export async function repoGlobMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const globs = input.globs.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(globs.map((request) => runGlobRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.glob_many.v1", root, results };
}

export async function gitInspectMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const requests = input.requests.slice(0, MAX_BATCH_ITEMS);
  const roots = resolveGitRoots(root, options.env ?? process.env);
  const expandedRequests = requests.flatMap((request) =>
    expandGitRequestRoots(root, roots, request).map((gitRoot) => ({ request, gitRoot })),
  );
  const results = await Promise.all(
    expandedRequests.map(({ request, gitRoot }) => runGitRequest(root, gitRoot, request)),
  );
  return {
    schemaVersion: "openclaw.repo_workbench.git_inspect_many.v1",
    root,
    gitRoots: roots.map((gitRoot) => relative(root, gitRoot)),
    gitRootLabels: roots.map((gitRoot) => ({
      label: gitRoot === root ? "workspace" : "nested_source",
      path: relative(root, gitRoot),
    })),
    results,
  };
}

export async function lspHoverTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ ts, service, file, position }) => {
      const quickInfo = service.getQuickInfoAtPosition(file, position);
      if (!quickInfo) {
        return { status: "no_hover" };
      }
      return {
        status: "ok",
        display: ts.displayPartsToString(quickInfo.displayParts ?? []),
        documentation: ts.displayPartsToString(quickInfo.documentation ?? []),
        tags: (quickInfo.tags ?? []).map((tag) => ({
          name: tag.name,
          text: ts.displayPartsToString(tag.text ?? []),
        })),
      };
    },
  );
}

export async function lspDefinitionTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ service, file, position, root }) => {
      const definitions = service.getDefinitionAtPosition(file, position) ?? [];
      const maxResults = clampPositiveInt(input.maxResults, 40, MAX_RESULTS);
      return {
        status: definitions.length > 0 ? "ok" : "no_definition",
        effectiveMaxResults: maxResults,
        ...(input.maxResults && input.maxResults > maxResults
          ? { requestedMaxResults: input.maxResults, maxResultsClamped: true }
          : {}),
        definitions: definitions
          .slice(0, maxResults)
          .map((definition) => formatLspSpan(root, definition.fileName, definition.textSpan)),
        truncated: definitions.length > maxResults,
      };
    },
  );
}

export async function lspReferencesTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ service, file, position, root }) => {
      const referenceGroups = service.findReferences(file, position) ?? [];
      const references = referenceGroups.flatMap((group) => group.references);
      const maxResults = clampPositiveInt(input.maxResults, 80, MAX_RESULTS);
      return {
        status: references.length > 0 ? "ok" : "no_references",
        effectiveMaxResults: maxResults,
        ...(input.maxResults && input.maxResults > maxResults
          ? { requestedMaxResults: input.maxResults, maxResultsClamped: true }
          : {}),
        references: references.slice(0, maxResults).map((reference) =>
          Object.assign(formatLspSpan(root, reference.fileName, reference.textSpan), {
            isDefinition: reference.isDefinition === true,
          }),
        ),
        truncated: references.length > maxResults,
      };
    },
  );
}

export function resolveRepoRoot(cwd = process.cwd(), env = process.env) {
  const envRoot = env.OPENCLAW_REPO_WORKBENCH_ROOT?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  let current = path.resolve(cwd);
  for (let index = 0; index < 12; index += 1) {
    if (
      existsSync(path.join(current, "openclaw.mjs")) &&
      existsSync(path.join(current, "package.json"))
    ) {
      return current;
    }
    if (
      path.basename(current) === "openclaw-coding-workbench" &&
      existsSync(path.join(current, "..", "..", "openclaw.mjs"))
    ) {
      return path.resolve(current, "..", "..");
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error(`Unable to resolve OpenClaw repository root from ${cwd}`);
}

async function withTypeScriptLanguageService(input, options, run) {
  const root = realpathSync(
    resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env),
  );
  try {
    const requestedFile = safeResolve(root, input.file);
    const file = resolveExistingPathInside(root, requestedFile);
    if (!file) {
      throw new Error(`TypeScript file is outside the active workspace: ${input.file}`);
    }
    const sourceText = await fs.readFile(file, "utf8");
    const position = lineAndCharacterToPosition(sourceText, input.line, input.character);
    const ts = await import("typescript");
    const project = resolveTypeScriptProject(ts, root, file, options.env ?? process.env);
    const service = createTypeScriptLanguageService(ts, project);
    const resultPayload = await run({ ts, service, root, file, sourceText, position, project });
    return {
      schemaVersion: "openclaw.repo_workbench.typescript_lsp.v1",
      root,
      file: relative(root, file),
      line: input.line,
      character: input.character,
      projectRoot: relative(root, project.projectRoot),
      tsconfig: project.tsconfigPath ? relative(root, project.tsconfigPath) : undefined,
      projectMode: project.mode,
      projectFileCount: project.loadedFileCount?.() ?? project.fileNames.length,
      lspPartial: project.partial || project.fileLimitReached?.() === true,
      projectFileLimitReached: project.fileLimitReached?.() === true,
      ...resultPayload,
    };
  } catch (error) {
    return {
      schemaVersion: "openclaw.repo_workbench.typescript_lsp.v1",
      file: input.file,
      line: input.line,
      character: input.character,
      status: "error",
      error: formatError(error),
    };
  }
}

function resolveTypeScriptProject(ts, root, file, env = process.env) {
  const configPath = findNearestTsConfig(root, path.dirname(file));
  const projectMode = env.OPENCLAW_REPO_WORKBENCH_LSP_PROJECT_MODE?.trim();
  if (!configPath || projectMode === "single_file") {
    return singleFileTypeScriptProject(ts, file, {
      projectRoot: configPath ? path.dirname(configPath) : path.dirname(file),
      tsconfigPath: configPath,
      mode: configPath ? "single_file_bounded" : "single_file",
      partial: Boolean(configPath),
    });
  }
  const projectRoot = path.dirname(configPath);
  const parsed = parseTypeScriptConfigForFile(ts, root, configPath, file);
  return {
    workspaceRoot: root,
    projectRoot,
    tsconfigPath: configPath,
    fileNames: [file],
    maxLoadedFiles: readLspMaxLoadedFiles(env),
    mode: "tsconfig_dependency_closure",
    partial: true,
    options: {
      ...parsed.options,
      noLib: true,
      noResolve: false,
      skipLibCheck: true,
      types: [],
    },
  };
}

function parseTypeScriptConfigForFile(ts, root, configPath, file) {
  let fatalDiagnostic;
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      fileExists: (fileName) => resolveExistingPathInside(root, fileName) !== undefined,
      readFile: (fileName) => {
        const resolved = resolveExistingPathInside(root, fileName);
        return resolved ? ts.sys.readFile(resolved) : undefined;
      },
      readDirectory: () => [file],
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        fatalDiagnostic = diagnostic;
      },
    },
  );
  if (!parsed) {
    const detail = fatalDiagnostic
      ? formatTypeScriptDiagnostic(ts, fatalDiagnostic)
      : `unable to parse ${configPath}`;
    throw new Error(detail);
  }
  if (parsed.errors.length > 0) {
    throw new Error(formatTypeScriptDiagnostic(ts, parsed.errors[0]));
  }
  return parsed;
}

function readLspMaxLoadedFiles(env = process.env) {
  const raw = env.OPENCLAW_REPO_WORKBENCH_LSP_MAX_PROJECT_FILES?.trim();
  if (!raw) {
    return DEFAULT_LSP_MAX_LOADED_FILES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LSP_MAX_LOADED_FILES;
}

function singleFileTypeScriptProject(ts, file, metadata) {
  return {
    workspaceRoot: metadata.projectRoot,
    projectRoot: metadata.projectRoot,
    tsconfigPath: metadata.tsconfigPath,
    fileNames: [file],
    totalFileCount: 1,
    mode: metadata.mode,
    partial: metadata.partial,
    options: defaultTypeScriptOptions(ts),
  };
}

function defaultTypeScriptOptions(ts) {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeNext,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
  };
}

function findNearestTsConfig(root, startDir) {
  let current = path.resolve(startDir);
  while (current === root || isInside(root, current)) {
    const candidate = path.join(current, "tsconfig.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

function createTypeScriptLanguageService(ts, project) {
  const maxLoadedFiles = project.maxLoadedFiles ?? project.fileNames.length;
  const loadedFiles = new Set(project.fileNames.map((fileName) => path.resolve(fileName)));
  let fileLimitReached = false;
  const projectFiles = new Set(project.fileNames.map((fileName) => path.resolve(fileName)));
  project.loadedFileCount = () => loadedFiles.size;
  project.fileLimitReached = () => fileLimitReached;

  const resolveReadableFile = (fileName) => {
    const resolved = path.resolve(fileName);
    const canonical = resolveExistingPathInside(project.workspaceRoot, resolved);
    if (!canonical) {
      return undefined;
    }
    if (!isTypeScriptSourceFile(canonical) || loadedFiles.has(canonical)) {
      return canonical;
    }
    if (loadedFiles.size >= maxLoadedFiles) {
      fileLimitReached = true;
      return undefined;
    }
    loadedFiles.add(canonical);
    return canonical;
  };

  const isolated = project.mode === "single_file" || project.mode === "single_file_bounded";
  const host = {
    getCompilationSettings: () => project.options,
    getCurrentDirectory: () => project.projectRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => project.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const resolved = path.resolve(fileName);
      if (isolated && !projectFiles.has(resolved)) {
        return undefined;
      }
      const readable = resolveReadableFile(resolved);
      if (!readable) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(readFileSync(readable, "utf8"));
    },
    fileExists: (fileName) => {
      const resolved = path.resolve(fileName);
      return isolated ? projectFiles.has(resolved) : resolveReadableFile(resolved) !== undefined;
    },
    readFile: (fileName) => {
      const resolved = path.resolve(fileName);
      if (isolated && !projectFiles.has(resolved)) {
        return undefined;
      }
      const readable = resolveReadableFile(resolved);
      if (!readable) {
        return undefined;
      }
      return ts.sys.readFile(readable);
    },
    readDirectory: () => [],
    directoryExists: isolated
      ? () => false
      : (directoryName) =>
          isInside(project.workspaceRoot, path.resolve(directoryName)) &&
          ts.sys.directoryExists(directoryName),
    getDirectories: () => [],
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function isTypeScriptSourceFile(fileName) {
  return /(?:\.d)?\.(?:c|m)?(?:j|t)sx?$/iu.test(fileName);
}

function resolveExistingPathInside(root, candidate) {
  try {
    const canonical = realpathSync(path.resolve(candidate));
    return isInside(root, canonical) ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function lineAndCharacterToPosition(sourceText, line, character) {
  const lines = sourceText.split(/\r?\n/u);
  if (line > lines.length) {
    throw new Error(`line ${line} is outside file with ${lines.length} lines`);
  }
  const targetLine = lines[line - 1] ?? "";
  if (character > targetLine.length + 1) {
    throw new Error(
      `character ${character} is outside line ${line} with ${targetLine.length + 1} columns`,
    );
  }
  let position = 0;
  for (let index = 0; index < line - 1; index += 1) {
    position += lines[index].length + 1;
  }
  return position + character - 1;
}

function formatLspSpan(root, fileName, textSpan) {
  const resolved = path.resolve(fileName);
  const location = isInside(root, resolved)
    ? {
        path: relative(root, resolved),
        excluded: isPathExcluded(root, resolved),
      }
    : {
        path: resolved,
        outsideRoot: true,
      };
  let line = 1;
  let character = 1;
  try {
    const sourceText = readFileSync(resolved, "utf8");
    const lineAndCharacter = positionToLineAndCharacter(sourceText, textSpan.start);
    line = lineAndCharacter.line;
    character = lineAndCharacter.character;
  } catch {
    // Keep the file path even when a generated or external file cannot be read.
  }
  return {
    ...location,
    line,
    character,
    length: textSpan.length,
  };
}

function positionToLineAndCharacter(sourceText, position) {
  const prefix = sourceText.slice(0, position);
  const lines = prefix.split(/\r?\n/u);
  return {
    line: lines.length,
    character: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

function formatTypeScriptDiagnostic(ts, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  return diagnostic.file
    ? `${diagnostic.file.fileName}:${diagnostic.start ?? 0}: ${message}`
    : message;
}

function resolveSourceRoot(root, env = process.env) {
  const envSourceRoot = env.OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT?.trim();
  if (envSourceRoot) {
    const resolved = path.resolve(envSourceRoot);
    if (isInside(root, resolved) && existsSync(path.join(resolved, ".git"))) {
      return resolved;
    }
  }
  const nested = path.join(root, "src", "openclaw");
  return existsSync(path.join(nested, ".git")) ? nested : undefined;
}

function resolveGitRoots(root, env = process.env) {
  const roots = [];
  if (existsSync(path.join(root, ".git"))) {
    roots.push(root);
  }
  const sourceRoot = resolveSourceRoot(root, env);
  if (sourceRoot && !roots.includes(sourceRoot)) {
    roots.push(sourceRoot);
  }
  return roots.length > 0 ? roots : [root];
}

function expandGitRequestRoots(root, gitRoots, request) {
  if (request.path) {
    const requested = safeResolve(root, request.path, { allowExcluded: true });
    const containingRoot = gitRoots
      .filter((gitRoot) => requested === gitRoot || requested.startsWith(`${gitRoot}${path.sep}`))
      .toSorted((left, right) => right.length - left.length)[0];
    return [containingRoot ?? root];
  }
  return gitRoots;
}

async function runSearchQuery(root, query) {
  try {
    const searchRoot = safeResolve(root, query.path ?? ".");
    const maxMatches = clampPositiveInt(query.maxMatches, 80, MAX_RESULTS);
    const contextLines = Math.min(query.contextLines ?? 0, MAX_SEARCH_CONTEXT_LINES);
    const args = [
      "--line-number",
      "--no-heading",
      "--with-filename",
      "--color",
      "never",
      "--max-count",
      String(maxMatches),
    ];
    if (query.literal) {
      args.push("-F");
    }
    if (query.caseSensitive === false) {
      args.push("-i");
    }
    if (contextLines > 0) {
      args.push("-C", String(contextLines));
    }
    if (query.glob) {
      args.push("--glob", query.glob);
    }
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push("--", query.pattern, searchRoot);
    const output = await runCommand("rg", args, root, DEFAULT_OUTPUT_BYTES);
    const lines = output.stdout.split(/\r?\n/u).filter(Boolean).slice(0, maxMatches);
    const items = parseRipgrepItems(root, lines);
    return {
      request: query,
      pattern: query.pattern,
      path: relative(root, searchRoot),
      limits: {
        maxMatches,
        outputBytes: DEFAULT_OUTPUT_BYTES,
      },
      effectiveMaxMatches: maxMatches,
      effectiveContextLines: contextLines,
      ...(query.contextLines && query.contextLines > contextLines
        ? { requestedContextLines: query.contextLines, contextLinesClamped: true }
        : {}),
      ...(query.maxMatches && query.maxMatches > maxMatches
        ? { requestedMaxMatches: query.maxMatches, maxMatchesClamped: true }
        : {}),
      status: output.exitCode === 0 ? "matched" : output.exitCode === 1 ? "no_match" : "error",
      items,
      matches: lines,
      truncated: output.truncated || lines.length >= maxMatches,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return { pattern: query.pattern, status: "error", error: formatError(error) };
  }
}

async function readFileRequest(root, request) {
  try {
    const file = safeResolve(root, request.path);
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    const content = await fs.readFile(file, "utf8");
    const lines = content.split(/\r?\n/u);
    const startLine = request.startLine ?? 1;
    const endLine = request.endLine ?? lines.length;
    if (endLine < startLine) {
      throw new Error("endLine must be greater than or equal to startLine");
    }
    const selected = lines.slice(startLine - 1, endLine).join("\n");
    const maxBytes = clampPositiveInt(request.maxBytes, 24_000, MAX_READ_BYTES);
    const capped = capString(selected, maxBytes);
    const selectedByteLength = Buffer.byteLength(selected, "utf8");
    const lineNumberedContent = lines
      .slice(startLine - 1, Math.min(endLine, lines.length))
      .map((line, index) => `${startLine + index}: ${line}`)
      .join("\n");
    const cappedLineNumbered = capString(lineNumberedContent, maxBytes);
    return {
      request,
      path: relative(root, file),
      status: "ok",
      startLine,
      endLine: Math.min(endLine, lines.length),
      totalLines: lines.length,
      byteLength: selectedByteLength,
      contentByteLength: Buffer.byteLength(capped.value, "utf8"),
      sha256: sha256(selected),
      effectiveMaxBytes: maxBytes,
      ...(request.maxBytes && request.maxBytes > maxBytes
        ? { requestedMaxBytes: request.maxBytes, maxBytesClamped: true }
        : {}),
      content: capped.value,
      lineNumberedContent: cappedLineNumbered.value,
      truncated: capped.truncated,
    };
  } catch (error) {
    return { path: request.path, status: "error", error: formatError(error) };
  }
}

async function runGlobRequest(root, request) {
  try {
    const searchRoot = safeResolve(root, request.path ?? ".");
    const maxResults = clampPositiveInt(request.maxResults, 100, MAX_RESULTS);
    const args = ["--files", "--glob", request.pattern];
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push(searchRoot);
    const output = await runCommand("rg", args, root, DEFAULT_OUTPUT_BYTES);
    const files = output.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => relative(root, path.resolve(file)))
      .slice(0, maxResults);
    return {
      request,
      pattern: request.pattern,
      path: relative(root, searchRoot),
      limits: {
        maxResults,
        outputBytes: DEFAULT_OUTPUT_BYTES,
      },
      effectiveMaxResults: maxResults,
      ...(request.maxResults && request.maxResults > maxResults
        ? { requestedMaxResults: request.maxResults, maxResultsClamped: true }
        : {}),
      status: output.exitCode === 0 ? "ok" : output.exitCode === 1 ? "no_match" : "error",
      files,
      fileCount: files.length,
      truncated: output.truncated || files.length >= maxResults,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return { pattern: request.pattern, status: "error", error: formatError(error) };
  }
}

async function runGitRequest(root, gitRoot, request) {
  try {
    const maxBytes = clampPositiveInt(request.maxBytes, 48_000, DEFAULT_OUTPUT_BYTES);
    const requestedPath = request.path
      ? safeResolve(root, request.path, { allowExcluded: true })
      : undefined;
    const gitRelativePath = requestedPath
      ? path.relative(gitRoot, requestedPath) || "."
      : undefined;
    const pathArgs = gitRelativePath ? ["--", gitRelativePath] : [];
    let args;
    switch (request.kind) {
      case "status":
        args = ["status", "--short", ...pathArgs];
        break;
      case "diff_stat":
        args = ["diff", "--stat", ...pathArgs];
        break;
      case "changed_files":
        args = ["diff", "--name-only", ...pathArgs];
        break;
      case "diff_hunks":
        args = ["diff", "--unified=3", ...pathArgs];
        break;
      default:
        throw new Error(`unsupported git inspect kind ${request.kind}`);
    }
    const output = await runCommand(
      "git",
      ["-c", `safe.directory=${gitRoot}`, ...args],
      gitRoot,
      maxBytes,
    );
    const cappedStdout = capString(output.stdout, maxBytes);
    return {
      request,
      kind: request.kind,
      repoRoot: relative(root, gitRoot),
      repoRootLabel: gitRoot === root ? "workspace" : "nested_source",
      path: request.path ?? ".",
      status: output.exitCode === 0 ? "ok" : "error",
      limits: {
        maxBytes,
      },
      effectiveMaxBytes: maxBytes,
      ...(request.maxBytes && request.maxBytes > maxBytes
        ? { requestedMaxBytes: request.maxBytes, maxBytesClamped: true }
        : {}),
      stdout: cappedStdout.value,
      truncated: output.truncated || cappedStdout.truncated,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return {
      kind: request.kind,
      path: request.path ?? ".",
      status: "error",
      error: formatError(error),
    };
  }
}

function clampPositiveInt(value, defaultValue, maxValue) {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(1, Math.trunc(value)), maxValue);
}

async function runCommand(command, args, cwd, maxBytes) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: maxBytes + 8192,
    });
    return outputResult(0, stdout, stderr, maxBytes);
  } catch (error) {
    return outputResult(
      error.code ?? 2,
      error.stdout ?? "",
      error.stderr ?? formatError(error),
      maxBytes,
    );
  }
}

function outputResult(exitCode, stdout, stderr, maxBytes) {
  const cappedStdout = capString(stdout, maxBytes);
  const cappedStderr = capString(stderr, 8192);
  return {
    exitCode,
    stdout: cappedStdout.value,
    stderr: cappedStderr.value,
    truncated: cappedStdout.truncated || cappedStderr.truncated,
  };
}

function parseRipgrepItems(root, lines) {
  return lines.map((line) => {
    const parsed = /^(.*?)([:-])(\d+)\2(.*)$/u.exec(line);
    if (!parsed) {
      return { text: line };
    }
    const [, filePath, separator, lineNumber, text] = parsed;
    const resolved = path.resolve(filePath);
    const displayPath = isInside(root, resolved) ? relative(root, resolved) : filePath;
    return {
      path: displayPath,
      line: Number.parseInt(lineNumber, 10),
      text,
      ...(separator === "-" ? { context: true } : {}),
    };
  });
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeResolve(root, requestedPath, options = {}) {
  const resolved = path.resolve(root, requestedPath);
  if (!isInside(root, resolved)) {
    throw new Error(`path escapes repository root: ${requestedPath}`);
  }
  if (options.allowExcluded !== true) {
    assertNotExcluded(root, resolved);
  }
  return resolved;
}

function assertNotExcluded(root, resolved) {
  if (isPathExcluded(root, resolved)) {
    const rel = toPosix(relative(root, resolved));
    throw new Error(`path is excluded from workbench access by default: ${rel}`);
  }
}

function isPathExcluded(root, resolved) {
  const rel = toPosix(relative(root, resolved));
  if (!rel || rel === ".") {
    return false;
  }
  for (const glob of DEFAULT_EXCLUDE_GLOBS) {
    if (matchesExcludedGlob(rel, glob)) {
      return true;
    }
  }
  return false;
}

function matchesExcludedGlob(rel, glob) {
  const normalized = toPosix(rel);
  const pattern = toPosix(glob);
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const segment = pattern.slice(3, -3);
    return normalized.includes(`/${segment}/`) || normalized.startsWith(`${segment}/`);
  }
  if (pattern.startsWith("**/*")) {
    const needle = pattern.slice(4).replaceAll("*", "").toLowerCase();
    return needle.length > 0 && normalized.toLowerCase().includes(needle);
  }
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern
        .split("*")
        .map((part) => escapeRegExp(part))
        .join(".*")}$`,
      "iu",
    );
    const basenameRegex = new RegExp(
      `(^|/)${pattern
        .split("*")
        .map((part) => escapeRegExp(part))
        .join(".*")}$`,
      "iu",
    );
    return regex.test(normalized) || basenameRegex.test(normalized);
  }
  if (pattern.startsWith("*.")) {
    return normalized.endsWith(pattern.slice(1));
  }
  return normalized === pattern || normalized.endsWith(`/${pattern}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isInside(root, resolved) {
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function relative(root, file) {
  return path.relative(root, file) || ".";
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/");
}

function capString(value, maxBytes) {
  const buffer = Buffer.from(value ?? "", "utf8");
  if (buffer.length <= maxBytes) {
    return { value: value ?? "", truncated: false };
  }
  return { value: buffer.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

function result(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
