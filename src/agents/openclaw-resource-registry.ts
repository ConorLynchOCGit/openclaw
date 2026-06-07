import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveOpenClawPath,
  resolveOpenClawPathRoots,
  type OpenClawPathResolution,
} from "./workspace-topology-resolver.js";

export type OpenClawResourceRootId =
  | "live_repo"
  | "operator_workspace"
  | "generated_current"
  | "memory_ops"
  | "archive_reports";

export type OpenClawResourceMatchKind = "resource_id" | "path" | "alias";

export type OpenClawResourceRegistryOptions = {
  liveRepoRoot?: string;
  workspaceRoot?: string;
  runtimeLiveRepoRoot?: string;
  runtimeWorkspaceRoot?: string;
};

type ResolvedOpenClawResourceRegistryOptions = Required<OpenClawResourceRegistryOptions>;

export type OpenClawResourceRoot = {
  id: OpenClawResourceRootId;
  title: string;
  hostPath: string;
  runtimePath: string;
  description: string;
  generated: boolean;
};

export type OpenClawResourceEntry = {
  id: string;
  title: string;
  rootId: OpenClawResourceRootId;
  canonicalOwner: OpenClawPathResolution["canonicalOwner"];
  canonicalResourceId: string | null;
  hostPath: string;
  runtimePath: string;
  readScopeHint: "live_repo" | "operator_workspace";
  safeToReadDirectly: boolean;
  classification: "durable_doc" | "generated_artifact" | "evidence";
  generated: boolean;
  humanOwned: boolean;
  freshness: {
    exists: boolean;
    lastModified: string | null;
    sourceGeneratedAtUtc: string | null;
  };
  aliases: string[];
  provenance: {
    producerType: string;
    note: string;
    standaloneHostCronLane: "retired" | "not_applicable";
    mode: string | null;
    sourceLabel: string | null;
  };
};

export type OpenClawResourceResolution = {
  query: string;
  matched: boolean;
  matchedBy: OpenClawResourceMatchKind | null;
  resource: OpenClawResourceEntry | null;
  pathResolution: OpenClawPathResolution | null;
  roots: OpenClawResourceRoot[];
  resources: OpenClawResourceEntry[];
  reason: string;
};

function normalizePath(value: string): string {
  return path.posix.normalize(value.replace(/\\/g, "/").trim());
}

function runtimePathFromHostPath(
  hostPath: string,
  options: ResolvedOpenClawResourceRegistryOptions,
) {
  const normalized = normalizePath(hostPath);
  const liveRepoRoot = normalizePath(options.liveRepoRoot);
  const workspaceRoot = normalizePath(options.workspaceRoot);
  const runtimeLiveRepoRoot = normalizePath(options.runtimeLiveRepoRoot);
  const runtimeWorkspaceRoot = normalizePath(options.runtimeWorkspaceRoot);
  if (normalized === liveRepoRoot || normalized.startsWith(`${liveRepoRoot}/`)) {
    return normalizePath(
      path.posix.join(runtimeLiveRepoRoot, path.posix.relative(liveRepoRoot, normalized)),
    );
  }
  if (normalized === workspaceRoot || normalized.startsWith(`${workspaceRoot}/`)) {
    return normalizePath(
      path.posix.join(runtimeWorkspaceRoot, path.posix.relative(workspaceRoot, normalized)),
    );
  }
  return normalized;
}

export async function resolveOpenClawResourceRegistryOptions(
  options: OpenClawResourceRegistryOptions = {},
): Promise<ResolvedOpenClawResourceRegistryOptions> {
  const roots = resolveOpenClawPathRoots({
    liveRepoRoot: options.liveRepoRoot,
    workspaceRoot: options.workspaceRoot,
  });
  return {
    liveRepoRoot: roots.liveRepoRoot,
    workspaceRoot: roots.workspaceRoot,
    runtimeLiveRepoRoot: normalizePath(options.runtimeLiveRepoRoot ?? roots.liveRepoRoot),
    runtimeWorkspaceRoot: normalizePath(options.runtimeWorkspaceRoot ?? roots.workspaceRoot),
  };
}

function resolveOpenClawResourceRegistryOptionsSync(
  options: OpenClawResourceRegistryOptions = {},
): ResolvedOpenClawResourceRegistryOptions {
  const roots = resolveOpenClawPathRoots({
    liveRepoRoot: options.liveRepoRoot,
    workspaceRoot: options.workspaceRoot,
  });
  return {
    liveRepoRoot: roots.liveRepoRoot,
    workspaceRoot: roots.workspaceRoot,
    runtimeLiveRepoRoot: normalizePath(options.runtimeLiveRepoRoot ?? roots.liveRepoRoot),
    runtimeWorkspaceRoot: normalizePath(options.runtimeWorkspaceRoot ?? roots.workspaceRoot),
  };
}

async function readFileIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readStatIsoIfPresent(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

function readDashField(markdown: string | null, fieldName: string): string | null {
  if (!markdown) {
    return null;
  }
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escapedField}:\\s*(.+)$`, "mu"));
  return match?.[1]?.trim() ?? null;
}

async function resolveLatestMarkdownFile(dirPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .toSorted();
    if (files.length === 0) {
      return null;
    }
    return normalizePath(path.posix.join(dirPath, files[files.length - 1]));
  } catch {
    return null;
  }
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function scoreAliasMatch(query: string, resource: OpenClawResourceEntry): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }
  let best = 0;
  for (const alias of resource.aliases) {
    const normalizedAlias = normalizeSearchText(alias);
    if (!normalizedAlias) {
      continue;
    }
    if (normalizedAlias === normalizedQuery) {
      return 100;
    }
    if (normalizedQuery.includes(normalizedAlias)) {
      best = Math.max(best, 80 + Math.min(normalizedAlias.length, 15));
      continue;
    }
    if (normalizedAlias.includes(normalizedQuery) && normalizedQuery.length >= 6) {
      best = Math.max(best, 70 + Math.min(normalizedQuery.length, 15));
      continue;
    }
    const queryTokens = new Set(tokenizeSearchText(normalizedQuery));
    const aliasTokens = tokenizeSearchText(normalizedAlias);
    const overlap = aliasTokens.filter((token) => queryTokens.has(token)).length;
    if (overlap > 0) {
      best = Math.max(best, overlap * 10);
    }
  }
  return best;
}

function buildResourceRoots(
  options: ResolvedOpenClawResourceRegistryOptions,
): OpenClawResourceRoot[] {
  const liveRepoRoot = normalizePath(options.liveRepoRoot);
  const workspaceRoot = normalizePath(options.workspaceRoot);
  return [
    {
      id: "live_repo",
      title: "Live Repo",
      hostPath: liveRepoRoot,
      runtimePath: normalizePath(options.runtimeLiveRepoRoot),
      description: "Canonical live product repo implementation and evidence surfaces.",
      generated: false,
    },
    {
      id: "operator_workspace",
      title: "Operator Workspace",
      hostPath: workspaceRoot,
      runtimePath: normalizePath(options.runtimeWorkspaceRoot),
      description: "Canonical operator workspace continuity and working surfaces.",
      generated: false,
    },
    {
      id: "generated_current",
      title: "Generated Current",
      hostPath: normalizePath(path.posix.join(workspaceRoot, "projects/ops/generated_current")),
      runtimePath: normalizePath(
        path.posix.join(options.runtimeWorkspaceRoot, "projects/ops/generated_current"),
      ),
      description:
        "Workspace-visible current aliases and working artifacts for operator review flows.",
      generated: true,
    },
    {
      id: "memory_ops",
      title: "Memory Ops Evidence",
      hostPath: normalizePath(path.posix.join(liveRepoRoot, ".openclaw-memory-ops")),
      runtimePath: normalizePath(
        path.posix.join(options.runtimeLiveRepoRoot, ".openclaw-memory-ops"),
      ),
      description: "Observe/report-only Memory Ops evidence and report artifacts.",
      generated: true,
    },
    {
      id: "archive_reports",
      title: "Archive Reports",
      hostPath: normalizePath(path.posix.join(workspaceRoot, "archives")),
      runtimePath: normalizePath(path.posix.join(options.runtimeWorkspaceRoot, "archives")),
      description: "Archived operator-facing report lanes and hygiene rollups.",
      generated: true,
    },
  ];
}

export async function listOpenClawResources(
  options: OpenClawResourceRegistryOptions = {},
): Promise<OpenClawResourceEntry[]> {
  const resolvedOptions = await resolveOpenClawResourceRegistryOptions(options);
  const liveRepoRoot = resolvedOptions.liveRepoRoot;
  const workspaceRoot = resolvedOptions.workspaceRoot;
  const memoryOpsReportHost = normalizePath(
    path.posix.join(liveRepoRoot, ".openclaw-memory-ops/reports/latest.md"),
  );
  const memoryOpsAliasHost = normalizePath(
    path.posix.join(
      workspaceRoot,
      "projects/ops/generated_current/memory_ops_health_report_current.md",
    ),
  );
  const dailyReviewContextHost = normalizePath(
    path.posix.join(
      workspaceRoot,
      "projects/ops/generated_current/daily_operator_review_context_current.md",
    ),
  );
  const cronHealthDir = normalizePath(
    path.posix.join(workspaceRoot, "archives/cron_health_rollups"),
  );
  const cronSessionHygieneDir = normalizePath(
    path.posix.join(workspaceRoot, "archives/cron_session_hygiene"),
  );
  const [
    memoryOpsReportText,
    aliasText,
    memoryOpsLastModified,
    aliasLastModified,
    dailyContextLastModified,
  ] = await Promise.all([
    readFileIfPresent(memoryOpsReportHost),
    readFileIfPresent(memoryOpsAliasHost),
    readStatIsoIfPresent(memoryOpsReportHost),
    readStatIsoIfPresent(memoryOpsAliasHost),
    readStatIsoIfPresent(dailyReviewContextHost),
  ]);
  const [latestCronHealthHost, latestHygieneHost] = await Promise.all([
    resolveLatestMarkdownFile(cronHealthDir),
    resolveLatestMarkdownFile(cronSessionHygieneDir),
  ]);
  const [cronHealthLastModified, hygieneLastModified] = await Promise.all([
    latestCronHealthHost ? readStatIsoIfPresent(latestCronHealthHost) : Promise.resolve(null),
    latestHygieneHost ? readStatIsoIfPresent(latestHygieneHost) : Promise.resolve(null),
  ]);

  return [
    {
      id: "memory_ops.latest_report",
      title: "Latest Memory Ops Health Report",
      rootId: "memory_ops",
      canonicalOwner: "memory_ops",
      canonicalResourceId: null,
      hostPath: memoryOpsReportHost,
      runtimePath: runtimePathFromHostPath(memoryOpsReportHost, resolvedOptions),
      readScopeHint: "live_repo",
      safeToReadDirectly: true,
      classification: "evidence",
      generated: true,
      humanOwned: false,
      freshness: {
        exists: memoryOpsReportText !== null,
        lastModified: memoryOpsLastModified,
        sourceGeneratedAtUtc: readDashField(memoryOpsReportText, "generated_at_utc"),
      },
      aliases: [
        "latest memory ops report",
        "show me the latest memory ops report",
        "memory ops health report",
        "latest memory ops health report",
        "report referenced by daily operator digest",
        "report referenced by daily operator brief",
        "report referenced by daily operator review",
        "daily operator digest memory ops report",
        "daily operator brief memory ops report",
        "what cron runs the memory ops report",
        "what cron runs this memory ops report",
      ],
      provenance: {
        producerType: "repo_owned_report_artifact",
        note: "Canonical observe/report-only Memory Ops artifact in the live repo evidence tree.",
        standaloneHostCronLane: "retired",
        mode: readDashField(memoryOpsReportText, "mode"),
        sourceLabel: readDashField(memoryOpsReportText, "source"),
      },
    },
    {
      id: "ops.generated_current.memory_ops_report_current",
      title: "Current Memory Ops Health Report Alias",
      rootId: "generated_current",
      canonicalOwner: "operator_workspace",
      canonicalResourceId: "memory_ops.latest_report",
      hostPath: memoryOpsAliasHost,
      runtimePath: runtimePathFromHostPath(memoryOpsAliasHost, resolvedOptions),
      readScopeHint: "operator_workspace",
      safeToReadDirectly: true,
      classification: "generated_artifact",
      generated: true,
      humanOwned: false,
      freshness: {
        exists: aliasText !== null,
        lastModified: aliasLastModified,
        sourceGeneratedAtUtc: readDashField(aliasText, "source_generated_at_utc"),
      },
      aliases: [
        "current memory ops report",
        "memory ops report current alias",
        "workspace memory ops report",
      ],
      provenance: {
        producerType: "workspace_generated_alias",
        note: "Workspace-visible current alias pointing back to the canonical live repo Memory Ops report.",
        standaloneHostCronLane: "retired",
        mode: null,
        sourceLabel: null,
      },
    },
    {
      id: "ops.daily_operator_review.current_context",
      title: "Current Daily Operator Review Context",
      rootId: "generated_current",
      canonicalOwner: "operator_workspace",
      canonicalResourceId: null,
      hostPath: dailyReviewContextHost,
      runtimePath: runtimePathFromHostPath(dailyReviewContextHost, resolvedOptions),
      readScopeHint: "operator_workspace",
      safeToReadDirectly: true,
      classification: "generated_artifact",
      generated: true,
      humanOwned: false,
      freshness: {
        exists: dailyContextLastModified !== null,
        lastModified: dailyContextLastModified,
        sourceGeneratedAtUtc: null,
      },
      aliases: [
        "daily operator review context",
        "daily operator digest context",
        "current daily operator review context",
      ],
      provenance: {
        producerType: "repo_owned_review_support_script",
        note: "Generated current context assembled by the daily operator review prep script.",
        standaloneHostCronLane: "not_applicable",
        mode: "report_only",
        sourceLabel: "daily_operator_review_prep",
      },
    },
    {
      id: "ops.cron_health.latest_rollup",
      title: "Latest Cron Health Rollup",
      rootId: "archive_reports",
      canonicalOwner: "operator_workspace",
      canonicalResourceId: null,
      hostPath:
        latestCronHealthHost ?? normalizePath(path.posix.join(cronHealthDir, "latest-missing.md")),
      runtimePath: latestCronHealthHost
        ? runtimePathFromHostPath(latestCronHealthHost, resolvedOptions)
        : runtimePathFromHostPath(
            normalizePath(path.posix.join(cronHealthDir, "latest-missing.md")),
            resolvedOptions,
          ),
      readScopeHint: "operator_workspace",
      safeToReadDirectly: true,
      classification: "evidence",
      generated: true,
      humanOwned: false,
      freshness: {
        exists: latestCronHealthHost !== null,
        lastModified: cronHealthLastModified,
        sourceGeneratedAtUtc: null,
      },
      aliases: ["latest cron health rollup", "cron health rollup", "latest cron health report"],
      provenance: {
        producerType: "host_cron_archive",
        note: "Latest archived cron health rollup from the operator workspace archive lane.",
        standaloneHostCronLane: "not_applicable",
        mode: null,
        sourceLabel: "cron_health_rollup",
      },
    },
    {
      id: "ops.cron_session_hygiene.latest_report",
      title: "Latest Cron Session Hygiene Report",
      rootId: "archive_reports",
      canonicalOwner: "operator_workspace",
      canonicalResourceId: null,
      hostPath:
        latestHygieneHost ??
        normalizePath(path.posix.join(cronSessionHygieneDir, "latest-missing.md")),
      runtimePath: latestHygieneHost
        ? runtimePathFromHostPath(latestHygieneHost, resolvedOptions)
        : runtimePathFromHostPath(
            normalizePath(path.posix.join(cronSessionHygieneDir, "latest-missing.md")),
            resolvedOptions,
          ),
      readScopeHint: "operator_workspace",
      safeToReadDirectly: true,
      classification: "evidence",
      generated: true,
      humanOwned: false,
      freshness: {
        exists: latestHygieneHost !== null,
        lastModified: hygieneLastModified,
        sourceGeneratedAtUtc: null,
      },
      aliases: [
        "latest cron session hygiene report",
        "cron session hygiene report",
        "latest session hygiene report",
      ],
      provenance: {
        producerType: "host_cron_archive",
        note: "Latest archived cron/session hygiene report from the operator workspace archive lane.",
        standaloneHostCronLane: "not_applicable",
        mode: null,
        sourceLabel: "cron_session_hygiene_report",
      },
    },
  ];
}

export function listOpenClawResourceRoots(
  options: OpenClawResourceRegistryOptions = {},
): OpenClawResourceRoot[] {
  const resolvedOptions = resolveOpenClawResourceRegistryOptionsSync(options);
  return buildResourceRoots(resolvedOptions);
}

export async function resolveOpenClawResource(
  query: string,
  options: OpenClawResourceRegistryOptions = {},
): Promise<OpenClawResourceResolution> {
  const resolvedOptions = await resolveOpenClawResourceRegistryOptions(options);
  const roots = buildResourceRoots(resolvedOptions);
  const resources = await listOpenClawResources(resolvedOptions);
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      query,
      matched: false,
      matchedBy: null,
      resource: null,
      pathResolution: null,
      roots,
      resources,
      reason: "query is required",
    };
  }
  const normalizedPathQuery = normalizePath(trimmedQuery);
  const normalizedTextQuery = normalizeSearchText(trimmedQuery);
  const exactId = resources.find((resource) => resource.id === trimmedQuery);
  if (exactId) {
    return {
      query,
      matched: true,
      matchedBy: "resource_id",
      pathResolution: resolveOpenClawPath(exactId.hostPath, {
        liveRepoRoot: resolvedOptions.liveRepoRoot,
        workspaceRoot: resolvedOptions.workspaceRoot,
      }),
      resource: exactId,
      roots,
      resources,
      reason: "matched by stable resource id",
    };
  }
  const exactPath = resources.find(
    (resource) =>
      normalizePath(resource.hostPath) === normalizedPathQuery ||
      normalizePath(resource.runtimePath) === normalizedPathQuery,
  );
  if (exactPath) {
    return {
      query,
      matched: true,
      matchedBy: "path",
      pathResolution: resolveOpenClawPath(exactPath.hostPath, {
        liveRepoRoot: resolvedOptions.liveRepoRoot,
        workspaceRoot: resolvedOptions.workspaceRoot,
      }),
      resource: exactPath,
      roots,
      resources,
      reason: "matched by exact resource path",
    };
  }
  let bestMatch: { resource: OpenClawResourceEntry; score: number } | null = null;
  for (const resource of resources) {
    const score = scoreAliasMatch(normalizedTextQuery, resource);
    if (score <= 0) {
      continue;
    }
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { resource, score };
    }
  }
  if (!bestMatch) {
    return {
      query,
      matched: false,
      matchedBy: null,
      resource: null,
      pathResolution: null,
      roots,
      resources,
      reason: "no registered operator-facing cross-root resource matched the query",
    };
  }
  return {
    query,
    matched: true,
    matchedBy: "alias",
    pathResolution: resolveOpenClawPath(bestMatch.resource.hostPath, {
      liveRepoRoot: resolvedOptions.liveRepoRoot,
      workspaceRoot: resolvedOptions.workspaceRoot,
    }),
    resource: bestMatch.resource,
    roots,
    resources,
    reason: "matched by registered alias/query hint",
  };
}
