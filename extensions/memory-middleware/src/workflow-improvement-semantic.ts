import { createHash } from "node:crypto";

export type WorkflowImprovementSemanticConfidence = "high" | "medium";
export type WorkflowImprovementCaptureClass =
  | "workflow_tool_gotcha"
  | "workflow_environment_constraint"
  | "workflow_api_workaround"
  | "workflow_generalized_guidance"
  | "project_rule_guidance"
  | "unmet_need_recommendation";
export type WorkflowImprovementReasonCode =
  | "workflow_tool_gotcha_statement"
  | "workflow_environment_constraint_statement"
  | "workflow_api_workaround_statement"
  | "workflow_generalized_guidance_statement"
  | "project_rule_guidance_statement"
  | "unmet_need_recommendation_statement";
export type WorkflowImprovementTemplate =
  | "workflow_tool_gotcha"
  | "workflow_environment_constraint"
  | "workflow_api_workaround"
  | "workflow_generalized_guidance"
  | "project_rule_guidance"
  | "unmet_need_recommendation";
export type WorkflowImprovementLessonFamily =
  | "generalized_workflow_lesson"
  | "generalized_project_rule"
  | "generalized_unmet_need";
export type WorkflowImprovementGuidancePattern =
  | "use_instead_of"
  | "trust_for_scope"
  | "avoid_only";
export type WorkflowImprovementNeedCategory = "missing_workflow_support";
export type WorkflowImprovementSemanticProfileId =
  | "environment_constraint"
  | "workflow_tool_gotcha"
  | "api_workaround";

export type WorkflowImprovementCanonicalMatch = {
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonFamily: WorkflowImprovementLessonFamily;
  semanticProfileId?: WorkflowImprovementSemanticProfileId;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  projectScope?: string;
  normalizedProjectScope?: string;
  needCategory?: WorkflowImprovementNeedCategory;
  neededCapability?: string;
  normalizedNeededCapability?: string;
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

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function normalizeWorkflowImprovementSemanticText(value: string): string {
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
  guidancePattern: WorkflowImprovementGuidancePattern;
  normalizedSubject: string;
  normalizedRecommendedAction?: string;
  normalizedAvoidAction?: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-generic-cluster-v2",
        params.captureClass,
        params.guidancePattern,
        params.normalizedSubject,
        params.normalizedRecommendedAction ?? "",
        params.normalizedAvoidAction ?? "",
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

function buildSpecificWorkflowImprovementKey(params: {
  captureClass: WorkflowImprovementCaptureClass;
  semanticProfileId: WorkflowImprovementSemanticProfileId;
  normalizedSubject: string;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-specific-v2",
        params.captureClass,
        params.semanticProfileId,
        params.normalizedSubject,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildSpecificWorkflowImprovementSubjectKey(params: {
  captureClass: WorkflowImprovementCaptureClass;
  semanticProfileId: WorkflowImprovementSemanticProfileId;
  normalizedSubject: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-specific-subject-v2",
        params.captureClass,
        params.semanticProfileId,
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function createSpecificWorkflowImprovementMatch(params: {
  captureClass: Extract<
    WorkflowImprovementCaptureClass,
    "workflow_environment_constraint" | "workflow_api_workaround"
  >;
  reasonCode: Extract<
    WorkflowImprovementReasonCode,
    "workflow_environment_constraint_statement" | "workflow_api_workaround_statement"
  >;
  template: Extract<
    WorkflowImprovementTemplate,
    "workflow_environment_constraint" | "workflow_api_workaround"
  >;
  semanticProfileId: Extract<
    WorkflowImprovementSemanticProfileId,
    "environment_constraint" | "api_workaround"
  >;
  subject: string;
  value: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
}): WorkflowImprovementCanonicalMatch {
  const subject = normalizeWorkflowScope(params.subject);
  const value = trimTerminalPunctuation(normalizeText(params.value));
  const recommendedAction = params.recommendedAction
    ? normalizeWorkflowSegment(params.recommendedAction)
    : undefined;
  const avoidAction = params.avoidAction ? normalizeWorkflowSegment(params.avoidAction) : undefined;
  const rationale = params.rationale ? normalizeWorkflowSegment(params.rationale) : undefined;
  const normalizedSubject = normalizeLower(subject);
  const normalizedValue = normalizeLower(value);
  return {
    captureClass: params.captureClass,
    candidateKind: "improvement",
    reasonCode: params.reasonCode,
    template: params.template,
    lessonFamily: "generalized_workflow_lesson",
    semanticProfileId: params.semanticProfileId,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content:
      params.captureClass === "workflow_environment_constraint"
        ? `Environment constraint: ${value}.`
        : `API workaround: ${value}.`,
    subjectKey: buildSpecificWorkflowImprovementSubjectKey({
      captureClass: params.captureClass,
      semanticProfileId: params.semanticProfileId,
      normalizedSubject,
    }),
    key: buildSpecificWorkflowImprovementKey({
      captureClass: params.captureClass,
      semanticProfileId: params.semanticProfileId,
      normalizedSubject,
      normalizedValue,
    }),
    ...(recommendedAction
      ? {
          recommendedAction,
          normalizedRecommendedAction: normalizeLower(recommendedAction),
        }
      : {}),
    ...(avoidAction
      ? {
          avoidAction,
          normalizedAvoidAction: normalizeLower(avoidAction),
        }
      : {}),
    ...(rationale
      ? {
          rationale,
          normalizedRationale: normalizeLower(rationale),
        }
      : {}),
  };
}

export function createGeneralizedWorkflowImprovementMatch(params: {
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
      guidancePattern: params.guidancePattern,
      normalizedSubject,
      normalizedRecommendedAction,
      normalizedAvoidAction,
    }),
    ...(recommendedAction ? { recommendedAction, normalizedRecommendedAction } : {}),
    ...(avoidAction ? { avoidAction, normalizedAvoidAction } : {}),
    ...(rationale ? { rationale, normalizedRationale } : {}),
  };
}

function detectVitestWorkflowGuidance(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "use_instead_of",
        subject: "repo tests",
        recommendedAction: "pnpm test -- <path-or-filter> [vitest args...]",
        avoidAction: "raw vitest",
        rationale: "the repo test wrapper stays active",
      }),
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "use_instead_of",
        subject: "repo tests",
        recommendedAction: "pnpm test -- <path-or-filter> [vitest args...]",
        avoidAction: "raw vitest",
        rationale: "the repo test wrapper stays active",
      }),
    };
  }

  return null;
}

function detectScriptsCommitterWorkflowGuidance(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "use_instead_of",
        subject: "scoped commits",
        recommendedAction: 'scripts/committer "<msg>" <file...>',
        avoidAction: "manual git add / git commit",
        rationale: "staging stays scoped",
      }),
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "use_instead_of",
        subject: "scoped commits",
        recommendedAction: 'scripts/committer "<msg>" <file...>',
        avoidAction: "manual git add / git commit",
        rationale: "staging stays scoped",
      }),
    };
  }

  return null;
}

function detectGitStashWorkflowGuidance(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "avoid_only",
        subject: "concurrent repo work",
        avoidAction: "git stash",
        rationale: "it can disturb concurrent work",
      }),
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "avoid_only",
        subject: "concurrent repo work",
        avoidAction: "git stash",
        rationale: "it can disturb concurrent work",
      }),
    };
  }

  return null;
}

function detectPythonUnavailableLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
        match: createSpecificWorkflowImprovementMatch({
          captureClass: "workflow_environment_constraint",
          reasonCode: "workflow_environment_constraint_statement",
          template: "workflow_environment_constraint",
          semanticProfileId: "environment_constraint",
          subject: "python command availability",
          value:
            "python command is not available here; use node --input-type=module or tsx instead",
          recommendedAction: "node --input-type=module or tsx",
          avoidAction: "python",
          rationale: "python command is not available here",
        }),
      };
    }
    return {
      confidence: "medium",
      evidence: ["system_python", "availability_constraint", "runtime_reference"],
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_environment_constraint",
        reasonCode: "workflow_environment_constraint_statement",
        template: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        subject: "python command availability",
        value: "python command is not available here; use node --input-type=module or tsx instead",
        recommendedAction: "node --input-type=module or tsx",
        avoidAction: "python",
        rationale: "python command is not available here",
      }),
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
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_environment_constraint",
        reasonCode: "workflow_environment_constraint_statement",
        template: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        subject: "python command availability",
        value: "python command is not available here; use node --input-type=module or tsx instead",
        recommendedAction: "node --input-type=module or tsx",
        avoidAction: "python",
        rationale: "python command is not available here",
      }),
    };
  }

  return null;
}

function detectGatewayToolsInvokeLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_environment_constraint",
        reasonCode: "workflow_environment_constraint_statement",
        template: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        subject: "gateway tool invocation path",
        value: "gateway /tools/invoke is forbidden here; use direct runtime invocation instead",
        recommendedAction: "direct runtime invocation",
        avoidAction: "/tools/invoke",
        rationale: "gateway /tools/invoke is forbidden here",
      }),
    };
  }

  if (hasInvokePath && hasForbidden) {
    return {
      confidence: "medium",
      evidence: ["gateway_tools_invoke", "forbidden_phrase"],
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_environment_constraint",
        reasonCode: "workflow_environment_constraint_statement",
        template: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        subject: "gateway tool invocation path",
        value: "gateway /tools/invoke is forbidden here; use direct runtime invocation instead",
        recommendedAction: "direct runtime invocation",
        avoidAction: "/tools/invoke",
        rationale: "gateway /tools/invoke is forbidden here",
      }),
    };
  }

  return null;
}

function detectOpenAIEmbeddingsApiKeyLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_api_workaround",
        reasonCode: "workflow_api_workaround_statement",
        template: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        subject: "OpenAI embeddings auth",
        value:
          "OpenAI embeddings still need a configured OPENAI_API_KEY or another embeddings provider; codex OAuth alone does not help here",
        recommendedAction: "use a configured OPENAI_API_KEY or another embeddings provider",
        avoidAction: "codex OAuth alone",
        rationale: "semantic memory search still needs provider auth",
      }),
    };
  }

  if (hasEmbeddings && hasCodex && hasApiKey) {
    return {
      confidence: "medium",
      evidence: ["openai_embeddings", "codex_oauth", "api_key_reference"],
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_api_workaround",
        reasonCode: "workflow_api_workaround_statement",
        template: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        subject: "OpenAI embeddings auth",
        value:
          "OpenAI embeddings still need a configured OPENAI_API_KEY or another embeddings provider; codex OAuth alone does not help here",
        recommendedAction: "use a configured OPENAI_API_KEY or another embeddings provider",
        avoidAction: "codex OAuth alone",
        rationale: "semantic memory search still needs provider auth",
      }),
    };
  }

  return null;
}

function detectAnthropicContext1mLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  match: WorkflowImprovementCanonicalMatch;
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
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_api_workaround",
        reasonCode: "workflow_api_workaround_statement",
        template: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        subject: "Anthropic long-context eligibility",
        value:
          "Anthropic long-context requests need an eligible billed API key or a fallback model when the current credential is not eligible for context1m",
        recommendedAction:
          "use an eligible billed API key or disable context1m and keep a fallback model configured",
        avoidAction: "assuming the current credential can use context1m",
        rationale: "the current credential is not eligible for context1m",
      }),
    };
  }

  if (hasAnthropic && hasLongContext && hasSpecificError) {
    return {
      confidence: "medium",
      evidence: ["anthropic_context1m", "specific_429_error"],
      match: createSpecificWorkflowImprovementMatch({
        captureClass: "workflow_api_workaround",
        reasonCode: "workflow_api_workaround_statement",
        template: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        subject: "Anthropic long-context eligibility",
        value:
          "Anthropic long-context requests need an eligible billed API key or a fallback model when the current credential is not eligible for context1m",
        recommendedAction:
          "use an eligible billed API key or disable context1m and keep a fallback model configured",
        avoidAction: "assuming the current credential can use context1m",
        rationale: "the current credential is not eligible for context1m",
      }),
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
        match: createGeneralizedWorkflowImprovementMatch({
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
        match: createGeneralizedWorkflowImprovementMatch({
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
      match: createGeneralizedWorkflowImprovementMatch({
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
      match: createGeneralizedWorkflowImprovementMatch({
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
      match: createGeneralizedWorkflowImprovementMatch({
        guidancePattern: "avoid_only",
        subject: scope,
        avoidAction,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  return null;
}

export function detectWorkflowImprovementSemanticDecision(
  text: string,
): WorkflowImprovementSemanticCaptureDecision {
  const normalized = normalizeWorkflowImprovementSemanticText(text);
  if (!normalized || normalized.length < 18 || normalized.length > 220) {
    return {
      action: "ignore",
      reason: "out_of_bounds",
      evidence: [],
    };
  }

  const vitest = detectVitestWorkflowGuidance(normalized);
  if (vitest) {
    return {
      action: "capture",
      confidence: vitest.confidence,
      evidence: vitest.evidence,
      match: vitest.match,
    };
  }

  const scriptsCommitter = detectScriptsCommitterWorkflowGuidance(normalized);
  if (scriptsCommitter) {
    return {
      action: "capture",
      confidence: scriptsCommitter.confidence,
      evidence: scriptsCommitter.evidence,
      match: scriptsCommitter.match,
    };
  }

  const gitStash = detectGitStashWorkflowGuidance(normalized);
  if (gitStash) {
    return {
      action: "capture",
      confidence: gitStash.confidence,
      evidence: gitStash.evidence,
      match: gitStash.match,
    };
  }

  const pythonUnavailable = detectPythonUnavailableLesson(normalized);
  if (pythonUnavailable) {
    return {
      action: "capture",
      confidence: pythonUnavailable.confidence,
      evidence: pythonUnavailable.evidence,
      match: pythonUnavailable.match,
    };
  }

  const gatewayToolsInvoke = detectGatewayToolsInvokeLesson(normalized);
  if (gatewayToolsInvoke) {
    return {
      action: "capture",
      confidence: gatewayToolsInvoke.confidence,
      evidence: gatewayToolsInvoke.evidence,
      match: gatewayToolsInvoke.match,
    };
  }

  const openaiEmbeddings = detectOpenAIEmbeddingsApiKeyLesson(normalized);
  if (openaiEmbeddings) {
    return {
      action: "capture",
      confidence: openaiEmbeddings.confidence,
      evidence: openaiEmbeddings.evidence,
      match: openaiEmbeddings.match,
    };
  }

  const anthropicContext1m = detectAnthropicContext1mLesson(normalized);
  if (anthropicContext1m) {
    return {
      action: "capture",
      confidence: anthropicContext1m.confidence,
      evidence: anthropicContext1m.evidence,
      match: anthropicContext1m.match,
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
