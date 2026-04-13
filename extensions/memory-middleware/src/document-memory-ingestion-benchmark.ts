import { resolveMemoryMiddlewareConfig } from "./config.js";
import {
  createDocumentMemoryIngestionService,
  type DocumentMemoryIngestionService,
} from "./document-memory-ingestion-service.js";
import type {
  DocumentMemoryIngestionCandidatePlan,
  DocumentMemoryIngestionCategory,
  DocumentMemoryIngestionProfileId,
  DocumentMemoryIngestionSource,
} from "./document-memory-ingestion-types.js";
import { createLegacySemanticTestScaffoldInterpreter } from "./memory-semantic-interpreter.test-helpers.js";

export type DocumentMemoryBenchmarkExpectedCandidate = {
  id: string;
  category: DocumentMemoryIngestionCategory;
  statementIncludes: string[];
  headingPath?: string[];
  lineStart?: number;
  allowedLineStarts?: number[];
  duplicateCountAtLeast?: number;
};

export type DocumentMemoryBenchmarkForbiddenCandidate = {
  reason: string;
  statementIncludes: string[];
};

export type DocumentMemoryBenchmarkCase = {
  id: string;
  title: string;
  profileId: DocumentMemoryIngestionProfileId;
  projectId?: string;
  content?: string;
  sourcePath: string;
  expected: {
    exactCount: number;
    categoryCounts: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    requiredCandidates: DocumentMemoryBenchmarkExpectedCandidate[];
    forbiddenCandidates: DocumentMemoryBenchmarkForbiddenCandidate[];
    notes: string[];
  };
};

export type DocumentMemoryBenchmarkIssueSeverity = "blocking" | "minor";

export type DocumentMemoryBenchmarkIssue = {
  severity: DocumentMemoryBenchmarkIssueSeverity;
  code:
    | "count_mismatch"
    | "category_mismatch"
    | "missing_candidate"
    | "forbidden_capture"
    | "provenance_mismatch"
    | "dedupe_mismatch";
  message: string;
};

export type DocumentMemoryBenchmarkCaseResult = {
  benchmarkCase: DocumentMemoryBenchmarkCase;
  actual: {
    candidateCount: number;
    categoryCounts: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    candidates: Array<{
      category: DocumentMemoryIngestionCategory;
      statement: string;
      headingPath: string[];
      lineStart: number;
      lineEnd: number;
      duplicateCount: number;
    }>;
  };
  matchedCandidateIds: string[];
  issues: DocumentMemoryBenchmarkIssue[];
  pass: boolean;
};

export type DocumentMemoryBenchmarkReport = {
  benchmarkCriteria: string[];
  caseResults: DocumentMemoryBenchmarkCaseResult[];
  readiness: {
    blockingIssueCount: number;
    minorIssueCount: number;
    readyForLimitedBulkIngestion: boolean;
  };
};

function includesAll(text: string, parts: string[]): boolean {
  const normalized = text.toLowerCase();
  return parts.every((part) => normalized.includes(part.toLowerCase()));
}

function buildCategoryCounts(
  candidates: DocumentMemoryIngestionCandidatePlan[],
): Partial<Record<DocumentMemoryIngestionCategory, number>> {
  const counts: Partial<Record<DocumentMemoryIngestionCategory, number>> = {};
  for (const candidate of candidates) {
    counts[candidate.category] = (counts[candidate.category] ?? 0) + 1;
  }
  return counts;
}

function findMatchingCandidate(
  expected: DocumentMemoryBenchmarkExpectedCandidate,
  candidates: DocumentMemoryIngestionCandidatePlan[],
  usedIndexes: Set<number>,
): { candidate: DocumentMemoryIngestionCandidatePlan; index: number } | null {
  for (const [index, candidate] of candidates.entries()) {
    if (usedIndexes.has(index)) {
      continue;
    }
    if (candidate.category !== expected.category) {
      continue;
    }
    if (!includesAll(candidate.canonicalCandidate.record.statement, expected.statementIncludes)) {
      continue;
    }
    return { candidate, index };
  }
  return null;
}

export const DOCUMENT_MEMORY_BENCHMARK_CRITERIA = [
  "Every benchmark case must hit its exact candidate count.",
  "Expected category counts must match exactly for each case.",
  "Every required durable memory must be present with the right category and useful canonical wording.",
  "Forbidden filler/reference-only material must not be emitted as a candidate.",
  "Where provenance is expected, heading path and source line must match the expected source region.",
  "Where dedupe is expected, the winning candidate must report the required suppressed-duplicate count.",
] as const;

export const DOCUMENT_MEMORY_BENCHMARK_CASES: DocumentMemoryBenchmarkCase[] = [
  {
    id: "identity_explicit_and_duplicate",
    title: "Identity document with explicit stable constraints and concise duplicate phrasing",
    profileId: "identity",
    sourcePath: "benchmarks/identity-explicit.md",
    content: [
      "# User profile",
      "",
      "## Response defaults",
      "plain english please",
      "plz keep it short",
      "shorter replies",
      "",
      "## File references",
      "When referencing files in chat, use repo-root relative paths.",
      "",
      "## Noise",
      "remember this later maybe",
    ].join("\n"),
    expected: {
      exactCount: 3,
      categoryCounts: { response_style: 3 },
      requiredCandidates: [
        {
          id: "plain_english",
          category: "response_style",
          statementIncludes: ["plain english"],
          headingPath: ["User profile", "Response defaults"],
          lineStart: 4,
        },
        {
          id: "concise",
          category: "response_style",
          statementIncludes: ["concise"],
          headingPath: ["User profile", "Response defaults"],
          lineStart: 5,
          duplicateCountAtLeast: 1,
        },
        {
          id: "repo_relative_paths",
          category: "response_style",
          statementIncludes: ["repo-root relative paths"],
          headingPath: ["User profile", "File references"],
          lineStart: 9,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "speculative filler should not become durable memory",
          statementIncludes: ["remember this later maybe"],
        },
      ],
      notes: [
        "Duplicate concise variants should collapse to one stronger candidate.",
        "Provenance should point at the specific response-defaults and file-reference sections.",
      ],
    },
  },
  {
    id: "identity_paraphrase_heavy",
    title: "Identity document with paraphrases and one non-memory filler line",
    profileId: "identity",
    sourcePath: "benchmarks/identity-paraphrase-heavy.md",
    content: [
      "# Personal defaults",
      "",
      "plain english please",
      "can you avoid jargon",
      "No, use bullet points for me.",
      "For future replies, start with the direct answer first.",
      "The workflow needs a shorter release window.",
    ].join("\n"),
    expected: {
      exactCount: 3,
      categoryCounts: { response_style: 3 },
      requiredCandidates: [
        {
          id: "plain_english_deduped",
          category: "response_style",
          statementIncludes: ["plain english"],
          allowedLineStarts: [3, 4],
          duplicateCountAtLeast: 1,
        },
        {
          id: "bullets",
          category: "response_style",
          statementIncludes: ["bullet"],
          lineStart: 5,
        },
        {
          id: "direct_answer_first",
          category: "response_style",
          statementIncludes: ["direct answer first"],
          lineStart: 6,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "generic project commentary should stay out of identity memory capture",
          statementIncludes: ["shorter release window"],
        },
      ],
      notes: ["Equivalent plain-English paraphrases should collapse to one candidate."],
    },
  },
  {
    id: "project_operating_implicit_scope",
    title: "Project operating document where heading context carries project scope",
    profileId: "project_operating",
    projectId: "atlas-forge",
    sourcePath: "benchmarks/project-operating-implicit-scope.md",
    content: [
      "# Atlas Forge Operating Notes",
      "",
      "## Branches",
      "Default branch is atlas-main.",
      "Staging branch is atlas-staging.",
      "",
      "## Docs",
      "Update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
    ].join("\n"),
    expected: {
      exactCount: 3,
      categoryCounts: { project_fact: 2, project_rule: 1 },
      requiredCandidates: [
        {
          id: "default_branch",
          category: "project_fact",
          statementIncludes: ["atlas-main"],
          headingPath: ["Atlas Forge Operating Notes", "Branches"],
          lineStart: 4,
        },
        {
          id: "staging_branch",
          category: "project_fact",
          statementIncludes: ["atlas-staging"],
          headingPath: ["Atlas Forge Operating Notes", "Branches"],
          lineStart: 5,
        },
        {
          id: "docs_localization_rule",
          category: "project_rule",
          statementIncludes: ["english docs first", "docs i18n"],
          headingPath: ["Atlas Forge Operating Notes", "Docs"],
          lineStart: 8,
        },
      ],
      forbiddenCandidates: [],
      notes: [
        "The planner should be able to use project context and section context rather than requiring every line to restate the full project scope.",
      ],
    },
  },
  {
    id: "workflow_runbook_checklist_and_readiness",
    title: "Workflow runbook with a recurring checklist and a readiness rule",
    profileId: "workflow_runbook",
    projectId: "atlas-forge",
    sourcePath: "benchmarks/workflow-runbook.md",
    content: [
      "# Atlas Forge Rollout Runbook",
      "",
      "## Rollback Verification Checklist",
      "1. Confirm the rollback version.",
      "2. Verify the key health checks.",
      "",
      "## Readiness",
      "Trust /readyz for rollout readiness here; /healthz is only liveness.",
    ].join("\n"),
    expected: {
      exactCount: 2,
      categoryCounts: { recurring_procedure: 1, workflow_improvement: 1 },
      requiredCandidates: [
        {
          id: "rollback_checklist",
          category: "recurring_procedure",
          statementIncludes: ["rollback version", "key health checks"],
          headingPath: ["Atlas Forge Rollout Runbook", "Rollback Verification Checklist"],
          lineStart: 4,
        },
        {
          id: "readyz_rule",
          category: "workflow_improvement",
          statementIncludes: ["/readyz", "/healthz"],
          headingPath: ["Atlas Forge Rollout Runbook", "Readiness"],
          lineStart: 8,
        },
      ],
      forbiddenCandidates: [],
      notes: [
        "Runbook checklists should capture as recurring procedures, not as noisy fragmented lines.",
      ],
    },
  },
  {
    id: "strategic_decisions_mixed_signal",
    title: "Strategic decision doc with one unmet need, one durable fact, and mixed filler",
    profileId: "strategic_memory",
    projectId: "atlas-forge",
    sourcePath: "benchmarks/strategic-decisions.md",
    content: [
      "# Decisions",
      "",
      "For project atlas forge, we're missing a release evidence template for rollout audits because audits still arrive ad hoc.",
      "For project atlas forge, the documentation URL is https://docs.openclaw.ai/atlas-forge.",
      "Project atlas forge might need a new branch setup.",
      "The rollout plan is still messy.",
    ].join("\n"),
    expected: {
      exactCount: 2,
      categoryCounts: { unmet_need: 1, project_fact: 1 },
      requiredCandidates: [
        {
          id: "release_evidence_need",
          category: "unmet_need",
          statementIncludes: ["release evidence template", "rollout audits"],
          lineStart: 3,
        },
        {
          id: "documentation_url",
          category: "project_fact",
          statementIncludes: ["docs.openclaw.ai/atlas-forge"],
          lineStart: 4,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "speculative branch-setup commentary is not a durable memory fact",
          statementIncludes: ["new branch setup"],
        },
        {
          reason: "generic quality complaint should not be emitted as memory",
          statementIncludes: ["rollout plan is still messy"],
        },
      ],
      notes: [
        "Mixed strategic docs should stay selective instead of becoming noisy complaint capture.",
      ],
    },
  },
  {
    id: "reference_review_borderline",
    title: "Reference-review doc where only explicit durable references should survive",
    profileId: "reference_review",
    projectId: "atlas-forge",
    sourcePath: "benchmarks/reference-review-borderline.md",
    content: [
      "# Public notes",
      "",
      "For project atlas forge, the documentation URL is https://docs.openclaw.ai/atlas-forge.",
      "Atlas forge uses pnpm.",
      "For project atlas forge, the repo is probably somewhere on GitHub.",
      "remember this later maybe",
    ].join("\n"),
    expected: {
      exactCount: 1,
      categoryCounts: { project_fact: 1 },
      requiredCandidates: [
        {
          id: "documentation_url_reference",
          category: "project_fact",
          statementIncludes: ["docs.openclaw.ai/atlas-forge"],
          lineStart: 3,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "ambiguous package-manager phrasing should not be inferred into durable memory",
          statementIncludes: ["pnpm"],
        },
        {
          reason: "probabilistic repository references should be ignored",
          statementIncludes: ["github"],
        },
        {
          reason: "filler should not become memory",
          statementIncludes: ["remember this later maybe"],
        },
      ],
      notes: [
        "Reference-review profile should stay conservative while still allowing explicit durable references.",
      ],
    },
  },
  {
    id: "workflow_duplicate_lessons",
    title: "Workflow lesson duplicates should collapse to one memory candidate",
    profileId: "workflow_runbook",
    sourcePath: "benchmarks/workflow-duplicates.md",
    content: [
      "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
      "raw vitest skips the wrapper here, so plz use pnpm test",
      "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
    ].join("\n"),
    expected: {
      exactCount: 1,
      categoryCounts: { workflow_improvement: 1 },
      requiredCandidates: [
        {
          id: "pnpm_test_wrapper",
          category: "workflow_improvement",
          statementIncludes: ["pnpm test", "raw vitest"],
          lineStart: 1,
          duplicateCountAtLeast: 2,
        },
      ],
      forbiddenCandidates: [],
      notes: ["Duplicate workflow lessons should not survive as separate candidate rows."],
    },
  },
  {
    id: "slice_workflow_multiclass_live_doc",
    title: "Real slice workflow doc should yield routing guidance, procedures, and workflow rules",
    profileId: "workflow_runbook",
    sourcePath: "docs/help/slice-workflow.md",
    expected: {
      exactCount: 16,
      categoryCounts: {
        reference_routing: 2,
        recurring_procedure: 10,
        workflow_improvement: 4,
      },
      requiredCandidates: [
        {
          id: "companion_docs",
          category: "reference_routing",
          statementIncludes: ["testing", "release policy", "together"],
          lineStart: 14,
        },
        {
          id: "landing_gate_tiers_routing",
          category: "reference_routing",
          statementIncludes: [
            "default feature, integration, or production bar",
            "landing gate tiers",
          ],
          lineStart: 25,
        },
        {
          id: "default_phase_order",
          category: "recurring_procedure",
          statementIncludes: ["implementation loop", "pre-proof gate", "post-push verification"],
          lineStart: 31,
        },
        {
          id: "implementation_loop_gate",
          category: "recurring_procedure",
          statementIncludes: [
            "pnpm check:fast",
            "pnpm check:types",
            "plugin-package-contract:test",
          ],
          lineStart: 47,
        },
        {
          id: "pre_proof_gate",
          category: "recurring_procedure",
          statementIncludes: [
            "smallest honest validation tier",
            "pnpm gate:integration",
            "serialized expensive gates",
          ],
          lineStart: 68,
        },
        {
          id: "runtime_proof_fast",
          category: "workflow_improvement",
          statementIncludes: ["pnpm runtime:proof:fast", "/readyz proof semantics"],
          lineStart: 121,
          duplicateCountAtLeast: 1,
        },
        {
          id: "pre_production_gate",
          category: "recurring_procedure",
          statementIncludes: [
            "freeze the proof plan",
            "capture the rollback reference",
            "rerun only the invalidated gates",
          ],
          lineStart: 129,
        },
        {
          id: "pre_landing_gate",
          category: "recurring_procedure",
          statementIncludes: ["rerun targeted tests", "rerun `pnpm build`"],
          lineStart: 162,
        },
        {
          id: "commit_push_timing",
          category: "recurring_procedure",
          statementIncludes: ["commit after required proof", "push only after the commit exists"],
          lineStart: 179,
        },
        {
          id: "scripts_committer",
          category: "workflow_improvement",
          statementIncludes: ["scripts/committer", "manual git add / git commit"],
          lineStart: 185,
        },
        {
          id: "docs_only_check_fast",
          category: "workflow_improvement",
          statementIncludes: ["docs-only", "pnpm check:fast", "pnpm build"],
          lineStart: 226,
        },
        {
          id: "test_only_gate",
          category: "recurring_procedure",
          statementIncludes: ["run the touched tests", "pnpm check:fast", "real runtime fix"],
          lineStart: 236,
        },
        {
          id: "dry_run_checklist",
          category: "recurring_procedure",
          statementIncludes: ["run pre-proof gate", "fast_commit=1", "verify upstream sync"],
          lineStart: 299,
        },
        {
          id: "landing_helper_closeout",
          category: "recurring_procedure",
          statementIncludes: [
            "requested landing paths are still dirty",
            "local `head` no longer matches the pushed upstream ref",
          ],
          lineStart: 322,
        },
        {
          id: "readyz_workflow_rule",
          category: "workflow_improvement",
          statementIncludes: ["/readyz", "/healthz", "only liveness"],
          lineStart: 332,
        },
        {
          id: "docker_readiness_procedure",
          category: "recurring_procedure",
          statementIncludes: ["actual readiness gate", "shallow liveness only", "tracks readiness"],
          lineStart: 332,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "goal-setting prose should not become durable memory",
          statementIncludes: ["fast local iteration while code is moving"],
        },
        {
          reason: "generic explanatory prose should stay out",
          statementIncludes: ["does not replace existing hard gates"],
        },
      ],
      notes: [
        "This live document should prove the planner can cover routing guidance, reusable procedures, and workflow rules in one source.",
        "The benchmark is intentionally multi-class so a workflow-only result does not get a false green.",
      ],
    },
  },
];

export async function runDocumentMemoryIngestionBenchmark(params?: {
  service?: DocumentMemoryIngestionService;
  cases?: DocumentMemoryBenchmarkCase[];
}): Promise<DocumentMemoryBenchmarkReport> {
  const service =
    params?.service ??
    createDocumentMemoryIngestionService({
      config: resolveMemoryMiddlewareConfig({}),
      semanticInterpreter: createLegacySemanticTestScaffoldInterpreter(),
    });
  const cases = params?.cases ?? DOCUMENT_MEMORY_BENCHMARK_CASES;
  const caseResults: DocumentMemoryBenchmarkCaseResult[] = [];

  for (const benchmarkCase of cases) {
    const source: DocumentMemoryIngestionSource = {
      path: benchmarkCase.sourcePath,
      profileId: benchmarkCase.profileId,
      ...(typeof benchmarkCase.content === "string" ? { content: benchmarkCase.content } : {}),
      ...(benchmarkCase.projectId ? { projectId: benchmarkCase.projectId } : {}),
    };
    const plan = await service.planDocument(source);
    const issues: DocumentMemoryBenchmarkIssue[] = [];
    const usedIndexes = new Set<number>();
    const matchedCandidateIds: string[] = [];

    if (plan.counts.candidateCount !== benchmarkCase.expected.exactCount) {
      issues.push({
        severity: "blocking",
        code: "count_mismatch",
        message: `expected ${benchmarkCase.expected.exactCount} candidates but saw ${plan.counts.candidateCount}`,
      });
    }

    const actualCategoryCounts = buildCategoryCounts(plan.candidates);
    for (const [category, expectedCount] of Object.entries(benchmarkCase.expected.categoryCounts)) {
      const actualCount = actualCategoryCounts[category as DocumentMemoryIngestionCategory] ?? 0;
      if (actualCount !== expectedCount) {
        issues.push({
          severity: "blocking",
          code: "category_mismatch",
          message: `expected ${expectedCount} ${category} candidates but saw ${actualCount}`,
        });
      }
    }

    for (const expectedCandidate of benchmarkCase.expected.requiredCandidates) {
      const match = findMatchingCandidate(expectedCandidate, plan.candidates, usedIndexes);
      if (!match) {
        issues.push({
          severity: "blocking",
          code: "missing_candidate",
          message: `missing expected ${expectedCandidate.category} candidate ${expectedCandidate.id}`,
        });
        continue;
      }

      usedIndexes.add(match.index);
      matchedCandidateIds.push(expectedCandidate.id);

      if (
        expectedCandidate.headingPath &&
        match.candidate.headingPath.join(" > ") !== expectedCandidate.headingPath.join(" > ")
      ) {
        issues.push({
          severity: "blocking",
          code: "provenance_mismatch",
          message: `candidate ${expectedCandidate.id} had heading path ${match.candidate.headingPath.join(" > ")} instead of ${expectedCandidate.headingPath.join(" > ")}`,
        });
      }
      if (
        typeof expectedCandidate.lineStart === "number" &&
        match.candidate.lineStart !== expectedCandidate.lineStart
      ) {
        issues.push({
          severity: "blocking",
          code: "provenance_mismatch",
          message: `candidate ${expectedCandidate.id} had line ${match.candidate.lineStart} instead of ${expectedCandidate.lineStart}`,
        });
      }
      if (
        expectedCandidate.allowedLineStarts &&
        !expectedCandidate.allowedLineStarts.includes(match.candidate.lineStart)
      ) {
        issues.push({
          severity: "blocking",
          code: "provenance_mismatch",
          message: `candidate ${expectedCandidate.id} had line ${match.candidate.lineStart} outside allowed lines ${expectedCandidate.allowedLineStarts.join(", ")}`,
        });
      }
      if (
        typeof expectedCandidate.duplicateCountAtLeast === "number" &&
        match.candidate.duplicateCount < expectedCandidate.duplicateCountAtLeast
      ) {
        issues.push({
          severity: "blocking",
          code: "dedupe_mismatch",
          message: `candidate ${expectedCandidate.id} expected duplicateCount >= ${expectedCandidate.duplicateCountAtLeast} but saw ${match.candidate.duplicateCount}`,
        });
      }
    }

    for (const forbidden of benchmarkCase.expected.forbiddenCandidates) {
      const found = plan.candidates.find((candidate) =>
        includesAll(candidate.canonicalCandidate.record.statement, forbidden.statementIncludes),
      );
      if (found) {
        issues.push({
          severity: "blocking",
          code: "forbidden_capture",
          message: `forbidden capture present (${forbidden.reason}): ${found.canonicalCandidate.record.statement}`,
        });
      }
    }

    caseResults.push({
      benchmarkCase,
      actual: {
        candidateCount: plan.counts.candidateCount,
        categoryCounts: actualCategoryCounts,
        candidates: plan.candidates.map((candidate) => ({
          category: candidate.category,
          statement: candidate.canonicalCandidate.record.statement,
          headingPath: candidate.headingPath,
          lineStart: candidate.lineStart,
          lineEnd: candidate.lineEnd,
          duplicateCount: candidate.duplicateCount,
        })),
      },
      matchedCandidateIds,
      issues,
      pass: issues.every((issue) => issue.severity !== "blocking"),
    });
  }

  const blockingIssueCount = caseResults.reduce(
    (sum, result) => sum + result.issues.filter((issue) => issue.severity === "blocking").length,
    0,
  );
  const minorIssueCount = caseResults.reduce(
    (sum, result) => sum + result.issues.filter((issue) => issue.severity === "minor").length,
    0,
  );

  return {
    benchmarkCriteria: [...DOCUMENT_MEMORY_BENCHMARK_CRITERIA],
    caseResults,
    readiness: {
      blockingIssueCount,
      minorIssueCount,
      readyForLimitedBulkIngestion: blockingIssueCount === 0,
    },
  };
}
