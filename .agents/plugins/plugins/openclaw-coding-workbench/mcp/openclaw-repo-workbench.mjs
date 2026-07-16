#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
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
const DEFAULT_SEARCH_MATCHES = 20;
const MAX_SEARCH_MATCHES = 60;
const MAX_SEARCH_COMMAND_BYTES = 12_000;
const MAX_SEARCH_RESPONSE_BYTES = 16_000;
const DEFAULT_READ_BYTES = 10_000;
const MAX_READ_BYTES = 12_000;
const MAX_READ_TEXT_BYTES = 20_000;
const MAX_READ_RESPONSE_BYTES = 32_000;
const MAX_ARTIFACT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RESULTS = 200;
const MAX_SEARCH_CONTEXT_LINES = 5;
const DEFAULT_LSP_MAX_LOADED_FILES = 24;
const PositiveIntSchema = z.number().int().min(1);
const DEFAULT_SEARCH_EXCLUSION_POLICY = "default";
const DEFAULT_EXCLUDE_GLOBS = [
  "**/.git/**",
  "**/node_modules/**",
  "**/generated/**",
  "**/.cache/**",
  "**/.artifacts/**",
  "**/vendor/**",
  "**/runtime-state/**",
  ".openclaw/**",
  "artifacts/**",
  "cache/**",
  "state/**",
  "transcripts/**",
  "sessions/**",
  "logs/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.next/**",
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
  path: z
    .string()
    .optional()
    .describe(
      'Optional workspace-relative root. Omit or use "." for one bounded ownership/location discovery query when the owner path is unresolved; use a narrower path once the owner is known.',
    ),
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
    `Optional match cap. Values above ${MAX_SEARCH_MATCHES} are accepted and clamped. Narrow the pattern or path when truncated.`,
  ),
});

const ReadRequestSchema = z.object({
  path: z.string().min(1).max(512),
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
  line: z
    .number()
    .int()
    .min(1)
    .describe("1-based source line. Reuse repo_search_many items[].line when available."),
  character: z
    .number()
    .int()
    .min(1)
    .describe(
      "1-based source character. Reuse repo_search_many items[].character from the matching line.",
    ),
  maxResults: PositiveIntSchema.optional().describe(
    `Optional result cap. Values above ${MAX_RESULTS} are accepted and clamped.`,
  ),
});
const ArtifactImageRequestSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(512)
    .describe("Workspace-relative path to a PNG, JPEG, GIF, or WebP visual artifact."),
});

const LooseResultSchema = z.object({}).passthrough();
const BatchOutputSchema = z
  .object({
    schemaVersion: z.string(),
    root: z.string(),
    results: z.array(LooseResultSchema),
  })
  .passthrough();
const SearchItemOutputSchema = z
  .object({
    path: z.string().optional(),
    line: z.number().int().positive().optional(),
    character: z.number().int().positive().optional(),
    text: z.string(),
    context: z.boolean().optional(),
  })
  .passthrough();
const SearchScopeOutputSchema = z.object({
  mode: z.enum(["default_authored_config", "explicit_glob"]),
  glob: z.string().optional(),
  hiddenIncluded: z.boolean(),
  ignoreFilesRespected: z.boolean(),
});
const SearchExclusionsOutputSchema = z.object({
  policy: z.literal(DEFAULT_SEARCH_EXCLUSION_POLICY),
  count: z.number().int().nonnegative(),
});
const SearchContinuationOutputSchema = z.object({
  complete: z.boolean(),
  hasMore: z.boolean(),
  nextAction: z.enum(["none", "narrow_pattern_or_path", "fix_query_or_path"]),
});
const SearchResultOutputSchema = z
  .object({
    pattern: z.string(),
    path: z.string(),
    searchedRoots: z.array(z.string()),
    scope: SearchScopeOutputSchema,
    appliedExclusions: SearchExclusionsOutputSchema,
    limits: z.object({
      maxMatches: z.number().int().positive(),
      outputBytes: z.number().int().positive(),
    }),
    effectiveMaxMatches: z.number().int().positive(),
    effectiveContextLines: z.number().int().nonnegative(),
    requestedMaxMatches: z.number().int().positive().optional(),
    maxMatchesClamped: z.boolean().optional(),
    requestedContextLines: z.number().int().nonnegative().optional(),
    contextLinesClamped: z.boolean().optional(),
    status: z.enum(["matched", "no_match", "error"]),
    items: z.array(SearchItemOutputSchema),
    totalItems: z.number().int().nonnegative(),
    returnedItems: z.number().int().nonnegative(),
    omittedItems: z.number().int().nonnegative(),
    omittedItemsExact: z.boolean(),
    truncated: z.boolean(),
    commandOutputTruncated: z.boolean(),
    responseTruncated: z.boolean(),
    aggregateOmittedItems: z.number().int().nonnegative(),
    searchComplete: z.boolean(),
    continuation: SearchContinuationOutputSchema,
    nextAction: z.enum(["none", "narrow_pattern_or_path", "fix_query_or_path"]),
    stderr: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();
const SearchManyOutputSchema = z.object({
  schemaVersion: z.literal("openclaw.repo_workbench.search_many.v2"),
  root: z.string(),
  limits: z.object({
    defaultMatchesPerQuery: z.number().int(),
    maxMatchesPerQuery: z.number().int(),
    maxResponseBytes: z.number().int(),
  }),
  exclusionPolicies: z.object({
    default: z.array(z.string()),
  }),
  results: z.array(SearchResultOutputSchema),
  coverage: z.object({
    requestedQueries: z.number().int(),
    matchedQueries: z.number().int(),
    returnedItems: z.number().int(),
    omittedItems: z.number().int(),
    omittedItemsExact: z.boolean(),
  }),
});
const Sha256OutputSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const FileIdentityOutputSchema = z.object({
  bytes: z.number().int().nonnegative(),
  sha256: Sha256OutputSchema,
});
const SelectedRangeIdentityOutputSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  sha256: Sha256OutputSchema,
});
const ReadResultOutputSchema = z.object({
  path: z.string(),
  status: z.enum(["ok", "error"]),
  requestedStartLine: z.number().int().optional(),
  requestedEndLine: z.number().int().optional(),
  returnedStartLine: z.number().int().optional(),
  returnedEndLine: z.number().int().optional(),
  totalLines: z.number().int().optional(),
  file: FileIdentityOutputSchema.optional(),
  selectedRange: SelectedRangeIdentityOutputSchema.optional(),
  returnedBytes: z.number().int().optional(),
  effectiveMaxBytes: z.number().int().optional(),
  requestedMaxBytes: z.number().int().optional(),
  maxBytesClamped: z.boolean().optional(),
  text: z.string().optional(),
  truncated: z.boolean().optional(),
  nextStartLine: z.number().int().optional(),
  error: z.string().optional(),
});
const OmittedReadOutputSchema = z.object({
  path: z.string(),
  requestedStartLine: z.number().int(),
  requestedEndLine: z.number().int(),
  totalLines: z.number().int(),
  file: FileIdentityOutputSchema,
  selectedRange: SelectedRangeIdentityOutputSchema,
  nextStartLine: z.number().int(),
  reason: z.enum(["aggregate_text_budget", "aggregate_response_budget"]),
});
const ReadManyOutputSchema = z.object({
  schemaVersion: z.literal("openclaw.repo_workbench.read_many.v2"),
  root: z.string(),
  limits: z.object({
    defaultFileBytes: z.number().int(),
    maxFileBytes: z.number().int(),
    maxTextBytes: z.number().int(),
    maxResponseBytes: z.number().int(),
  }),
  results: z.array(ReadResultOutputSchema),
  omitted: z.array(OmittedReadOutputSchema),
  coverage: z.object({
    requested: z.number().int(),
    returned: z.number().int(),
    truncated: z.number().int(),
    errors: z.number().int(),
    omitted: z.number().int(),
  }),
});
const LspOutputSchema = z.object({ status: z.string() }).passthrough();
const ArtifactImageOutputSchema = z.object({
  schemaVersion: z.literal("openclaw.repo_workbench.artifact_view_image.v1"),
  status: z.enum(["ok", "error"]),
  path: z.string(),
  mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]).optional(),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  bytes: z.number().int().positive().optional(),
  error: z.string().optional(),
});

server.registerTool(
  "artifact_view_image",
  {
    title: "View Artifact Image",
    description:
      "Return one bounded workspace-contained raster artifact as native MCP image content. Supports signature-verified PNG, JPEG, GIF, and WebP files up to 5 MiB; metadata contains no duplicate image bytes.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: ArtifactImageOutputSchema,
    inputSchema: ArtifactImageRequestSchema,
  },
  async (input) => await artifactViewImage(input),
);

server.registerTool(
  "repo_search_many",
  {
    title: "Search Many",
    description:
      "Preferred broad-discovery tool: run multiple independent bounded ripgrep searches concurrently under the active workspace root. No-glob searches include hidden authored/config authority such as .agents and .codex; an explicit glob is applied exactly as supplied. Results report scope, exclusions, exact omissions, and continuation status while retaining the 16 KB response cap.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: SearchManyOutputSchema,
    inputSchema: z.object({
      queries: z.array(SearchQuerySchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => mcpResult(await repoSearchMany(input)),
);

server.registerTool(
  "repo_read_many",
  {
    title: "Read Many",
    description:
      "Preferred multi-file read tool: read bounded line ranges under the active workspace root. Results identify the exact whole file and normalized selected range, use one line-numbered text field, clamp each file to 12 KB, cap the complete response at 32 KB, name omitted files, and return nextStartLine for exact continuation.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: ReadManyOutputSchema,
    inputSchema: z.object({
      files: z.array(ReadRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => mcpResult(await repoReadMany(input)),
);

server.registerTool(
  "repo_glob_many",
  {
    title: "Glob Many",
    description:
      "Preferred broad file-discovery tool: resolve multiple bounded globs concurrently under the active workspace root.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: BatchOutputSchema,
    inputSchema: z.object({
      globs: z.array(GlobRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => mcpResult(await repoGlobMany(input)),
);

server.registerTool(
  "git_inspect_many",
  {
    title: "Git Inspect Many",
    description:
      "Preferred diff/status discovery tool: inspect the workspace and nested source git roots with bounded read-only requests.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: BatchOutputSchema,
    inputSchema: z.object({
      requests: z.array(GitRequestSchema).min(1).max(MAX_BATCH_ITEMS),
    }),
  },
  async (input) => mcpResult(await gitInspectMany(input)),
);

server.registerTool(
  "lsp_hover_typescript",
  {
    title: "TypeScript Hover",
    description:
      "Return bounded TypeScript language-service hover details for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: LspOutputSchema,
    inputSchema: LspLocationSchema,
  },
  async (input) => mcpResult(await lspHoverTypescript(input)),
);

server.registerTool(
  "lsp_definition_typescript",
  {
    title: "TypeScript Definition",
    description:
      "Return bounded cross-file TypeScript language-service definition locations for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: LspOutputSchema,
    inputSchema: LspLocationSchema,
  },
  async (input) => mcpResult(await lspDefinitionTypescript(input)),
);

server.registerTool(
  "lsp_references_typescript",
  {
    title: "TypeScript References",
    description:
      "Return bounded TypeScript language-service references for a workspace file position.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    outputSchema: LspOutputSchema,
    inputSchema: LspLocationSchema,
  },
  async (input) => mcpResult(await lspReferencesTypescript(input)),
);

if (isMainModule()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function repoSearchMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const queries = input.queries.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(queries.map((query) => runSearchQuery(root, query)));
  return fitSearchManyResponse(root, queries.length, results);
}

export async function repoReadMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const files = input.files.slice(0, MAX_BATCH_ITEMS);
  const rawResults = await Promise.all(files.map((request) => readFileRequest(root, request)));
  return fitReadManyResponse(root, files, rawResults);
}

export async function artifactViewImage(input, options = {}) {
  const requestedPath = input.path;
  try {
    const root = realpathSync(
      resolveRepoRoot(options.cwd ?? process.cwd(), options.env ?? process.env),
    );
    // Artifact images can live under the workspace artifact directory, but must still
    // resolve to a regular file inside the canonical workspace root.
    const requested = safeResolve(root, requestedPath, { allowExcluded: true });
    const file = await fs.realpath(requested);
    if (!isInside(root, file)) {
      throw new Error(`path escapes repository root through symlink: ${requestedPath}`);
    }
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    if (stat.size <= 0) {
      throw new Error("image file is empty");
    }
    if (stat.size > MAX_ARTIFACT_IMAGE_BYTES) {
      throw new Error(`image exceeds ${MAX_ARTIFACT_IMAGE_BYTES}-byte limit`);
    }
    const data = await fs.readFile(file);
    if (data.length !== stat.size) {
      throw new Error("image changed while being read");
    }
    const raster = inspectRasterImage(data);
    if (!raster) {
      throw new Error("unsupported or invalid raster image; expected PNG, JPEG, GIF, or WebP");
    }
    const metadata = {
      schemaVersion: "openclaw.repo_workbench.artifact_view_image.v1",
      status: "ok",
      path: relative(root, file),
      mediaType: raster.mediaType,
      ...(raster.dimensions ? { dimensions: raster.dimensions } : {}),
      sha256: sha256(data),
      bytes: data.length,
    };
    return {
      structuredContent: metadata,
      content: [{ type: "image", data: data.toString("base64"), mimeType: raster.mediaType }],
    };
  } catch (error) {
    return {
      structuredContent: {
        schemaVersion: "openclaw.repo_workbench.artifact_view_image.v1",
        status: "error",
        path: requestedPath,
        error: formatError(error),
      },
      content: [],
    };
  }
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
  const requestedPath = query.path ?? ".";
  const maxMatches = clampPositiveInt(query.maxMatches, DEFAULT_SEARCH_MATCHES, MAX_SEARCH_MATCHES);
  const contextLines = Math.min(query.contextLines ?? 0, MAX_SEARCH_CONTEXT_LINES);
  const common = {
    pattern: query.pattern,
    path: requestedPath,
    searchedRoots: [],
    scope: {
      mode: query.glob === undefined ? "default_authored_config" : "explicit_glob",
      ...(query.glob === undefined ? {} : { glob: query.glob }),
      hiddenIncluded: true,
      ignoreFilesRespected: true,
    },
    appliedExclusions: {
      policy: DEFAULT_SEARCH_EXCLUSION_POLICY,
      count: DEFAULT_EXCLUDE_GLOBS.length,
    },
    limits: {
      maxMatches,
      outputBytes: MAX_SEARCH_COMMAND_BYTES,
    },
    effectiveMaxMatches: maxMatches,
    effectiveContextLines: contextLines,
    ...(query.contextLines && query.contextLines > contextLines
      ? { requestedContextLines: query.contextLines, contextLinesClamped: true }
      : {}),
    ...(query.maxMatches && query.maxMatches > maxMatches
      ? { requestedMaxMatches: query.maxMatches, maxMatchesClamped: true }
      : {}),
  };
  try {
    const searchRoot = safeResolve(root, requestedPath);
    const searchPath = relative(root, searchRoot);
    const args = [
      "--hidden",
      "--no-config",
      "--line-number",
      "--column",
      "--no-heading",
      "--with-filename",
      "--color",
      "never",
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
    if (query.glob !== undefined) {
      args.push("--glob", query.glob);
    }
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push("--", query.pattern, searchRoot);
    const output = await runBoundedCommand("rg", args, root, MAX_SEARCH_COMMAND_BYTES);
    const lines = output.stdout.split(/\r?\n/u).filter(Boolean).slice(0, maxMatches);
    const items = parseRipgrepItems(root, lines);
    const searchComplete = !output.timedOut && (output.exitCode === 0 || output.exitCode === 1);
    const totalItems = Math.max(items.length, output.totalOutputLines);
    const omittedItems = Math.max(0, totalItems - items.length);
    const status = output.exitCode === 0 ? "matched" : output.exitCode === 1 ? "no_match" : "error";
    const continuation = searchContinuation(status, searchComplete, omittedItems);
    return {
      ...common,
      path: searchPath,
      searchedRoots: [searchPath],
      status,
      items,
      totalItems,
      returnedItems: items.length,
      omittedItems,
      omittedItemsExact: searchComplete,
      truncated: omittedItems > 0,
      commandOutputTruncated: output.truncated,
      responseTruncated: false,
      aggregateOmittedItems: 0,
      searchComplete,
      continuation,
      nextAction: continuation.nextAction,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    const continuation = searchContinuation("error", false, 0);
    return {
      ...common,
      status: "error",
      items: [],
      totalItems: 0,
      returnedItems: 0,
      omittedItems: 0,
      omittedItemsExact: false,
      truncated: false,
      commandOutputTruncated: false,
      responseTruncated: false,
      aggregateOmittedItems: 0,
      searchComplete: false,
      continuation,
      nextAction: continuation.nextAction,
      error: formatError(error),
    };
  }
}

function searchContinuation(status, searchComplete, omittedItems) {
  if (status === "error" || !searchComplete) {
    return { complete: false, hasMore: false, nextAction: "fix_query_or_path" };
  }
  if (omittedItems > 0) {
    return { complete: false, hasMore: true, nextAction: "narrow_pattern_or_path" };
  }
  return { complete: true, hasMore: false, nextAction: "none" };
}

function fitSearchManyResponse(root, requestedQueries, rawResults) {
  const results = rawResults.map((result) => ({
    ...result,
    items: Array.isArray(result.items) ? [...result.items] : [],
  }));
  const omittedByResult = new Map();
  let response = buildSearchManyResponse(root, requestedQueries, results, omittedByResult);

  while (serializedBytes(response) > MAX_SEARCH_RESPONSE_BYTES) {
    const candidate = results
      .filter((result) => Array.isArray(result.items) && result.items.length > 0)
      .toSorted((left, right) => right.items.length - left.items.length)[0];
    if (!candidate) {
      break;
    }
    candidate.items.pop();
    omittedByResult.set(candidate, (omittedByResult.get(candidate) ?? 0) + 1);
    response = buildSearchManyResponse(root, requestedQueries, results, omittedByResult);
  }

  return response;
}

function buildSearchManyResponse(root, requestedQueries, results, omittedByResult) {
  const normalizedResults = results.map((result) => {
    const aggregateOmittedItems = omittedByResult.get(result) ?? 0;
    const returnedItems = result.items.length;
    const omittedItems = result.omittedItemsExact
      ? Math.max(0, result.totalItems - returnedItems)
      : result.omittedItems + aggregateOmittedItems;
    const continuation = searchContinuation(result.status, result.searchComplete, omittedItems);
    return {
      ...result,
      returnedItems,
      omittedItems,
      truncated: result.truncated || aggregateOmittedItems > 0,
      responseTruncated: aggregateOmittedItems > 0,
      aggregateOmittedItems,
      continuation,
      nextAction: continuation.nextAction,
    };
  });
  return {
    schemaVersion: "openclaw.repo_workbench.search_many.v2",
    root,
    limits: {
      defaultMatchesPerQuery: DEFAULT_SEARCH_MATCHES,
      maxMatchesPerQuery: MAX_SEARCH_MATCHES,
      maxResponseBytes: MAX_SEARCH_RESPONSE_BYTES,
    },
    exclusionPolicies: {
      [DEFAULT_SEARCH_EXCLUSION_POLICY]: DEFAULT_EXCLUDE_GLOBS,
    },
    results: normalizedResults,
    coverage: {
      requestedQueries,
      matchedQueries: normalizedResults.filter((result) => result.status === "matched").length,
      returnedItems: normalizedResults.reduce(
        (total, result) => total + (Array.isArray(result.items) ? result.items.length : 0),
        0,
      ),
      omittedItems: normalizedResults.reduce(
        (total, result) => total + (result.omittedItems ?? 0),
        0,
      ),
      omittedItemsExact: normalizedResults.every((result) => result.omittedItemsExact),
    },
  };
}

async function readFileRequest(root, request) {
  try {
    const file = safeResolve(root, request.path);
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    const data = await fs.readFile(file);
    const content = data.toString("utf8");
    const lines = content.split(/\r?\n/u);
    const requestedStartLine = request.startLine ?? 1;
    const requestedEndLine = request.endLine ?? lines.length;
    if (requestedEndLine < requestedStartLine) {
      throw new Error("endLine must be greater than or equal to startLine");
    }
    if (requestedStartLine > lines.length) {
      throw new Error(`startLine ${requestedStartLine} exceeds total lines ${lines.length}`);
    }
    const effectiveEndLine = Math.min(requestedEndLine, lines.length);
    const selectedLines = lines.slice(requestedStartLine - 1, effectiveEndLine);
    const selected = selectedLines.join("\n");
    const maxBytes = clampPositiveInt(request.maxBytes, DEFAULT_READ_BYTES, MAX_READ_BYTES);
    const numbered = takeNumberedLines(selectedLines, requestedStartLine, maxBytes);
    if (numbered.returnedEndLine < requestedStartLine) {
      throw new Error(
        `line ${requestedStartLine} exceeds the ${maxBytes}-byte per-file read budget; use a focused shell read for this exceptional file`,
      );
    }
    const selectedByteLength = Buffer.byteLength(selected, "utf8");
    const selectedSha256 = sha256(selected);
    const truncated = numbered.returnedEndLine < effectiveEndLine;
    return {
      path: relative(root, file),
      status: "ok",
      requestedStartLine,
      requestedEndLine,
      returnedStartLine: requestedStartLine,
      returnedEndLine: numbered.returnedEndLine,
      totalLines: lines.length,
      file: {
        bytes: data.length,
        sha256: sha256(data),
      },
      selectedRange: {
        startLine: requestedStartLine,
        endLine: effectiveEndLine,
        bytes: selectedByteLength,
        sha256: selectedSha256,
      },
      returnedBytes: numbered.returnedBytes,
      effectiveMaxBytes: maxBytes,
      ...(request.maxBytes && request.maxBytes > maxBytes
        ? { requestedMaxBytes: request.maxBytes, maxBytesClamped: true }
        : {}),
      text: numbered.text,
      truncated,
      ...(truncated ? { nextStartLine: numbered.returnedEndLine + 1 } : {}),
    };
  } catch (error) {
    return { path: request.path, status: "error", error: formatError(error) };
  }
}

function takeNumberedLines(lines, startLine, maxBytes) {
  const selected = [];
  let returnedBytes = 0;
  let returnedEndLine = startLine - 1;
  for (const [index, line] of lines.entries()) {
    const numberedLine = `${startLine + index}: ${line}`;
    const separatorBytes = selected.length > 0 ? 1 : 0;
    const lineBytes = Buffer.byteLength(numberedLine, "utf8");
    if (returnedBytes + separatorBytes + lineBytes > maxBytes) {
      break;
    }
    selected.push(numberedLine);
    returnedBytes += separatorBytes + lineBytes;
    returnedEndLine = startLine + index;
  }
  return { text: selected.join("\n"), returnedBytes, returnedEndLine };
}

function fitReadManyResponse(root, requests, rawResults) {
  const results = [];
  const omitted = [];
  const resultRequests = new Map();
  let remainingTextBytes = MAX_READ_TEXT_BYTES;

  for (const [index, rawResult] of rawResults.entries()) {
    const request = requests[index];
    if (rawResult.status !== "ok") {
      results.push(rawResult);
      resultRequests.set(rawResult, request);
      continue;
    }
    if (remainingTextBytes <= 0) {
      omitted.push(omittedRead(request, rawResult, "aggregate_text_budget"));
      continue;
    }
    const fitted = fitReadResultText(rawResult, remainingTextBytes);
    if (!fitted) {
      omitted.push(omittedRead(request, rawResult, "aggregate_text_budget"));
      continue;
    }
    results.push(fitted);
    resultRequests.set(fitted, request);
    remainingTextBytes -= fitted.returnedBytes;
  }

  let response = buildReadManyResponse(root, requests.length, results, omitted);
  while (serializedBytes(response) > MAX_READ_RESPONSE_BYTES && results.length > 0) {
    const removed = results.pop();
    omitted.unshift(
      omittedRead(
        resultRequests.get(removed) ?? { path: removed.path },
        removed,
        "aggregate_response_budget",
      ),
    );
    response = buildReadManyResponse(root, requests.length, results, omitted);
  }
  return response;
}

function fitReadResultText(result, maxBytes) {
  if (result.returnedBytes <= maxBytes) {
    return result;
  }
  const lines = result.text.split("\n");
  const selected = [];
  let returnedBytes = 0;
  for (const line of lines) {
    const separatorBytes = selected.length > 0 ? 1 : 0;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (returnedBytes + separatorBytes + lineBytes > maxBytes) {
      break;
    }
    selected.push(line);
    returnedBytes += separatorBytes + lineBytes;
  }
  if (selected.length === 0) {
    return undefined;
  }
  const returnedEndLine = result.returnedStartLine + selected.length - 1;
  return {
    ...result,
    returnedEndLine,
    returnedBytes,
    text: selected.join("\n"),
    truncated: true,
    nextStartLine: returnedEndLine + 1,
  };
}

function omittedRead(request, result, reason) {
  return {
    path: result.path ?? request.path,
    requestedStartLine: request.startLine ?? 1,
    requestedEndLine: request.endLine ?? result.totalLines,
    totalLines: result.totalLines,
    file: result.file,
    selectedRange: result.selectedRange,
    nextStartLine: result.nextStartLine ?? result.returnedStartLine ?? request.startLine ?? 1,
    reason,
  };
}

function buildReadManyResponse(root, requested, results, omitted) {
  return {
    schemaVersion: "openclaw.repo_workbench.read_many.v2",
    root,
    limits: {
      defaultFileBytes: DEFAULT_READ_BYTES,
      maxFileBytes: MAX_READ_BYTES,
      maxTextBytes: MAX_READ_TEXT_BYTES,
      maxResponseBytes: MAX_READ_RESPONSE_BYTES,
    },
    results,
    omitted,
    coverage: {
      requested,
      returned: results.filter((item) => item.status === "ok").length,
      truncated: results.filter((item) => item.status === "ok" && item.truncated).length,
      errors: results.filter((item) => item.status === "error").length,
      omitted: omitted.length,
    },
  };
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
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

async function runBoundedCommand(command, args, cwd, maxBytes) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutNewlines = 0;
    let stdoutSeen = false;
    let stdoutEndsWithNewline = true;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const finish = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      let stdout = Buffer.concat(stdoutChunks).toString("utf8");
      if (truncated) {
        const lastNewline = stdout.lastIndexOf("\n");
        stdout = lastNewline >= 0 ? stdout.slice(0, lastNewline + 1) : "";
      }
      resolve({
        exitCode: timedOut ? 124 : (exitCode ?? 2),
        stdout,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        truncated,
        timedOut,
        totalOutputLines: stdoutNewlines + (stdoutSeen && !stdoutEndsWithNewline ? 1 : 0),
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      stdoutSeen ||= buffer.length > 0;
      stdoutEndsWithNewline = buffer.length === 0 ? stdoutEndsWithNewline : buffer.at(-1) === 0x0a;
      let newlineIndex = buffer.indexOf(0x0a);
      while (newlineIndex >= 0) {
        stdoutNewlines += 1;
        newlineIndex = buffer.indexOf(0x0a, newlineIndex + 1);
      }
      if (truncated) {
        return;
      }
      const remaining = maxBytes - stdoutBytes;
      if (buffer.length > remaining) {
        if (remaining > 0) {
          stdoutChunks.push(buffer.subarray(0, remaining));
          stdoutBytes += remaining;
        }
        truncated = true;
        return;
      }
      stdoutChunks.push(buffer);
      stdoutBytes += buffer.length;
    });
    child.stderr.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      const remaining = 8192 - stderrBytes;
      if (remaining > 0) {
        stderrChunks.push(buffer.subarray(0, remaining));
        stderrBytes += Math.min(buffer.length, remaining);
      }
    });
    child.on("error", (error) => {
      stderrChunks.push(Buffer.from(formatError(error)));
      finish(2);
    });
    child.on("close", (code) => finish(code));
  });
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
    const match = /^(.*?):(\d+):(\d+):(.*)$/u.exec(line);
    if (match) {
      const [, filePath, lineNumber, character, text] = match;
      const resolved = path.resolve(filePath);
      const displayPath = isInside(root, resolved) ? relative(root, resolved) : filePath;
      return {
        path: displayPath,
        line: Number.parseInt(lineNumber, 10),
        character: Number.parseInt(character, 10),
        text,
      };
    }
    const context = /^(.*?)-(\d+)-(.*)$/u.exec(line);
    if (!context) {
      return { text: line };
    }
    const [, filePath, lineNumber, text] = context;
    const resolved = path.resolve(filePath);
    const displayPath = isInside(root, resolved) ? relative(root, resolved) : filePath;
    return {
      path: displayPath,
      line: Number.parseInt(lineNumber, 10),
      text,
      context: true,
    };
  });
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function inspectRasterImage(data) {
  return inspectPng(data) ?? inspectJpeg(data) ?? inspectGif(data) ?? inspectWebp(data);
}

function inspectPng(data) {
  const signature = "89504e470d0a1a0a";
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== signature) {
    return undefined;
  }
  if (data.subarray(12, 16).toString("ascii") !== "IHDR") {
    return undefined;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return width > 0 && height > 0
    ? { mediaType: "image/png", dimensions: { width, height } }
    : undefined;
}

function inspectGif(data) {
  if (data.length < 10 || !["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"))) {
    return undefined;
  }
  const width = data.readUInt16LE(6);
  const height = data.readUInt16LE(8);
  return width > 0 && height > 0
    ? { mediaType: "image/gif", dimensions: { width, height } }
    : undefined;
}

function inspectJpeg(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 8 <= data.length) {
    if (data[offset] !== 0xff) {
      return undefined;
    }
    while (data[offset] === 0xff) {
      offset += 1;
    }
    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || marker === undefined || offset + 2 > data.length) {
      return undefined;
    }
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      return undefined;
    }
    if (isJpegStartOfFrame(marker) && segmentLength >= 8) {
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      return width > 0 && height > 0
        ? { mediaType: "image/jpeg", dimensions: { width, height } }
        : undefined;
    }
    offset += segmentLength;
  }
  return undefined;
}

function isJpegStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function inspectWebp(data) {
  if (
    data.length < 20 ||
    data.subarray(0, 4).toString("ascii") !== "RIFF" ||
    data.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return undefined;
  }
  const chunkType = data.subarray(12, 16).toString("ascii");
  const chunkLength = data.readUInt32LE(16);
  if (20 + chunkLength > data.length) {
    return undefined;
  }
  if (chunkType === "VP8X" && chunkLength >= 10) {
    const width = data.readUIntLE(24, 3) + 1;
    const height = data.readUIntLE(27, 3) + 1;
    return { mediaType: "image/webp", dimensions: { width, height } };
  }
  if (
    chunkType === "VP8 " &&
    chunkLength >= 10 &&
    data[23] === 0x9d &&
    data[24] === 0x01 &&
    data[25] === 0x2a
  ) {
    const width = data.readUInt16LE(26) & 0x3fff;
    const height = data.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0
      ? { mediaType: "image/webp", dimensions: { width, height } }
      : undefined;
  }
  if (chunkType === "VP8L" && chunkLength >= 5 && data[20] === 0x2f) {
    const width = 1 + data[21] + ((data[22] & 0x3f) << 8);
    const height = 1 + ((data[22] & 0xc0) >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10);
    return { mediaType: "image/webp", dimensions: { width, height } };
  }
  return { mediaType: "image/webp" };
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
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const segment = pattern.slice(3, -3);
    return (
      normalized === segment ||
      normalized.startsWith(`${segment}/`) ||
      normalized.includes(`/${segment}/`)
    );
  }
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
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

export function mcpResult(value) {
  return {
    structuredContent: value,
  };
}

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
