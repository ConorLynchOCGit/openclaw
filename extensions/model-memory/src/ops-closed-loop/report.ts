import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveMemoryOpsConfig, type MemoryOpsClosedLoopConfig } from "./config.ts";
import type {
  MemoryOpsRecommendation,
  MemoryOpsRecommendationCategory,
  MemoryOpsSignal,
  RecommendationSeverity,
} from "./types.ts";

const SECTION_ORDER: Array<{
  title: string;
  categories: MemoryOpsRecommendationCategory[];
}> = [
  { title: "Critical Issues", categories: [] },
  { title: "Action-required Issues", categories: [] },
  { title: "Capture Gaps", categories: ["capture_gap"] },
  {
    title: "Compaction/session Flush Risks",
    categories: ["compaction_risk", "session_flush_failed"],
  },
  {
    title: "Retrieval Quality Issues",
    categories: ["retrieval_miss", "bad_injection", "stale_memory", "superseded_memory_injected"],
  },
  {
    title: "Conflict/supersession Issues",
    categories: ["conflict_unresolved", "superseded_memory_injected"],
  },
  {
    title: "Dedupe/procedure Leakage Issues",
    categories: ["dedupe_failure", "procedure_leakage"],
  },
  {
    title: "Provenance/source-span Issues",
    categories: ["provenance_gap", "source_span_failure"],
  },
  {
    title: "File Watcher/import Issues",
    categories: ["file_watcher_gap"],
  },
  { title: "Hook Health", categories: ["hook_health"] },
  { title: "Suggested Next Actions", categories: [] },
];

function severityRank(severity: RecommendationSeverity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "action_required":
      return 1;
    case "warning":
      return 2;
    case "info":
    default:
      return 3;
  }
}

function sortRecommendations(
  recommendations: MemoryOpsRecommendation[],
): MemoryOpsRecommendation[] {
  return [...recommendations].toSorted((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.title.localeCompare(right.title);
  });
}

function formatRecommendation(recommendation: MemoryOpsRecommendation): string {
  const affected = [
    ...(recommendation.related_memory_ids ?? []).map((id) => `memory:${id}`),
    ...(recommendation.related_session_ids ?? []).map((id) => `session:${id}`),
    ...(recommendation.related_hook_names ?? []).map((id) => `hook:${id}`),
  ];
  return [
    `- ${recommendation.severity}: ${recommendation.title}`,
    `  Summary: ${recommendation.summary}`,
    affected.length > 0 ? `  Affected: ${affected.join(", ")}` : undefined,
    `  Recommended action: ${recommendation.recommended_action}`,
    `  Auto-fix: ${recommendation.auto_fix_enabled ? "enabled" : "disabled"}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function sectionRecommendations(
  recommendations: MemoryOpsRecommendation[],
  section: (typeof SECTION_ORDER)[number],
): MemoryOpsRecommendation[] {
  if (section.title === "Critical Issues") {
    return recommendations.filter((entry) => entry.severity === "critical");
  }
  if (section.title === "Action-required Issues") {
    return recommendations.filter((entry) => entry.severity === "action_required");
  }
  if (section.title === "Suggested Next Actions") {
    return recommendations.filter((entry) => entry.status === "open").slice(0, 10);
  }
  return recommendations.filter((entry) => section.categories.includes(entry.category));
}

export function generateMemoryOpsHealthReport(input: {
  signals: MemoryOpsSignal[];
  recommendations: MemoryOpsRecommendation[];
  generatedAt?: string;
  sourceLabel?: string;
}): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const recommendations = sortRecommendations(input.recommendations);
  const lines: string[] = [
    "# Memory Ops Health Report",
    "",
    `- generated_at_utc: ${generatedAt}`,
    `- source: ${input.sourceLabel ?? "memory-ops-closed-loop"}`,
    `- signal_count: ${input.signals.length}`,
    `- recommendation_count: ${recommendations.length}`,
    "- mode: observe/report-only",
    "- auto_fix_enabled: false",
    "",
  ];

  for (const section of SECTION_ORDER) {
    const entries = sectionRecommendations(recommendations, section);
    lines.push(`## ${section.title}`);
    lines.push("");
    if (entries.length === 0) {
      lines.push("- No current findings.");
      lines.push("");
      continue;
    }
    for (const recommendation of entries) {
      lines.push(formatRecommendation(recommendation));
    }
    lines.push("");
  }

  lines.push("## Privacy Guardrails");
  lines.push("");
  lines.push("- Full prompt text is not persisted.");
  lines.push("- Full transcripts are not persisted.");
  lines.push("- Raw tool logs are not persisted.");
  lines.push("- Signals must have automated consumers and usage contracts before persistence.");
  lines.push("- Auto-fix remains disabled for the first soak cycle.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export async function writeMemoryOpsHealthReport(input: {
  signals: MemoryOpsSignal[];
  recommendations: MemoryOpsRecommendation[];
  generatedAt?: string;
  sourceLabel?: string;
  config?: Partial<MemoryOpsClosedLoopConfig>;
}): Promise<{ reportPath: string; latestPath: string; markdown: string }> {
  const config = resolveMemoryOpsConfig(input.config ?? {});
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const day = generatedAt.slice(0, 10);
  const outputDir = path.join(config.baseDir, "reports");
  await mkdir(outputDir, { recursive: true });
  const markdown = generateMemoryOpsHealthReport({
    signals: input.signals,
    recommendations: input.recommendations,
    generatedAt,
    sourceLabel: input.sourceLabel,
  });
  const reportPath = path.join(outputDir, `${day}-memory-ops.md`);
  const latestPath = path.join(outputDir, "latest.md");
  await writeFile(reportPath, markdown, "utf8");
  await writeFile(latestPath, markdown, "utf8");
  return { reportPath, latestPath, markdown };
}
