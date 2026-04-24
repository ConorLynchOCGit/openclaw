import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type CleanupDebtClass =
  | "legacy-retirement"
  | "oversized-orchestration"
  | "duplication-centralization"
  | "dead-code-or-unused-surface"
  | "public-api-compatibility-risk";

export type MarkerCounts = {
  legacy: number;
  compat: number;
  deprecated: number;
  fallback: number;
  todo: number;
  fixme: number;
  hack: number;
};

export type FileMetric = {
  path: string;
  bytes: number;
  lines: number;
  importCount: number;
  exportCount: number;
  functionLikeCount: number;
  markerCounts: MarkerCounts;
  phase2Critical: boolean;
};

type CandidateRubric = {
  phase2Criticality: number;
  leverage: number;
  regressionRisk: number;
  publicApiRisk: number;
  extractionDifficulty: number;
  rollbackEase: number;
  testCoverageConfidence: number;
};

type CandidateSeed = {
  id: string;
  title: string;
  debtClass: CleanupDebtClass;
  wave: "first" | "later";
  rationale: string;
  acceptanceHint: string;
  paths: string[];
  rubric: CandidateRubric;
};

export type RankedCleanupCandidate = {
  id: string;
  title: string;
  debtClass: CleanupDebtClass;
  wave: "first" | "later";
  priorityScore: number;
  rubric: CandidateRubric;
  rationale: string;
  acceptanceHint: string;
  paths: string[];
  metrics: {
    totalLines: number;
    totalBytes: number;
    maxLines: number;
    maxBytes: number;
    legacyMarkers: number;
    fallbackMarkers: number;
    fileCount: number;
  };
};

export type CleanupGuidanceNote = {
  title: string;
  url: string;
  takeaways: string[];
};

export type CodeCleanupDiagnosisReport = {
  generatedAt: string;
  repoRoot: string;
  artifactRoot: string;
  guidance: CleanupGuidanceNote[];
  inventory: {
    productionFileCount: number;
    phase2CriticalFileCount: number;
    topHotspots: FileMetric[];
    phase2CriticalHotspots: FileMetric[];
    legacyBoundaryHotspots: FileMetric[];
  };
  backlog: RankedCleanupCandidate[];
  notNow: RankedCleanupCandidate[];
  doNotTouchYet: string[];
};

const CODE_ROOTS = ["src", "extensions", "ui/src", "scripts"] as const;
const SKIP_DIR_NAMES = new Set([".git", ".turbo", "coverage", "dist", "node_modules", "tmp"]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_FILE_PATTERNS = [
  /\.test\./u,
  /\.spec\./u,
  /\.generated\./u,
  /\.bundle\.js$/u,
  /highlight\.min\.js$/u,
  /viewer-runtime\.js$/u,
];
const PHASE2_CRITICAL_PREFIXES = [
  "extensions/model-memory/",
  "src/agents/model-memory",
  "src/plugin-sdk/model-memory.ts",
  "src/gateway/server-methods/chat.ts",
  "ui/src/ui/views/chat.ts",
  "ui/src/ui/app-render.ts",
];
const LEGACY_BOUNDARY_PREFIXES = [
  "extensions/model-memory/",
  "src/agents/model-memory.database.ts",
  "src/plugin-sdk/model-memory.ts",
];

export const OFFICIAL_CLEANUP_GUIDANCE: CleanupGuidanceNote[] = [
  {
    title: "Codex Best Practices",
    url: "https://developers.openai.com/codex/learn/best-practices",
    takeaways: [
      "Plan first for difficult tasks instead of jumping straight into code.",
      "Keep durable repo rules in AGENTS.md so good prompting patterns do not stay manual.",
      "Scope tasks tightly and choose higher reasoning only when complexity warrants it.",
    ],
  },
  {
    title: "Codex Prompting Guide",
    url: "https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide",
    takeaways: [
      "Use a reusable starter prompt, but add repo-specific constraints tactically rather than bloating every task.",
      "Bias toward codebase exploration, correct tool use, and completion discipline.",
      "Keep validation explicit and avoid broad silent fallbacks during refactor work.",
    ],
  },
  {
    title: "Modernizing Your Codebase With Codex",
    url: "https://developers.openai.com/cookbook/examples/codex/code_modernization",
    takeaways: [
      "Turn large cleanup programs into explicit artifacts: overview, design, validation, and execution plan.",
      "Preserve parity checks while refactoring instead of relying on intuition.",
      "Work in short loops and update the execution plan as real validation results land.",
    ],
  },
  {
    title: "How OpenAI Uses Codex",
    url: "https://openai.com/business/guides-and-resources/how-openai-uses-codex/",
    takeaways: [
      "For large changes, start in Ask/Plan mode and turn that plan into smaller coding tasks.",
      "Prompt Codex the way you would write a GitHub issue: exact files, component names, constraints, and references.",
      "Break bigger migrations and refactors into reviewable packets instead of one giant pass.",
    ],
  },
];

const CANDIDATE_SEEDS: CandidateSeed[] = [
  {
    id: "RC-001",
    title: "MMV2 legacy public/runtime boundary narrowing",
    debtClass: "legacy-retirement",
    wave: "first",
    rationale:
      "The default model-memory runtime boundary still crosses legacy admin/proof seams and explicit rollback toggles that should be harder to reach accidentally.",
    acceptanceHint:
      "Default MMV2 runtime/public imports no longer reach legacy admin/proof helpers unless the caller opts into an explicit admin surface.",
    paths: [
      "src/plugin-sdk/model-memory.ts",
      "src/agents/model-memory.database.ts",
      "extensions/model-memory/src/index.ts",
      "extensions/model-memory/src/runtime-api.ts",
      "extensions/model-memory/src/legacy-admin-api.ts",
      "extensions/model-memory/src/legacy-fallback-registry.ts",
      "extensions/model-memory/src/storage-engine.ts",
    ],
    rubric: {
      phase2Criticality: 5,
      leverage: 5,
      regressionRisk: 4,
      publicApiRisk: 4,
      extractionDifficulty: 3,
      rollbackEase: 4,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-002",
    title: "Live runtime orchestration split",
    debtClass: "oversized-orchestration",
    wave: "first",
    rationale:
      "The live runtime mixes config resolution, bootstrap, retrieval, dirty-state, ordinary-turn capture, and tool-result proof capture in one file.",
    acceptanceHint:
      "Configuration/bootstrap, retrieval-context assembly, dirty-state scheduling, ordinary-turn capture, and tool-result proof capture live in smaller modules with preserved behavior.",
    paths: ["src/agents/model-memory.live-runtime.ts"],
    rubric: {
      phase2Criticality: 5,
      leverage: 5,
      regressionRisk: 4,
      publicApiRisk: 1,
      extractionDifficulty: 4,
      rollbackEase: 4,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-003",
    title: "Repository and shared ingestion pipeline extraction",
    debtClass: "oversized-orchestration",
    wave: "first",
    rationale:
      "Persistence and shared-ingestion seams carry too many responsibilities and will stay on the hot path for Phase 2 work.",
    acceptanceHint:
      "Repository decoding/persistence and ingestion failure taxonomy/quarantine/closeout logic are split by concern without changing behavior.",
    paths: [
      "extensions/model-memory/src/db/mmv2-native-repository.ts",
      "extensions/model-memory/src/ingestion/shared-pipeline.ts",
    ],
    rubric: {
      phase2Criticality: 5,
      leverage: 5,
      regressionRisk: 4,
      publicApiRisk: 2,
      extractionDifficulty: 4,
      rollbackEase: 4,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-004",
    title: "Proof and validation harness isolation",
    debtClass: "oversized-orchestration",
    wave: "first",
    rationale:
      "The proof/validation harnesses are valuable, but they are harder to extend safely while they remain large mixed-responsibility files.",
    acceptanceHint:
      "Session-turn proof and Phase-2 entry validation code split execution, rendering, fixture data, and reporting into smaller modules.",
    paths: [
      "src/agents/model-memory.session-turn-proof.ts",
      "extensions/model-memory/src/phase2-entry-validation.ts",
    ],
    rubric: {
      phase2Criticality: 4,
      leverage: 4,
      regressionRisk: 3,
      publicApiRisk: 1,
      extractionDifficulty: 3,
      rollbackEase: 4,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-005",
    title: "Model-memory helper centralization",
    debtClass: "duplication-centralization",
    wave: "first",
    rationale:
      "Repeated parsing, JSON shaping, status mapping, and closeout helper logic will multiply editing cost once Phase 2 feature work starts.",
    acceptanceHint:
      "Shared parsing, mapping, and shaping helpers live in reusable modules instead of being copied across runtime and validation files.",
    paths: [
      "src/agents/model-memory.live-runtime.ts",
      "src/agents/model-memory.database.ts",
      "src/agents/model-memory.session-turn-proof.ts",
      "extensions/model-memory/src/ingestion/shared-pipeline.ts",
      "extensions/model-memory/src/phase2-entry-validation.ts",
      "extensions/model-memory/src/mmv2/atomic-extraction.ts",
    ],
    rubric: {
      phase2Criticality: 4,
      leverage: 4,
      regressionRisk: 3,
      publicApiRisk: 1,
      extractionDifficulty: 3,
      rollbackEase: 4,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-006",
    title: "Secondary chat and gateway surface split",
    debtClass: "oversized-orchestration",
    wave: "later",
    rationale:
      "Chat/gateway surfaces are real cleanup candidates, but they are not on the immediate Phase-2-critical path.",
    acceptanceHint:
      "Chat history transport, render helpers, and main chat view are decomposed only after the model-memory first wave is green.",
    paths: [
      "src/gateway/server-methods/chat.ts",
      "ui/src/ui/views/chat.ts",
      "ui/src/ui/app-render.ts",
    ],
    rubric: {
      phase2Criticality: 2,
      leverage: 3,
      regressionRisk: 4,
      publicApiRisk: 2,
      extractionDifficulty: 4,
      rollbackEase: 3,
      testCoverageConfidence: 4,
    },
  },
  {
    id: "RC-007",
    title: "Hook and plugin loader compatibility cleanup",
    debtClass: "public-api-compatibility-risk",
    wave: "later",
    rationale:
      "The loader stack still carries real compatibility behavior, so it needs a slower pass than the Phase-2-critical memory/runtime seams.",
    acceptanceHint:
      "Legacy loader paths are either retained intentionally with clear contracts or retired through a dedicated compatibility review.",
    paths: ["src/hooks/loader.ts", "src/plugins/loader.ts"],
    rubric: {
      phase2Criticality: 1,
      leverage: 2,
      regressionRisk: 4,
      publicApiRisk: 4,
      extractionDifficulty: 3,
      rollbackEase: 3,
      testCoverageConfidence: 3,
    },
  },
];

export function normalizeRepoPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function isProductionCodePath(repoRelativePath: string): boolean {
  const normalized = normalizeRepoPath(repoRelativePath);
  if (!CODE_ROOTS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return false;
  }
  if (!CODE_EXTENSIONS.has(path.extname(normalized))) {
    return false;
  }
  if (SKIP_FILE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return true;
}

function markerCount(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function collectMarkerCounts(text: string): MarkerCounts {
  return {
    legacy: markerCount(text, /\blegacy\b/giu),
    compat: markerCount(text, /\bcompat(?:ibility)?\b/giu),
    deprecated: markerCount(text, /\bdeprecated\b/giu),
    fallback: markerCount(text, /\bfallback\b/giu),
    todo: markerCount(text, /\bTODO\b/gu),
    fixme: markerCount(text, /\bFIXME\b/gu),
    hack: markerCount(text, /\bHACK\b/gu),
  };
}

function countOccurrences(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function isPhase2CriticalPath(repoRelativePath: string): boolean {
  return PHASE2_CRITICAL_PREFIXES.some(
    (prefix) => repoRelativePath === prefix || repoRelativePath.startsWith(prefix),
  );
}

function isLegacyBoundaryPath(repoRelativePath: string): boolean {
  return LEGACY_BOUNDARY_PREFIXES.some(
    (prefix) => repoRelativePath === prefix || repoRelativePath.startsWith(prefix),
  );
}

function walkCodeFiles(repoRoot: string, relativeDir: string, target: string[]): void {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return;
  }
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const relativePath = normalizeRepoPath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      walkCodeFiles(repoRoot, relativePath, target);
      continue;
    }
    if (!isProductionCodePath(relativePath)) {
      continue;
    }
    target.push(relativePath);
  }
}

export function collectProductionCodePaths(repoRoot: string): string[] {
  const paths: string[] = [];
  for (const root of CODE_ROOTS) {
    walkCodeFiles(repoRoot, root, paths);
  }
  return paths.toSorted((left, right) => left.localeCompare(right));
}

export function analyzeProductionFile(repoRoot: string, repoRelativePath: string): FileMetric {
  const absolutePath = path.join(repoRoot, repoRelativePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const bytes = fs.statSync(absolutePath).size;
  const lines = content === "" ? 0 : content.split(/\r?\n/u).length;
  return {
    path: repoRelativePath,
    bytes,
    lines,
    importCount: countOccurrences(content, /^\s*import\s/gu),
    exportCount: countOccurrences(content, /^\s*export\s/gu),
    functionLikeCount: countOccurrences(
      content,
      /^\s*(?:export\s+)?(?:async\s+)?function\s|\b(?:const|class)\s+[A-Za-z0-9_$]+\s*(?:=|\{)/gmu,
    ),
    markerCounts: collectMarkerCounts(content),
    phase2Critical: isPhase2CriticalPath(repoRelativePath),
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function computePriorityScore(
  rubric: CandidateRubric,
  metrics: Pick<
    RankedCleanupCandidate["metrics"],
    "maxLines" | "legacyMarkers" | "fallbackMarkers"
  >,
): number {
  const hotspotBoost =
    metrics.maxLines >= 1_500 ? 5 : metrics.maxLines >= 900 ? 3 : metrics.maxLines >= 600 ? 1 : 0;
  const legacyBoost = metrics.legacyMarkers + metrics.fallbackMarkers >= 8 ? 2 : 0;
  return (
    rubric.phase2Criticality * 4 +
    rubric.leverage * 4 +
    rubric.testCoverageConfidence * 2 +
    rubric.rollbackEase +
    hotspotBoost +
    legacyBoost -
    rubric.extractionDifficulty -
    rubric.publicApiRisk
  );
}

function buildRankedCandidate(
  seed: CandidateSeed,
  metricsMap: Map<string, FileMetric>,
): RankedCleanupCandidate {
  const metrics = seed.paths
    .map((entry) => metricsMap.get(entry))
    .filter((entry): entry is FileMetric => Boolean(entry));
  const aggregate = {
    totalLines: sum(metrics.map((entry) => entry.lines)),
    totalBytes: sum(metrics.map((entry) => entry.bytes)),
    maxLines: Math.max(...metrics.map((entry) => entry.lines), 0),
    maxBytes: Math.max(...metrics.map((entry) => entry.bytes), 0),
    legacyMarkers: sum(
      metrics.map((entry) => entry.markerCounts.legacy + entry.markerCounts.compat),
    ),
    fallbackMarkers: sum(metrics.map((entry) => entry.markerCounts.fallback)),
    fileCount: metrics.length,
  };
  return {
    id: seed.id,
    title: seed.title,
    debtClass: seed.debtClass,
    wave: seed.wave,
    priorityScore: computePriorityScore(seed.rubric, aggregate),
    rubric: seed.rubric,
    rationale: seed.rationale,
    acceptanceHint: seed.acceptanceHint,
    paths: seed.paths,
    metrics: aggregate,
  };
}

export function buildCodeCleanupDiagnosisReport(input: {
  repoRoot: string;
  artifactRoot: string;
  generatedAt?: string;
}): CodeCleanupDiagnosisReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const productionPaths = collectProductionCodePaths(input.repoRoot);
  const metrics = productionPaths.map((entry) => analyzeProductionFile(input.repoRoot, entry));
  const metricsMap = new Map(metrics.map((entry) => [entry.path, entry] as const));
  const backlog = CANDIDATE_SEEDS.filter((entry) => entry.wave === "first")
    .map((entry) => buildRankedCandidate(entry, metricsMap))
    .toSorted(
      (left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id),
    );
  const notNow = CANDIDATE_SEEDS.filter((entry) => entry.wave === "later")
    .map((entry) => buildRankedCandidate(entry, metricsMap))
    .toSorted(
      (left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id),
    );
  const topHotspots = [...metrics]
    .toSorted(
      (left, right) =>
        Number(right.phase2Critical) - Number(left.phase2Critical) ||
        right.lines - left.lines ||
        right.bytes - left.bytes,
    )
    .slice(0, 20);
  const phase2CriticalHotspots = metrics
    .filter((entry) => entry.phase2Critical)
    .toSorted((left, right) => right.lines - left.lines || right.bytes - left.bytes)
    .slice(0, 12);
  const legacyBoundaryHotspots = metrics
    .filter(
      (entry) =>
        isLegacyBoundaryPath(entry.path) &&
        entry.markerCounts.legacy + entry.markerCounts.compat + entry.markerCounts.fallback > 0,
    )
    .toSorted(
      (left, right) =>
        right.markerCounts.legacy +
          right.markerCounts.compat +
          right.markerCounts.fallback -
          (left.markerCounts.legacy + left.markerCounts.compat + left.markerCounts.fallback) ||
        right.lines - left.lines,
    )
    .slice(0, 12);

  return {
    generatedAt,
    repoRoot: normalizeRepoPath(input.repoRoot),
    artifactRoot: normalizeRepoPath(input.artifactRoot),
    guidance: OFFICIAL_CLEANUP_GUIDANCE,
    inventory: {
      productionFileCount: metrics.length,
      phase2CriticalFileCount: metrics.filter((entry) => entry.phase2Critical).length,
      topHotspots,
      phase2CriticalHotspots,
      legacyBoundaryHotspots,
    },
    backlog,
    notNow,
    doNotTouchYet: [
      "Broad repo-wide formatter churn",
      "Speculative performance rewrites without a measured bottleneck",
      "Deletion of public/plugin-facing compatibility surfaces without migration review",
      "Reopening accepted pre-Phase-2 gate work without fresh failing evidence",
    ],
  };
}

function renderMetricSummary(candidate: RankedCleanupCandidate): string {
  return [
    `score=${candidate.priorityScore}`,
    `files=${candidate.metrics.fileCount}`,
    `max_lines=${candidate.metrics.maxLines}`,
    `legacy_markers=${candidate.metrics.legacyMarkers}`,
    `fallback_markers=${candidate.metrics.fallbackMarkers}`,
  ].join(" | ");
}

function renderFileMetric(entry: FileMetric): string {
  const markers =
    entry.markerCounts.legacy + entry.markerCounts.compat + entry.markerCounts.fallback;
  return `- \`${entry.path}\` — ${entry.lines} lines, ${entry.bytes} bytes, markers=${markers}, exports=${entry.exportCount}`;
}

export function renderCodeCleanupDiagnosisMarkdown(report: CodeCleanupDiagnosisReport): string {
  const lines: string[] = [];
  lines.push("# Pre-Phase-2 Code Cleanup Diagnosis");
  lines.push("");
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(`- Artifact root: \`${report.artifactRoot}\``);
  lines.push(`- Production files scanned: \`${report.inventory.productionFileCount}\``);
  lines.push(`- Phase-2-critical files scanned: \`${report.inventory.phase2CriticalFileCount}\``);
  lines.push("");
  lines.push("## Official Codex Guidance");
  lines.push("");
  for (const note of report.guidance) {
    lines.push(`- [${note.title}](${note.url})`);
    for (const takeaway of note.takeaways) {
      lines.push(`  - ${takeaway}`);
    }
  }
  lines.push("");
  lines.push("## Ranked First-Wave Backlog");
  lines.push("");
  for (const candidate of report.backlog) {
    lines.push(`### ${candidate.id} — ${candidate.title}`);
    lines.push("");
    lines.push(`- Class: \`${candidate.debtClass}\``);
    lines.push(`- Summary: ${renderMetricSummary(candidate)}`);
    lines.push(`- Why now: ${candidate.rationale}`);
    lines.push(`- Acceptance hint: ${candidate.acceptanceHint}`);
    lines.push("- Scope:");
    for (const entry of candidate.paths) {
      lines.push(`  - \`${entry}\``);
    }
    lines.push("");
  }
  lines.push("## Not-Now List");
  lines.push("");
  for (const candidate of report.notNow) {
    lines.push(`- \`${candidate.id}\` ${candidate.title} — ${candidate.rationale}`);
  }
  lines.push("");
  lines.push("## Phase-2-Critical Hotspots");
  lines.push("");
  for (const entry of report.inventory.phase2CriticalHotspots) {
    lines.push(renderFileMetric(entry));
  }
  lines.push("");
  lines.push("## Legacy Boundary Hotspots");
  lines.push("");
  for (const entry of report.inventory.legacyBoundaryHotspots) {
    lines.push(renderFileMetric(entry));
  }
  lines.push("");
  lines.push("## Do-Not-Touch-Yet");
  lines.push("");
  for (const entry of report.doNotTouchYet) {
    lines.push(`- ${entry}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function writeCodeCleanupDiagnosisArtifacts(input: {
  repoRoot: string;
  artifactRoot: string;
  generatedAt?: string;
}): Promise<{
  report: CodeCleanupDiagnosisReport;
  jsonPath: string;
  markdownPath: string;
}> {
  const report = buildCodeCleanupDiagnosisReport(input);
  await mkdir(input.artifactRoot, { recursive: true });
  const jsonPath = path.join(input.artifactRoot, "diagnosis-report.json");
  const markdownPath = path.join(input.artifactRoot, "diagnosis-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderCodeCleanupDiagnosisMarkdown(report), "utf8");
  return {
    report,
    jsonPath,
    markdownPath,
  };
}
