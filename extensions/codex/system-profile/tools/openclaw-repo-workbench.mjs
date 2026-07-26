#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { artifactViewImage } from "./openclaw-repo-workbench-artifact.mjs";
import {
  DEFAULT_OUTPUT_BYTES,
  DEFAULT_SEARCH_EXCLUSION_POLICY,
  MAX_BATCH_ITEMS,
  MAX_READ_BYTES,
  MAX_RESULTS,
  MAX_SEARCH_CONTEXT_LINES,
  MAX_SEARCH_MATCHES,
  mcpResult,
  resolveRepoRoot,
} from "./openclaw-repo-workbench-core.mjs";
import {
  lspDefinitionTypescript,
  lspHoverTypescript,
  lspReferencesTypescript,
} from "./openclaw-repo-workbench-lsp.mjs";
import {
  gitInspectMany,
  repoGlobMany,
  repoReadMany,
  repoSearchMany,
} from "./openclaw-repo-workbench-repository.mjs";

export {
  artifactViewImage,
  gitInspectMany,
  lspDefinitionTypescript,
  lspHoverTypescript,
  lspReferencesTypescript,
  mcpResult,
  repoGlobMany,
  repoReadMany,
  repoSearchMany,
  resolveRepoRoot,
};

const PositiveIntSchema = z.number().int().min(1);

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
  resolvedPath: z.string().optional(),
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
      "Preferred diff/status discovery tool: inspect the active task worktree with bounded read-only requests.",
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

function isMainModule() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
