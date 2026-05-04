import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type {
  ClawHubSearchResult,
  CodexBridgeClawHubComparisonItem,
  CodexBridgeClawHubComparisonReport,
  CodexBridgeSkillInventoryItem,
  CodexBridgeSkillInventoryReport,
} from "./skill-inventory.ts";
import { listRequiredCodexBridgeSkillDocs } from "./skill-triggers.ts";

const DEFAULT_REPO_ROOT = "/root/services/openclaw-roles/live";
const DEFAULT_CODEX_SKILL_ROOT = "/root/.codex/skills";
const DEFAULT_MAX_SKILL_CRITIQUE_METADATA_BYTES = 128 * 1024;

export type SkillDeepCritiqueVerdict =
  | "pass"
  | "pass_with_minor_gaps"
  | "needs_revision_before_bridge_use"
  | "blocked"
  | "replace_or_split"
  | "quarantine_external_candidate";

export type SkillDeepCritiqueCandidateRelevance =
  | "exact_comparable"
  | "partial_comparable"
  | "irrelevant_noisy_hit"
  | "unavailable"
  | "skipped_due_bound"
  | "skipped_due_risk";

export type SkillDeepCritiqueWebSource = {
  title: string;
  url: string;
  authority: "official" | "security_standard" | "security_research" | "secondary";
  findings: string[];
};

export type SkillDeepCritiqueTarget = {
  targetId: string;
  sourcePaths: string[];
  purpose: string;
  skillText?: string;
  requiredForBridgeSafety: boolean;
  activeRuntimeSkill: boolean;
};

export type SkillDeepCritiqueComparable = {
  query: string;
  slug: string | null;
  displayName: string | null;
  score: number | null;
  relevance: SkillDeepCritiqueCandidateRelevance;
  notes: string[];
};

export type SkillDeepCritiqueItem = {
  targetId: string;
  targetSourcePaths: string[];
  purpose: string;
  triggerClarityCritique: string[];
  instructionQualityCritique: string[];
  prohibitedActionCoverageCritique: string[];
  runtimeBoundaryCritique: string[];
  securityCritique: string[];
  validationProofCritique: string[];
  failureEscalationCritique: string[];
  comparisonToLocalRequirements: string[];
  comparisonToClawHubFindings: string[];
  comparisonToWebBestPractices: string[];
  missingCapabilities: string[];
  overbroadCapabilities: string[];
  ambiguityRisks: string[];
  promptInjectionSecurityRisks: string[];
  runtimeAuthorityRisks: string[];
  recommendedChanges: string[];
  comparableCandidates: SkillDeepCritiqueComparable[];
  verdict: SkillDeepCritiqueVerdict;
  noRawSkillContentIncluded: true;
};

export type SkillDeepCritiqueReport = {
  artifactKind: "codex_bridge_skill_deep_critique_8p_correction";
  auditId: string;
  checkedAt: string;
  targets: SkillDeepCritiqueItem[];
  webSources: SkillDeepCritiqueWebSource[];
  clawHubCommandsRun: Array<{
    command: "clawhub search" | "clawhub inspect";
    queryOrSlug: string;
    mode: "search_only" | "inspect_only" | "quarantine_only";
    installUpdatePublishPerformed: false;
  }>;
  changesApplied: string[];
  remainingBlockers: string[];
  fakeControlLoopProofEligible: boolean;
  codeWritingBridgePilotStillBlocked: true;
  codexCliInvoked: false;
  clawHubInstallUpdatePublishPerformed: false;
  workQueueLifecycleMutated: false;
};

export type SkillDeepCritiqueArtifact = {
  artifactKind: "codex_bridge_skill_deep_critique_artifact";
  auditId: string;
  checkedAt: string;
  targetCount: number;
  verdictCounts: Record<string, number>;
  exactComparableCount: number;
  partialComparableCount: number;
  noisyComparableCount: number;
  webSources: SkillDeepCritiqueWebSource[];
  changesApplied: string[];
  remainingBlockers: string[];
  fakeControlLoopProofEligible: boolean;
  codeWritingBridgePilotStillBlocked: true;
  codexCliInvoked: false;
  clawHubInstallUpdatePublishPerformed: false;
  workQueueLifecycleMutated: false;
  summaries: Array<{
    targetId: string;
    verdict: SkillDeepCritiqueVerdict;
    recommendedChanges: string[];
    missingCapabilities: string[];
    overbroadCapabilities: string[];
  }>;
  noRawSkillContentIncluded: true;
};

export const DEFAULT_SKILL_DEEP_CRITIQUE_WEB_SOURCES: SkillDeepCritiqueWebSource[] = [
  {
    title: "Anthropic Claude Code best practices",
    url: "https://www.anthropic.com/engineering/claude-code-best-practices",
    authority: "official",
    findings: [
      "Skills should provide specific context, verification expectations, and concise reusable guidance.",
      "Hooks are the deterministic mechanism for actions that must happen every time; skill text remains advisory.",
      "Agentic work benefits from early operator correction and bounded context management.",
    ],
  },
  {
    title: "Anthropic Agent Skills announcement and design pattern",
    url: "https://www.anthropic.com/news/skills",
    authority: "official",
    findings: [
      "Skills are loaded only when relevant and should keep access to the minimum needed resources.",
      "Skills can include executable code, which makes source trust and install discipline important.",
    ],
  },
  {
    title: "OpenAI Agents SDK guardrails",
    url: "https://openai.github.io/openai-agents-python/guardrails/",
    authority: "official",
    findings: [
      "Guardrails must run at the correct workflow boundary; tool-level checks are needed around tool calls.",
      "Blocking guardrails are safer than parallel checks when side effects must be prevented.",
    ],
  },
  {
    title: "OpenAI Agents SDK tracing",
    url: "https://openai.github.io/openai-agents-python/tracing/",
    authority: "official",
    findings: [
      "Agent workflows need traceable events for generations, tools, handoffs, guardrails, and custom spans.",
      "Sensitive trace data must be disabled or redacted when it may include private input/output.",
    ],
  },
  {
    title: "OpenAI Agents SDK handoffs",
    url: "https://openai.github.io/openai-agents-python/handoffs/",
    authority: "official",
    findings: [
      "Handoffs are tool-like delegation boundaries and may need input filters to avoid over-sharing history.",
      "Manager/delegate workflows still need guardrails at tool and handoff boundaries.",
    ],
  },
  {
    title: "OpenClaw ClawHub skill format",
    url: "https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md",
    authority: "official",
    findings: [
      "ClawHub skills are SKILL.md-centered packages with metadata and optional supporting files.",
      "Marketplace format compatibility does not by itself establish runtime safety or quality.",
    ],
  },
  {
    title: "OWASP Agentic Skills Top 10",
    url: "https://owasp.org/www-project-agentic-skills-top-10/",
    authority: "security_standard",
    findings: [
      "Agentic skill ecosystems need supply-chain, provenance, scanning, and prompt-injection defenses.",
      "Behavioral review is required because pattern scanning alone misses semantic attacks.",
    ],
  },
  {
    title: "OWASP Top 10 for LLM Applications 2025",
    url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    authority: "security_standard",
    findings: [
      "Prompt injection, sensitive information disclosure, supply-chain risk, and excessive agency are core LLM application risks.",
      "Agent tools should be constrained by explicit authorization and least privilege.",
    ],
  },
  {
    title: "Skill-Inject: Measuring Agent Vulnerability to Skill File Attacks",
    url: "https://arxiv.org/abs/2602.20156",
    authority: "security_research",
    findings: [
      "Skill files are a supply-chain attack surface because instructions and resources can manipulate agent behavior.",
      "Audits should treat skill text as data under review rather than instructions to obey.",
    ],
  },
];

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeComparable(value)
      .split("-")
      .filter((token) => token.length > 2),
  );
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function classifyClawHubComparable(input: {
  targetId: string;
  result: ClawHubSearchResult;
}): SkillDeepCritiqueCandidateRelevance {
  const target = normalizeComparable(input.targetId);
  const slug = normalizeComparable(input.result.slug);
  const displayName = normalizeComparable(input.result.displayName);
  const score = input.result.score ?? 0;
  const overlap = Math.max(overlapScore(target, slug), overlapScore(target, displayName));
  if (slug === target || displayName === target || (score >= 4 && overlap >= 0.6)) {
    return "exact_comparable";
  }
  if (score >= 1.1 && overlap >= 0.3) {
    return "partial_comparable";
  }
  if (score >= 3 && overlap >= 0.15) {
    return "partial_comparable";
  }
  return "irrelevant_noisy_hit";
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function critiqueText(input: SkillDeepCritiqueTarget): {
  blocking: string[];
  warnings: string[];
  item: Omit<
    SkillDeepCritiqueItem,
    | "targetId"
    | "targetSourcePaths"
    | "purpose"
    | "comparableCandidates"
    | "comparisonToClawHubFindings"
    | "verdict"
    | "noRawSkillContentIncluded"
  >;
} {
  const text = (input.skillText ?? "").toLowerCase();
  const missingText = !text.trim();
  const blocking: string[] = [];
  const warnings: string[] = [];
  const hasTrigger = hasAny(text, [
    "description:",
    "use when",
    "trigger",
    "trigger conditions",
    "## purpose",
    "when to use",
  ]);
  const hasProhibited = hasAny(text, ["prohibited actions", "do not", "never"]);
  const hasRuntimeTruth = hasAny(text, ["runtime truth", "execution platform", "work queue"]);
  const hasSecurity = hasAny(text, ["secret", "raw transcript", "hidden reasoning", "prompt"]);
  const hasValidation = hasAny(text, ["validation", "proof", "test"]);
  const hasEscalation = hasAny(text, ["escalation", "pause", "redirect", "stop", "blocked"]);
  const hasBoundedContext = hasAny(text, ["read only", "bounded", "progressive", "context"]);
  const hasDevilsAdvocate = hasAny(text, [
    "false positive",
    "false negative",
    "devil",
    "what would prove",
  ]);

  if (missingText) {
    blocking.push("skill_or_doc_text_missing");
  }
  if (!hasTrigger) {
    blocking.push("trigger_conditions_unclear");
  }
  if (!hasProhibited) {
    blocking.push("prohibited_actions_missing");
  }
  if (input.activeRuntimeSkill && input.requiredForBridgeSafety && !hasRuntimeTruth) {
    blocking.push("runtime_truth_boundary_missing");
  } else if (input.requiredForBridgeSafety && !hasRuntimeTruth) {
    warnings.push("runtime_truth_boundary_thin");
  }
  if (!hasValidation) {
    warnings.push("validation_or_proof_expectations_thin");
  }
  if (!hasSecurity) {
    warnings.push("security_prompt_or_secret_guidance_thin");
  }
  if (!hasEscalation) {
    warnings.push("failure_or_escalation_behavior_thin");
  }
  if (!hasBoundedContext) {
    warnings.push("bounded_context_guidance_thin");
  }
  if (
    input.activeRuntimeSkill &&
    input.targetId === "openclaw-bridge-safety" &&
    !hasDevilsAdvocate
  ) {
    warnings.push("devils_advocate_self_check_missing");
  }

  return {
    blocking,
    warnings,
    item: {
      triggerClarityCritique: hasTrigger
        ? ["Trigger language is present."]
        : ["Trigger language is too vague or absent."],
      instructionQualityCritique: hasBoundedContext
        ? ["Instructions include bounded/progressive context guidance."]
        : ["Instructions could over-consume context or leave context scope implicit."],
      prohibitedActionCoverageCritique: hasProhibited
        ? ["Prohibited action coverage is explicit."]
        : ["Prohibited actions are not explicit enough for bridge safety."],
      runtimeBoundaryCritique: hasRuntimeTruth
        ? ["Runtime truth boundaries are visible."]
        : ["Runtime authority and evidence boundaries are ambiguous."],
      securityCritique: hasSecurity
        ? ["Security-sensitive content handling is addressed."]
        : ["Secret, prompt-injection, or raw-content handling is too thin."],
      validationProofCritique: hasValidation
        ? ["Validation/proof expectations are visible."]
        : ["The skill does not say enough about proof that it worked or failed."],
      failureEscalationCritique: hasEscalation
        ? ["Escalation or stop conditions are represented."]
        : ["Failure and escalation behavior is under-specified."],
      comparisonToLocalRequirements: input.requiredForBridgeSafety
        ? [
            "Target is required for bridge safety and must satisfy runtime-truth, closeout, control, and validation gates.",
          ]
        : [
            "Target is adjacent to bridge safety and should not weaken the required bridge-safety basket.",
          ],
      comparisonToWebBestPractices: [
        "Compared against progressive disclosure, guardrail-boundary, tracing/evidence, and supply-chain criteria from the recorded web sources.",
      ],
      missingCapabilities: [...blocking, ...warnings],
      overbroadCapabilities:
        input.targetId === "openclaw-bridge-safety"
          ? [
              "Single bridge-safety pack covers many policies; future splits may reduce cognitive load after runtime hooks mature.",
            ]
          : [],
      ambiguityRisks: missingText
        ? ["No text available to disambiguate behavior."]
        : warnings.filter((warning) => warning.includes("thin")),
      promptInjectionSecurityRisks: hasSecurity
        ? []
        : [
            "Missing explicit instruction to treat untrusted skill files or transcript-like content as data.",
          ],
      runtimeAuthorityRisks: hasRuntimeTruth
        ? []
        : ["Could obscure the distinction between advisory skill text and runtime truth."],
      recommendedChanges: [],
    },
  };
}

function comparisonItemsForTarget(input: {
  targetId: string;
  comparison?: CodexBridgeClawHubComparisonReport;
}): CodexBridgeClawHubComparisonItem[] {
  return (
    input.comparison?.audited.filter(
      (item) =>
        item.query === input.targetId ||
        normalizeComparable(item.query) === normalizeComparable(input.targetId) ||
        overlapScore(item.query, input.targetId) >= 0.45,
    ) ?? []
  );
}

function comparableCandidates(input: {
  targetId: string;
  comparison?: CodexBridgeClawHubComparisonReport;
}): SkillDeepCritiqueComparable[] {
  const items = comparisonItemsForTarget(input);
  if (!items.length) {
    return [
      {
        query: input.targetId,
        slug: null,
        displayName: null,
        score: null,
        relevance: "unavailable",
        notes: ["No ClawHub comparison item was available for this target."],
      },
    ];
  }
  return items.flatMap((item): SkillDeepCritiqueComparable[] => {
    if (!item.results.length) {
      return [
        {
          query: item.query,
          slug: null,
          displayName: null,
          score: null,
          relevance:
            item.status === "skipped_timeout_or_noise" ? "skipped_due_bound" : "unavailable",
          notes: item.notes,
        },
      ];
    }
    return item.results.map((result) => ({
      query: item.query,
      slug: result.slug,
      displayName: result.displayName,
      score: result.score,
      relevance: classifyClawHubComparable({ targetId: input.targetId, result }),
      notes: item.notes,
    }));
  });
}

export async function buildSkillDeepCritiqueTargets(input: {
  inventory: CodexBridgeSkillInventoryReport;
  readTextFile?: (path: string) => Promise<string>;
  codexSkillRoot?: string;
  repoRoot?: string;
}): Promise<SkillDeepCritiqueTarget[]> {
  const readTextFile = input.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const repoRoot = input.repoRoot ?? DEFAULT_REPO_ROOT;
  const codexSkillRoot = input.codexSkillRoot ?? DEFAULT_CODEX_SKILL_ROOT;
  const requiredConceptIds = listRequiredCodexBridgeSkillDocs().map((entry) => entry.skillDocId);
  const requiredRegistryById = new Map(
    listRequiredCodexBridgeSkillDocs().map((entry) => [entry.skillDocId, entry]),
  );
  const explicitIds = [
    "work-queue-ux-review",
    "openclaw-bridge-safety",
    "skill-vetter",
    "skill-creator",
    "model-memory-deep-ingest",
    "ui-ux-pro-max",
    "clawhub",
    "skill-vetting",
    "openclaw-host-operator",
    "security-triage",
    "openclaw-qa-testing",
    ...requiredConceptIds,
  ];
  const itemsById = new Map<string, CodexBridgeSkillInventoryItem[]>();
  for (const item of input.inventory.items) {
    const existing = itemsById.get(item.skillDocId) ?? [];
    existing.push(item);
    itemsById.set(item.skillDocId, existing);
  }
  const fallbackPaths: Record<string, string> = {
    "work-queue-ux-review": path.join(codexSkillRoot, "work-queue-ux-review", "SKILL.md"),
    "openclaw-bridge-safety": path.join(codexSkillRoot, "openclaw-bridge-safety", "SKILL.md"),
    "skill-vetter": path.join(codexSkillRoot, "skill-vetter", "SKILL.md"),
    "skill-creator": path.join(codexSkillRoot, ".system", "skill-creator", "SKILL.md"),
    "model-memory-deep-ingest": path.join(codexSkillRoot, "model-memory-deep-ingest", "SKILL.md"),
    "ui-ux-pro-max": path.join(codexSkillRoot, "ui-ux-pro-max", "SKILL.md"),
    clawhub: path.join(repoRoot, "skills", "clawhub", "SKILL.md"),
    "skill-vetting": path.join(repoRoot, "skills", "skill-vetting", "SKILL.md"),
    "openclaw-host-operator": path.join(repoRoot, "skills", "openclaw-host-operator", "SKILL.md"),
    "security-triage": path.join(repoRoot, ".agents", "skills", "security-triage", "SKILL.md"),
    "openclaw-qa-testing": path.join(
      repoRoot,
      ".agents",
      "skills",
      "openclaw-qa-testing",
      "SKILL.md",
    ),
  };
  const targets: SkillDeepCritiqueTarget[] = [];
  for (const targetId of [...new Set(explicitIds)].toSorted()) {
    const inventoryItems = itemsById.get(targetId) ?? [];
    const registryRefs =
      requiredRegistryById
        .get(targetId)
        ?.requiredContextRefs.filter((ref) => ref.startsWith("/")) ?? [];
    const sourcePaths = inventoryItems.length
      ? inventoryItems.map((item) => item.path)
      : fallbackPaths[targetId]
        ? [fallbackPaths[targetId]]
        : registryRefs.length
          ? registryRefs
          : requiredConceptIds.includes(targetId)
            ? [path.join(codexSkillRoot, "openclaw-bridge-safety", "SKILL.md")]
            : [];
    let skillText = "";
    for (const sourcePath of sourcePaths) {
      try {
        skillText = await readTextFile(sourcePath);
        break;
      } catch {
        continue;
      }
    }
    targets.push({
      targetId,
      sourcePaths,
      purpose:
        inventoryItems[0]?.description ?? inventoryItems[0]?.name ?? targetId.replaceAll("-", " "),
      skillText,
      requiredForBridgeSafety: requiredConceptIds.includes(targetId),
      activeRuntimeSkill: sourcePaths.some((sourcePath) => sourcePath.includes("/.codex/skills/")),
    });
  }
  return targets;
}

export function critiqueSkillDeeply(input: {
  target: SkillDeepCritiqueTarget;
  comparison?: CodexBridgeClawHubComparisonReport;
  webSources?: SkillDeepCritiqueWebSource[];
}): SkillDeepCritiqueItem {
  const base = critiqueText(input.target);
  const candidates = comparableCandidates({
    targetId: input.target.targetId,
    comparison: input.comparison,
  });
  const exactComparable = candidates.some(
    (candidate) => candidate.relevance === "exact_comparable",
  );
  const partialComparable = candidates.some(
    (candidate) => candidate.relevance === "partial_comparable",
  );
  const noisyOnly = candidates.every(
    (candidate) =>
      candidate.relevance === "irrelevant_noisy_hit" || candidate.relevance === "unavailable",
  );
  const recommendedChanges = [...base.item.recommendedChanges];
  if (base.blocking.includes("prohibited_actions_missing")) {
    recommendedChanges.push("Add explicit prohibited actions before bridge use.");
  }
  if (base.blocking.includes("runtime_truth_boundary_missing")) {
    recommendedChanges.push("State Execution Platform runtime truth and Work Queue non-ownership.");
  }
  if (base.warnings.includes("validation_or_proof_expectations_thin")) {
    recommendedChanges.push("Add proof expectations and concrete evidence checks.");
  }
  if (base.warnings.includes("failure_or_escalation_behavior_thin")) {
    recommendedChanges.push("Add explicit stop, pause, redirect, or escalation triggers.");
  }
  if (input.target.targetId === "openclaw-bridge-safety") {
    recommendedChanges.push(
      "Reassess after fake control-loop proof; consider splitting repo/runtime truth and closeout/control guidance if the broad pack causes missed triggers.",
    );
  }
  if (exactComparable) {
    recommendedChanges.push(
      "Keep local skill only if it remains at least as specific as the exact ClawHub comparable.",
    );
  } else if (partialComparable) {
    recommendedChanges.push(
      "Borrow useful structure from partial comparables, but keep OpenClaw-specific runtime gates local.",
    );
  } else if (noisyOnly) {
    recommendedChanges.push(
      "Treat ClawHub results as non-substitutes; rely on local requirements and web best practices.",
    );
  }

  const verdict: SkillDeepCritiqueVerdict = base.blocking.length
    ? input.target.requiredForBridgeSafety || input.target.activeRuntimeSkill
      ? "needs_revision_before_bridge_use"
      : "blocked"
    : base.warnings.length
      ? "pass_with_minor_gaps"
      : "pass";

  return {
    targetId: input.target.targetId,
    targetSourcePaths: input.target.sourcePaths,
    purpose: input.target.purpose,
    ...base.item,
    comparisonToClawHubFindings: [
      exactComparable
        ? "ClawHub returned an exact comparable that should be used as a quality reference, not installed blindly."
        : partialComparable
          ? "ClawHub returned partial comparables only."
          : "ClawHub results were noisy, unavailable, or not strong substitutes.",
    ],
    recommendedChanges,
    comparableCandidates: candidates,
    verdict,
    noRawSkillContentIncluded: true,
  };
}

export function buildSkillDeepCritiqueReport(input: {
  auditId: string;
  checkedAt: string;
  targets: SkillDeepCritiqueTarget[];
  comparison?: CodexBridgeClawHubComparisonReport;
  webSources?: SkillDeepCritiqueWebSource[];
  changesApplied?: string[];
  additionalClawHubCommandsRun?: SkillDeepCritiqueReport["clawHubCommandsRun"];
}): SkillDeepCritiqueReport {
  const webSources = input.webSources ?? DEFAULT_SKILL_DEEP_CRITIQUE_WEB_SOURCES;
  const targets = input.targets.map((target) =>
    critiqueSkillDeeply({ target, comparison: input.comparison, webSources }),
  );
  const remainingBlockers = targets
    .filter((target) =>
      ["blocked", "needs_revision_before_bridge_use", "replace_or_split"].includes(target.verdict),
    )
    .map((target) => `${target.targetId}:${target.verdict}`);
  return {
    artifactKind: "codex_bridge_skill_deep_critique_8p_correction",
    auditId: input.auditId,
    checkedAt: input.checkedAt,
    targets,
    webSources,
    clawHubCommandsRun: [
      ...(input.comparison?.audited.map((item) => ({
        command: "clawhub search" as const,
        queryOrSlug: item.query,
        mode: "search_only" as const,
        installUpdatePublishPerformed: false as const,
      })) ?? []),
      ...(input.additionalClawHubCommandsRun ?? []),
    ],
    changesApplied: input.changesApplied ?? [],
    remainingBlockers,
    fakeControlLoopProofEligible: remainingBlockers.length === 0,
    codeWritingBridgePilotStillBlocked: true,
    codexCliInvoked: false,
    clawHubInstallUpdatePublishPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

function countByVerdict(targets: SkillDeepCritiqueItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of targets) {
    counts[target.verdict] = (counts[target.verdict] ?? 0) + 1;
  }
  return counts;
}

export function buildSkillDeepCritiqueArtifact(
  report: SkillDeepCritiqueReport,
): SkillDeepCritiqueArtifact {
  const candidates = report.targets.flatMap((target) => target.comparableCandidates);
  return {
    artifactKind: "codex_bridge_skill_deep_critique_artifact",
    auditId: report.auditId,
    checkedAt: report.checkedAt,
    targetCount: report.targets.length,
    verdictCounts: countByVerdict(report.targets),
    exactComparableCount: candidates.filter(
      (candidate) => candidate.relevance === "exact_comparable",
    ).length,
    partialComparableCount: candidates.filter(
      (candidate) => candidate.relevance === "partial_comparable",
    ).length,
    noisyComparableCount: candidates.filter(
      (candidate) => candidate.relevance === "irrelevant_noisy_hit",
    ).length,
    webSources: report.webSources,
    changesApplied: report.changesApplied,
    remainingBlockers: report.remainingBlockers,
    fakeControlLoopProofEligible: report.fakeControlLoopProofEligible,
    codeWritingBridgePilotStillBlocked: true,
    codexCliInvoked: false,
    clawHubInstallUpdatePublishPerformed: false,
    workQueueLifecycleMutated: false,
    summaries: report.targets.map((target) => ({
      targetId: target.targetId,
      verdict: target.verdict,
      recommendedChanges: target.recommendedChanges.slice(0, 8),
      missingCapabilities: target.missingCapabilities.slice(0, 8),
      overbroadCapabilities: target.overbroadCapabilities.slice(0, 4),
    })),
    noRawSkillContentIncluded: true,
  };
}

export async function writeSkillDeepCritiqueArtifact(input: {
  artifactPath: string;
  artifact: SkillDeepCritiqueArtifact;
}): Promise<void> {
  await writeFile(input.artifactPath, `${JSON.stringify(input.artifact, null, 2)}\n`, "utf8");
}

function boundSkillDeepCritiqueMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 520,
    maxArrayItems: 320,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export class CodexBridgeSkillDeepCritiqueRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: { maxArtifactMetadataBytes?: number } = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_SKILL_CRITIQUE_METADATA_BYTES;
  }

  async persistReport(input: {
    runtimeJobId: string;
    report: SkillDeepCritiqueReport | SkillDeepCritiqueArtifact;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundSkillDeepCritiqueMetadata(input.report as JsonValue);
    if (jsonByteLength(bounded) > this.maxArtifactMetadataBytes) {
      throw new Error("skill deep critique metadata exceeds artifact bounds");
    }
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.skill_deep_critique_report",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/skill-deep-critique`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_bridge.skill_deep_critique_checked",
      data: {
        artifactId: artifact.artifactId,
        noRawSkillContentIncluded: true,
        clawHubInstallUpdatePublishPerformed: false,
      },
    });
    return artifact;
  }
}
