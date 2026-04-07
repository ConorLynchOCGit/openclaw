import { createHash } from "node:crypto";

export const WORKFLOW_IMPROVEMENT_LESSON_KEYS = [
  "vitest_wrapper_required",
  "scripts_committer_required",
  "git_stash_unsafe",
  "docs_only_check_fast",
  "memory_proof_runner_required",
  "readyz_for_readiness",
  "python_command_unavailable",
  "gateway_tools_invoke_forbidden",
  "openai_embeddings_api_key_required",
  "anthropic_context1m_eligible_credential_required",
] as const;

export const WORKFLOW_IMPROVEMENT_TOOL_KEYS = [
  "vitest",
  "scripts_committer",
  "git_stash",
  "validation_tier",
  "memory_proof_runner",
  "gateway_readiness",
  "python_runtime",
  "gateway_tools_invoke",
  "openai_embeddings",
  "anthropic_context1m",
] as const;

export type WorkflowImprovementLessonKey = (typeof WORKFLOW_IMPROVEMENT_LESSON_KEYS)[number];
export type WorkflowImprovementToolKey = (typeof WORKFLOW_IMPROVEMENT_TOOL_KEYS)[number];
export type WorkflowImprovementSemanticConfidence = "high" | "medium";
export type WorkflowImprovementCaptureClass =
  | "workflow_tool_gotcha"
  | "workflow_environment_constraint"
  | "workflow_api_workaround"
  | "workflow_generalized_guidance";
export type WorkflowImprovementReasonCode =
  | "workflow_tool_gotcha_statement"
  | "workflow_environment_constraint_statement"
  | "workflow_api_workaround_statement"
  | "workflow_generalized_guidance_statement";
export type WorkflowImprovementTemplate =
  | "workflow_tool_gotcha"
  | "workflow_environment_constraint"
  | "workflow_api_workaround"
  | "workflow_generalized_guidance";
export type WorkflowImprovementLessonFamily = "supported_lesson" | "generalized_workflow_lesson";
export type WorkflowImprovementGuidancePattern =
  | "use_instead_of"
  | "trust_for_scope"
  | "avoid_only";

export type WorkflowImprovementCanonicalMatch = {
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonFamily: WorkflowImprovementLessonFamily;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
};

export type WorkflowImprovementSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: WorkflowImprovementSemanticConfidence;
      evidence: string[];
      match: WorkflowImprovementCanonicalMatch;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

type WorkflowImprovementSpec = {
  captureClass: WorkflowImprovementCaptureClass;
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  toolKey: WorkflowImprovementToolKey;
  subject: string;
  value: string;
  content: string;
};

const WORKFLOW_IMPROVEMENT_SPECS: Record<WorkflowImprovementLessonKey, WorkflowImprovementSpec> = {
  vitest_wrapper_required: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "vitest",
    subject: "test runner wrapper",
    value: "use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest",
    content:
      "Workflow improvement: use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest so the repo test wrapper stays active.",
  },
  scripts_committer_required: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "scripts_committer",
    subject: "scoped commit workflow",
    value: 'use scripts/committer "<msg>" <file...> instead of manual git add / git commit',
    content:
      'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
  },
  git_stash_unsafe: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "git_stash",
    subject: "multi-agent git state safety",
    value: "do not use git stash during multi-agent repo work",
    content:
      "Workflow improvement: do not use git stash during multi-agent repo work because it can disturb concurrent work.",
  },
  docs_only_check_fast: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "validation_tier",
    subject: "docs-only validation tier",
    value:
      "for docs or process-only work, use pnpm check:fast instead of full pnpm check, pnpm build, or full pnpm test",
    content:
      "Workflow improvement: for docs or process-only work, use pnpm check:fast instead of full pnpm check, pnpm build, or full pnpm test.",
  },
  memory_proof_runner_required: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "memory_proof_runner",
    subject: "memory proof workflow",
    value: "use pnpm memory:proof instead of bespoke host-side setup for bounded memory proof",
    content:
      "Workflow improvement: use pnpm memory:proof instead of bespoke host-side setup for bounded memory proof.",
  },
  readyz_for_readiness: {
    captureClass: "workflow_tool_gotcha",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    toolKey: "gateway_readiness",
    subject: "gateway readiness checks",
    value: "trust /readyz for readiness; /healthz is only a shallow liveness signal",
    content:
      "Workflow improvement: trust /readyz for readiness; /healthz is only a shallow liveness signal.",
  },
  python_command_unavailable: {
    captureClass: "workflow_environment_constraint",
    reasonCode: "workflow_environment_constraint_statement",
    template: "workflow_environment_constraint",
    toolKey: "python_runtime",
    subject: "python runtime availability",
    value: "python command is not available here; use node --input-type=module or tsx instead",
    content:
      "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
  },
  gateway_tools_invoke_forbidden: {
    captureClass: "workflow_environment_constraint",
    reasonCode: "workflow_environment_constraint_statement",
    template: "workflow_environment_constraint",
    toolKey: "gateway_tools_invoke",
    subject: "gateway tool invocation path",
    value: "gateway POST /tools/invoke is forbidden here; use direct runtime invocation instead",
    content:
      "Environment constraint: gateway POST /tools/invoke is forbidden in this environment; use direct runtime invocation instead.",
  },
  openai_embeddings_api_key_required: {
    captureClass: "workflow_api_workaround",
    reasonCode: "workflow_api_workaround_statement",
    template: "workflow_api_workaround",
    toolKey: "openai_embeddings",
    subject: "OpenAI embeddings auth",
    value:
      "OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings",
    content:
      "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
  },
  anthropic_context1m_eligible_credential_required: {
    captureClass: "workflow_api_workaround",
    reasonCode: "workflow_api_workaround_statement",
    template: "workflow_api_workaround",
    toolKey: "anthropic_context1m",
    subject: "Anthropic long-context eligibility",
    value:
      "Anthropic Extra usage required for long context requests means the credential is not eligible for context1m; use an eligible billed API key or disable context1m and keep a fallback model configured",
    content:
      "API workaround: Anthropic Extra usage required for long context requests means the credential is not eligible for context1m; use an eligible billed API key or disable context1m and keep a fallback model configured.",
  },
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeSemanticText(value: string): string {
  return normalizeLower(value)
    .replace(/[’']/g, "")
    .replace(/\bpython3\b/g, "python")
    .replace(/\bpnpm\s+test\s+--\b/g, "pnpm test")
    .replace(/\bpnpm\s+check:fast\b/g, "pnpm check fast")
    .replace(/\bpnpm\s+memory:proof\b/g, "pnpm memory proof")
    .replace(/\bproof[-\s]+runner\b/g, "proof runner")
    .replace(/\braw\s+vitest\b/g, "vitest")
    .replace(/\bscripts\s*\/\s*committer\b/g, "scripts/committer")
    .replace(/\bgit\s+add\s*\/\s*git\s+commit\b/g, "git add git commit")
    .replace(/\bpost\s+\/tools\/invoke\b/g, "/tools/invoke")
    .replace(/\btools invoke\b/g, "/tools/invoke")
    .replace(/\bopenai_api_key\b/g, "openai api key")
    .replace(/\bcontext1m\b/g, "context 1m")
    .replace(/\bcodex cli\b/g, "codex")
    .replace(/[^a-z0-9\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[.!?;:,]+$/g, "").trim();
}

function normalizeWorkflowSegment(value: string): string {
  return trimTerminalPunctuation(normalizeText(value))
    .replace(/\bplz\b/gi, "please")
    .replace(/\b(?:on|in)\s+this\s+(?:repo|repository|host|environment)\b/gi, "")
    .replace(/\bhere\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkflowScope(value: string): string {
  return normalizeWorkflowSegment(value)
    .replace(/\b(?:work|workflow)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRepoLocalMarker(value: string): boolean {
  return /\b(?:here|this repo|this repository|this host|this environment)\b/i.test(value);
}

function containsBlockedWorkflowTopic(value: string): boolean {
  return /\b(?:install|installer|procure|procurement|vet|vetted|approval|approve|buy|purchase)\b/i.test(
    value,
  );
}

function containsLikelySecretMaterial(value: string): boolean {
  return (
    /\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(value) ||
    /\b[A-Z][A-Z0-9_]{2,}=\S{8,}\b/.test(value) ||
    /\bBearer\s+\S{8,}\b/i.test(value)
  );
}

function buildGeneralizedWorkflowImprovementKey(params: {
  captureClass: WorkflowImprovementCaptureClass;
  normalizedSubject: string;
  normalizedRecommendedAction?: string;
  normalizedAvoidAction?: string;
  normalizedRationale?: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-generic-v1",
        params.captureClass,
        params.normalizedSubject,
        params.normalizedRecommendedAction ?? "",
        params.normalizedAvoidAction ?? "",
        params.normalizedRationale ?? "",
      ].join("|"),
    )
    .digest("hex");
}

function buildGeneralizedWorkflowImprovementSubjectKey(params: {
  captureClass: WorkflowImprovementCaptureClass;
  normalizedSubject: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-generic-subject-v1",
        params.captureClass,
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function buildWorkflowImprovementKey(params: {
  lessonKey: WorkflowImprovementLessonKey;
  captureClass: WorkflowImprovementCaptureClass;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-v1",
        params.captureClass,
        params.lessonKey,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildWorkflowImprovementSubjectKey(params: {
  lessonKey: WorkflowImprovementLessonKey;
  captureClass: WorkflowImprovementCaptureClass;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-subject-v1",
        params.captureClass,
        params.lessonKey,
      ].join("|"),
    )
    .digest("hex");
}

function createMatch(lessonKey: WorkflowImprovementLessonKey): WorkflowImprovementCanonicalMatch {
  const spec = WORKFLOW_IMPROVEMENT_SPECS[lessonKey];
  const normalizedSubject = normalizeLower(spec.subject);
  const normalizedValue = normalizeLower(spec.value);
  return {
    captureClass: spec.captureClass,
    candidateKind: "improvement",
    reasonCode: spec.reasonCode,
    template: spec.template,
    lessonFamily: "supported_lesson",
    lessonKey,
    toolKey: spec.toolKey,
    subject: spec.subject,
    value: spec.value,
    normalizedSubject,
    normalizedValue,
    content: spec.content,
    subjectKey: buildWorkflowImprovementSubjectKey({
      lessonKey,
      captureClass: spec.captureClass,
    }),
    key: buildWorkflowImprovementKey({
      lessonKey,
      captureClass: spec.captureClass,
      normalizedValue,
    }),
  };
}

function createGeneralizedMatch(params: {
  guidancePattern: WorkflowImprovementGuidancePattern;
  subject: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
}): WorkflowImprovementCanonicalMatch {
  const subject = normalizeWorkflowScope(params.subject);
  const recommendedAction = params.recommendedAction
    ? normalizeWorkflowSegment(params.recommendedAction)
    : undefined;
  const avoidAction = params.avoidAction ? normalizeWorkflowSegment(params.avoidAction) : undefined;
  const rationale = params.rationale ? normalizeWorkflowSegment(params.rationale) : undefined;
  const normalizedSubject = normalizeLower(subject);
  const normalizedRecommendedAction = recommendedAction
    ? normalizeLower(recommendedAction)
    : undefined;
  const normalizedAvoidAction = avoidAction ? normalizeLower(avoidAction) : undefined;
  const normalizedRationale = rationale ? normalizeLower(rationale) : undefined;

  let value: string;
  if (params.guidancePattern === "use_instead_of" && recommendedAction && avoidAction) {
    value = `for ${subject}, use ${recommendedAction} instead of ${avoidAction}`;
  } else if (params.guidancePattern === "trust_for_scope" && recommendedAction && avoidAction) {
    value = `for ${subject}, trust ${recommendedAction}; ${avoidAction} is only ${rationale ?? "a narrower signal"}`;
  } else if (avoidAction) {
    value = `for ${subject}, avoid ${avoidAction}`;
  } else if (recommendedAction) {
    value = `for ${subject}, use ${recommendedAction}`;
  } else {
    value = `for ${subject}, keep the workflow guidance explicit`;
  }
  if (
    rationale &&
    params.guidancePattern !== "trust_for_scope" &&
    !normalizeLower(value).includes(normalizeLower(rationale))
  ) {
    value = `${value} because ${rationale}`;
  }
  const normalizedValue = normalizeLower(value);

  return {
    captureClass: "workflow_generalized_guidance",
    candidateKind: "improvement",
    reasonCode: "workflow_generalized_guidance_statement",
    template: "workflow_generalized_guidance",
    lessonFamily: "generalized_workflow_lesson",
    guidancePattern: params.guidancePattern,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content: `Workflow improvement: ${value}.`,
    subjectKey: buildGeneralizedWorkflowImprovementSubjectKey({
      captureClass: "workflow_generalized_guidance",
      normalizedSubject,
    }),
    key: buildGeneralizedWorkflowImprovementKey({
      captureClass: "workflow_generalized_guidance",
      normalizedSubject,
      normalizedRecommendedAction,
      normalizedAvoidAction,
      normalizedRationale,
    }),
    ...(recommendedAction ? { recommendedAction, normalizedRecommendedAction } : {}),
    ...(avoidAction ? { avoidAction, normalizedAvoidAction } : {}),
    ...(rationale ? { rationale, normalizedRationale } : {}),
  };
}

function detectVitestLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    (/\buse pnpm test\b/.test(normalized) &&
      /\b(?:instead of|not)\b/.test(normalized) &&
      /\bvitest\b/.test(normalized)) ||
    (/\b(?:do not|dont|avoid|never)\b/.test(normalized) &&
      /\bvitest\b/.test(normalized) &&
      /\bpnpm test\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_vitest", "wrapper_command", "replacement_phrase"],
    };
  }

  if (
    /\bvitest\b/.test(normalized) &&
    (/\bwrapper\b/.test(normalized) ||
      /\bskips\b/.test(normalized) ||
      /\bbypasses\b/.test(normalized)) &&
    /\bpnpm test\b/.test(normalized)
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_vitest", "wrapper_reference", "pnpm_test_reference"],
    };
  }

  return null;
}

function detectScriptsCommitterLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    /\bscripts\/committer\b/.test(normalized) &&
    ((/\b(?:instead of|not)\b/.test(normalized) &&
      /\bgit add\b/.test(normalized) &&
      /\bgit commit\b/.test(normalized)) ||
      /\buse\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_scripts_committer", "commit_guidance", "replacement_phrase"],
    };
  }

  if (
    /\bscripts\/committer\b/.test(normalized) &&
    (/\bcommit\b/.test(normalized) ||
      /\bstaging\b/.test(normalized) ||
      /\bscoped\b/.test(normalized))
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_scripts_committer", "commit_context"],
    };
  }

  return null;
}

function detectGitStashLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    /\bgit stash\b/.test(normalized) &&
    /\b(?:do not|dont|avoid|never)\b/.test(normalized) &&
    (/\bmulti agent\b/.test(normalized) ||
      /\bconcurrent\b/.test(normalized) ||
      /\bthis repo\b/.test(normalized) ||
      /\bthis repository\b/.test(normalized) ||
      /\bhere\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_git_stash", "avoidance_phrase", "repo_context"],
    };
  }

  if (
    /\bgit stash\b/.test(normalized) &&
    (/\brisky\b/.test(normalized) ||
      /\bunsafe\b/.test(normalized) ||
      /\bdangerous\b/.test(normalized) ||
      /\bmulti agent\b/.test(normalized) ||
      /\bconcurrent\b/.test(normalized))
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_git_stash", "risk_phrase"],
    };
  }

  return null;
}

function detectDocsOnlyCheckFastLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasDocsOnlyScope =
    normalized.includes("docs-only") ||
    normalized.includes("docs only") ||
    normalized.includes("process-only") ||
    normalized.includes("process only") ||
    normalized.includes("docs/process-only") ||
    normalized.includes("changelog-only") ||
    normalized.includes("changelog only");
  const hasCheckFast = normalized.includes("pnpm check fast") || normalized.includes("check fast");
  const hasBroaderGate =
    normalized.includes("pnpm check") ||
    normalized.includes("pnpm build") ||
    normalized.includes("pnpm test") ||
    normalized.includes("full check") ||
    normalized.includes("full suite");

  if (
    hasDocsOnlyScope &&
    hasCheckFast &&
    (hasBroaderGate ||
      /\b(?:instead of|skip|no)\b/.test(normalized) ||
      normalized.includes("dont build") ||
      normalized.includes("do not build"))
  ) {
    return {
      confidence: "high",
      evidence: ["docs_only_scope", "check_fast", "broader_gate_reference"],
    };
  }

  if (hasDocsOnlyScope && hasCheckFast) {
    return {
      confidence: "medium",
      evidence: ["docs_only_scope", "check_fast"],
    };
  }

  return null;
}

function detectMemoryProofRunnerLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasProofCommand =
    normalized.includes("pnpm memory proof") || normalized.includes("memory proof");
  const hasProofContext =
    normalized.includes("proof runner") ||
    normalized.includes("bounded memory proof") ||
    normalized.includes("isolated proof") ||
    normalized.includes("production proof") ||
    normalized.includes("memory slice");
  const hasReplacement =
    /\b(?:instead of|use)\b/.test(normalized) &&
    (normalized.includes("bespoke") ||
      normalized.includes("host side") ||
      normalized.includes("manual") ||
      normalized.includes("bootstrap") ||
      normalized.includes("hand assembled"));

  if (hasProofCommand && hasProofContext && (hasReplacement || /\buse\b/.test(normalized))) {
    return {
      confidence: "high",
      evidence: ["memory_proof_command", "proof_context", "replacement_phrase"],
    };
  }

  if (hasProofCommand && hasProofContext) {
    return {
      confidence: "medium",
      evidence: ["memory_proof_command", "proof_context"],
    };
  }

  return null;
}

function detectReadyzLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasReadyz = normalized.includes("/readyz") || normalized.includes("readyz");
  const hasHealthz = normalized.includes("/healthz") || normalized.includes("healthz");
  const hasReadinessContext =
    normalized.includes("readiness") ||
    normalized.includes("rollout") ||
    normalized.includes("proof");
  const hasLiveness = normalized.includes("liveness") || normalized.includes("live only");

  if (hasReadyz && hasReadinessContext && (hasHealthz || hasLiveness)) {
    return {
      confidence: "high",
      evidence: ["readyz_probe", "readiness_context", "healthz_liveness_distinction"],
    };
  }

  if (hasReadyz && hasReadinessContext) {
    return {
      confidence: "medium",
      evidence: ["readyz_probe", "readiness_context"],
    };
  }

  return null;
}

function detectPythonUnavailableLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasPython = /\bpython\b/.test(normalized);
  const hasUnavailable =
    /\b(?:not available|unavailable|missing|not installed|isnt available|is not available)\b/.test(
      normalized,
    ) || /\bno python\b/.test(normalized);
  const hasReplacement =
    /\bnode\b/.test(normalized) ||
    /\btsx\b/.test(normalized) ||
    /\bbun\b/.test(normalized) ||
    /\binput-type=module\b/.test(normalized);

  if (hasPython && hasUnavailable && hasReplacement) {
    if (/\btsx\b/.test(normalized) || /\binput-type=module\b/.test(normalized)) {
      return {
        confidence: "high",
        evidence: ["system_python", "availability_constraint", "replacement_runtime"],
      };
    }
    return {
      confidence: "medium",
      evidence: ["system_python", "availability_constraint", "runtime_reference"],
    };
  }

  if (
    hasPython &&
    hasUnavailable &&
    (/\bhost\b/.test(normalized) ||
      /\benvironment\b/.test(normalized) ||
      /\bhere\b/.test(normalized))
  ) {
    return {
      confidence: "medium",
      evidence: ["system_python", "availability_constraint", "environment_reference"],
    };
  }

  return null;
}

function detectGatewayToolsInvokeLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasInvokePath =
    /\/tools\/invoke\b/.test(normalized) ||
    /\bbearer auth\b/.test(normalized) ||
    /\bgateway tool invoke\b/.test(normalized);
  const hasForbidden =
    /\b(?:forbidden|blocked|disallowed|not available|not allowed|cannot use|cant use)\b/.test(
      normalized,
    );
  const hasReplacement =
    /\bdirect runtime\b/.test(normalized) ||
    /\bin container\b/.test(normalized) ||
    /\bruntime invocation\b/.test(normalized);

  if (hasInvokePath && hasForbidden && hasReplacement) {
    return {
      confidence: "high",
      evidence: ["gateway_tools_invoke", "forbidden_phrase", "runtime_replacement"],
    };
  }

  if (hasInvokePath && hasForbidden) {
    return {
      confidence: "medium",
      evidence: ["gateway_tools_invoke", "forbidden_phrase"],
    };
  }

  return null;
}

function detectOpenAIEmbeddingsApiKeyLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasEmbeddings =
    /\bembedding\b/.test(normalized) ||
    /\bsemantic memory search\b/.test(normalized) ||
    /\bmemory search\b/.test(normalized);
  const hasCodex =
    /\bcodex\b/.test(normalized) || /\boauth\b/.test(normalized) || /\bchatgpt\b/.test(normalized);
  const hasApiKey =
    /\bopenai api key\b/.test(normalized) ||
    /\bapi key\b/.test(normalized) ||
    /\bprovider key\b/.test(normalized);
  const hasRequirement =
    /\b(?:require|requires|need|needs|still need)\b/.test(normalized) ||
    /\bdoes not help\b/.test(normalized) ||
    /\balone does not\b/.test(normalized);

  if (hasEmbeddings && hasCodex && hasApiKey && hasRequirement) {
    return {
      confidence: "high",
      evidence: ["openai_embeddings", "codex_oauth", "api_key_requirement"],
    };
  }

  if (hasEmbeddings && hasCodex && hasApiKey) {
    return {
      confidence: "medium",
      evidence: ["openai_embeddings", "codex_oauth", "api_key_reference"],
    };
  }

  return null;
}

function detectAnthropicContext1mLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  const hasAnthropic = /\banthropic\b/.test(normalized);
  const hasLongContext =
    /\blong context\b/.test(normalized) ||
    /\bcontext 1m\b/.test(normalized) ||
    /\bcontext1m\b/.test(normalized);
  const hasSpecificError =
    /extra usage is required for long context requests/.test(normalized) ||
    (/\b429\b/.test(normalized) && hasLongContext);
  const hasWorkaround =
    /\bfallback model\b/.test(normalized) ||
    /\bdisable context 1m\b/.test(normalized) ||
    /\beligible\b/.test(normalized) ||
    /\bbilled api key\b/.test(normalized) ||
    /\bapi key billing\b/.test(normalized);

  if (hasAnthropic && hasLongContext && hasSpecificError && hasWorkaround) {
    return {
      confidence: "high",
      evidence: ["anthropic_context1m", "specific_429_error", "workaround_reference"],
    };
  }

  if (hasAnthropic && hasLongContext && hasSpecificError) {
    return {
      confidence: "medium",
      evidence: ["anthropic_context1m", "specific_429_error"],
    };
  }

  return null;
}

function detectGeneralizedWorkflowLesson(text: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
} | null {
  const normalized = normalizeText(text);
  if (
    normalized.length < 24 ||
    normalized.length > 260 ||
    containsBlockedWorkflowTopic(normalized) ||
    containsLikelySecretMaterial(normalized)
  ) {
    return null;
  }

  const useInsteadPatterns = [
    /^(?:for|when|during|on)\s+(.{3,96}?),\s*(?:prefer|use)\s+(.{2,140}?)\s+instead of\s+(.{2,140}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
    /^(?:prefer|use)\s+(.{2,140}?)\s+for\s+(.{3,96}?)(?:\s+here|\s+in this repo|\s+on this host|\s+in this environment)?\s+instead of\s+(.{2,140}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
    /^(?:do not|don't|dont|avoid|never)\s+(.{2,140}?)(?:\s+(?:here|in this repo|on this host|in this environment))?(?:\s+for\s+(.{3,96}?))?(?:[;,]\s*|\s+instead[, ]+\s*)(?:prefer|use)\s+(.{2,140}?)(?:\s+instead)?(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  ];

  for (const pattern of useInsteadPatterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }
    if (pattern === useInsteadPatterns[0]) {
      const [, scope, recommendedAction, avoidAction, rationale] = match;
      return {
        confidence: hasRepoLocalMarker(normalized) ? "high" : "medium",
        evidence: ["generalized_workflow_pattern", "use_instead_of", "explicit_scope"],
        match: createGeneralizedMatch({
          guidancePattern: "use_instead_of",
          subject: scope,
          recommendedAction,
          avoidAction,
          ...(rationale ? { rationale } : {}),
        }),
      };
    }
    if (pattern === useInsteadPatterns[1]) {
      const [, recommendedAction, scope, avoidAction, rationale] = match;
      return {
        confidence: "high",
        evidence: ["generalized_workflow_pattern", "use_instead_of", "explicit_scope"],
        match: createGeneralizedMatch({
          guidancePattern: "use_instead_of",
          subject: scope,
          recommendedAction,
          avoidAction,
          ...(rationale ? { rationale } : {}),
        }),
      };
    }
    const [, avoidAction, scope, recommendedAction, rationale] = match;
    return {
      confidence: hasRepoLocalMarker(normalized) || Boolean(scope) ? "high" : "medium",
      evidence: ["generalized_workflow_pattern", "avoid_then_use"],
      match: createGeneralizedMatch({
        guidancePattern: "use_instead_of",
        subject: scope || "repo workflow",
        recommendedAction,
        avoidAction,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  const trustMatch = normalized.match(
    /^(?:trust|use)\s+(.{2,140}?)\s+for\s+(.{3,96}?)(?:\s+here|\s+in this repo|\s+on this host|\s+in this environment)?[;,]\s+(.{2,140}?)\s+is\s+only\s+(.{3,120}?)[.!?]?$/i,
  );
  if (trustMatch) {
    const [, recommendedAction, scope, avoidAction, rationale] = trustMatch;
    return {
      confidence: "high",
      evidence: ["generalized_workflow_pattern", "trust_for_scope", "signal_distinction"],
      match: createGeneralizedMatch({
        guidancePattern: "trust_for_scope",
        subject: scope,
        recommendedAction,
        avoidAction,
        rationale,
      }),
    };
  }

  const avoidOnlyMatch = normalized.match(
    /^(?:do not|don't|dont|avoid|never)\s+(.{2,140}?)\s+(?:for|during|when)\s+(.{3,96}?)(?:\s+here|\s+in this repo|\s+on this host|\s+in this environment)?(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (avoidOnlyMatch) {
    const [, avoidAction, scope, rationale] = avoidOnlyMatch;
    return {
      confidence: hasRepoLocalMarker(normalized) ? "high" : "medium",
      evidence: ["generalized_workflow_pattern", "avoid_only", "explicit_scope"],
      match: createGeneralizedMatch({
        guidancePattern: "avoid_only",
        subject: scope,
        avoidAction,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  return null;
}

export function isSupportedWorkflowImprovementLessonKey(
  value: string,
): value is WorkflowImprovementLessonKey {
  return WORKFLOW_IMPROVEMENT_LESSON_KEYS.includes(value as WorkflowImprovementLessonKey);
}

export function getWorkflowImprovementSpec(
  lessonKey: WorkflowImprovementLessonKey,
): WorkflowImprovementSpec {
  return WORKFLOW_IMPROVEMENT_SPECS[lessonKey];
}

export function detectWorkflowImprovementSemanticDecision(
  text: string,
): WorkflowImprovementSemanticCaptureDecision {
  const normalized = normalizeSemanticText(text);
  if (!normalized || normalized.length < 18 || normalized.length > 220) {
    return {
      action: "ignore",
      reason: "out_of_bounds",
      evidence: [],
    };
  }

  const vitest = detectVitestLesson(normalized);
  if (vitest) {
    return {
      action: "capture",
      confidence: vitest.confidence,
      evidence: vitest.evidence,
      match: createMatch("vitest_wrapper_required"),
    };
  }

  const scriptsCommitter = detectScriptsCommitterLesson(normalized);
  if (scriptsCommitter) {
    return {
      action: "capture",
      confidence: scriptsCommitter.confidence,
      evidence: scriptsCommitter.evidence,
      match: createMatch("scripts_committer_required"),
    };
  }

  const gitStash = detectGitStashLesson(normalized);
  if (gitStash) {
    return {
      action: "capture",
      confidence: gitStash.confidence,
      evidence: gitStash.evidence,
      match: createMatch("git_stash_unsafe"),
    };
  }

  const docsOnlyCheckFast = detectDocsOnlyCheckFastLesson(normalized);
  if (docsOnlyCheckFast) {
    return {
      action: "capture",
      confidence: docsOnlyCheckFast.confidence,
      evidence: docsOnlyCheckFast.evidence,
      match: createMatch("docs_only_check_fast"),
    };
  }

  const memoryProofRunner = detectMemoryProofRunnerLesson(normalized);
  if (memoryProofRunner) {
    return {
      action: "capture",
      confidence: memoryProofRunner.confidence,
      evidence: memoryProofRunner.evidence,
      match: createMatch("memory_proof_runner_required"),
    };
  }

  const readyz = detectReadyzLesson(normalized);
  if (readyz) {
    return {
      action: "capture",
      confidence: readyz.confidence,
      evidence: readyz.evidence,
      match: createMatch("readyz_for_readiness"),
    };
  }

  const pythonUnavailable = detectPythonUnavailableLesson(normalized);
  if (pythonUnavailable) {
    return {
      action: "capture",
      confidence: pythonUnavailable.confidence,
      evidence: pythonUnavailable.evidence,
      match: createMatch("python_command_unavailable"),
    };
  }

  const gatewayToolsInvoke = detectGatewayToolsInvokeLesson(normalized);
  if (gatewayToolsInvoke) {
    return {
      action: "capture",
      confidence: gatewayToolsInvoke.confidence,
      evidence: gatewayToolsInvoke.evidence,
      match: createMatch("gateway_tools_invoke_forbidden"),
    };
  }

  const openaiEmbeddings = detectOpenAIEmbeddingsApiKeyLesson(normalized);
  if (openaiEmbeddings) {
    return {
      action: "capture",
      confidence: openaiEmbeddings.confidence,
      evidence: openaiEmbeddings.evidence,
      match: createMatch("openai_embeddings_api_key_required"),
    };
  }

  const anthropicContext1m = detectAnthropicContext1mLesson(normalized);
  if (anthropicContext1m) {
    return {
      action: "capture",
      confidence: anthropicContext1m.confidence,
      evidence: anthropicContext1m.evidence,
      match: createMatch("anthropic_context1m_eligible_credential_required"),
    };
  }

  const generalizedWorkflowLesson = detectGeneralizedWorkflowLesson(text);
  if (generalizedWorkflowLesson) {
    return {
      action: "capture",
      confidence: generalizedWorkflowLesson.confidence,
      evidence: generalizedWorkflowLesson.evidence,
      match: generalizedWorkflowLesson.match,
    };
  }

  return {
    action: "ignore",
    reason: "unsupported_or_ambiguous_workflow_signal",
    evidence: [],
  };
}
