import type { MemoryMiddlewareConfig } from "./config.js";
import {
  type ResolvedCanonicalizableIngestion,
  type ResolvedProjectFactIngestion,
  type ResolvedRecurringProcedureIngestion,
  type ResolvedResponseStyleIngestion,
  type ResolvedWorkflowIngestion,
} from "./memory-ingestion-resolver.js";
import {
  toOrdinaryTurnProjectFactMatch,
  toOrdinaryTurnRecurringProcedureMatch,
  toOrdinaryTurnResponseStyleMatch,
  toOrdinaryTurnWorkflowImprovementMatch,
} from "./memory-ingestion-types.js";
import type {
  MemorySemanticCaptureCategoryHint,
  MemorySemanticInterpretationDecision,
  MemorySemanticInterpretationLane,
  MemorySemanticReviewModeHint,
} from "./memory-semantic-interpretation.js";
import {
  createProjectFactCanonicalMatch,
  isBoundedGenericProjectFactReference,
  type ProjectFactFieldKey,
} from "./project-fact-semantic.js";
import { createProjectRuleCanonicalMatch } from "./project-rule-semantic.js";
import {
  createRecurringProcedureCanonicalMatch,
  getRecurringProcedureTitle,
  RECURRING_PROCEDURE_KEYS,
  type RecurringProcedureKey,
} from "./recurring-procedure-semantic.js";
import { createResponseStyleCanonicalMatch } from "./response-style-semantic.js";
import { createUnmetNeedCanonicalMatch } from "./unmet-need-semantic.js";
import {
  createGeneralizedWorkflowImprovementMatch,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementSemanticConfidence,
} from "./workflow-improvement-semantic.js";

export type ValidatedMemorySemanticDecision =
  | {
      action: "ignore";
      reason: string;
    }
  | {
      action: "forget";
      resolved: Extract<ResolvedResponseStyleIngestion, { action: "forget" }>;
    }
  | {
      action: "capture";
      resolved: ResolvedCanonicalizableIngestion;
      categoryOverride?: MemorySemanticCaptureCategoryHint;
    };

function resolveMostCautiousReviewMode(
  current: "direct" | "pending_confirmation" | "hold_for_more_evidence",
  hint?: MemorySemanticReviewModeHint,
): "direct" | "pending_confirmation" | "hold_for_more_evidence" {
  const rank = {
    direct: 0,
    pending_confirmation: 1,
    hold_for_more_evidence: 2,
  } as const;
  if (!hint) {
    return current;
  }
  return rank[hint] > rank[current] ? hint : current;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function normalizeSingleLine(value: string): string {
  return normalizeText(value).replace(/\n+/g, " ").trim();
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[.!?;:,]+$/g, "").trim();
}

function normalizeLower(value: string): string {
  return normalizeSingleLine(value).toLowerCase();
}

function mapInterpretationConfidence(
  value: "strong" | "medium" | "weak",
): "high" | "medium" | null {
  if (value === "strong") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return null;
}

function readEvidence(decision: MemorySemanticInterpretationDecision): string[] {
  return [
    "model_semantic_output",
    `semantic_class:${decision.semanticClass}`,
    ...decision.rationale.map((entry) => `model_rationale:${entry}`),
  ];
}

function inferResponseStyleCanonicalMatch(text: string, correction = false) {
  const normalized = normalizeLower(text);

  if (/\bplain english\b/.test(normalized)) {
    return createResponseStyleCanonicalMatch({
      template: "responses_plain_english",
      family: "supported_template",
      subject: "response language",
      value: "use plain English",
      ...(correction ? { captureClass: "requirement_correction" as const } : {}),
    });
  }
  if (/\b(?:bullet points|bullets)\b/.test(normalized)) {
    return createResponseStyleCanonicalMatch({
      template: "responses_bullets",
      family: "supported_template",
      subject: "response format",
      value: "use bullet points when listing items",
      ...(correction ? { captureClass: "requirement_correction" as const } : {}),
    });
  }
  if (/\b(?:numbered steps|numbered list|numbered lists)\b/.test(normalized)) {
    return createResponseStyleCanonicalMatch({
      template: "responses_numbered_steps",
      family: "supported_template",
      subject: "response format",
      value: "use numbered steps when giving instructions",
      ...(correction ? { captureClass: "requirement_correction" as const } : {}),
    });
  }
  if (/\b(?:do not use tables|dont use tables|don't use tables|avoid tables)\b/.test(normalized)) {
    return createResponseStyleCanonicalMatch({
      template: "responses_no_tables",
      family: "supported_template",
      subject: "response format",
      value: "do not use tables unless the user asks",
      ...(correction ? { captureClass: "requirement_correction" as const } : {}),
    });
  }
  if (
    /\b(?:keep responses concise|keep it short|shorter replies|be concise|brief replies)\b/.test(
      normalized,
    )
  ) {
    return createResponseStyleCanonicalMatch({
      template: "responses_concise",
      family: "supported_template",
      subject: "response style",
      value: "keep responses concise",
      ...(correction ? { captureClass: "requirement_correction" as const } : {}),
    });
  }

  const genericMatch = normalizeSingleLine(text).match(
    /^For (.+?), use (.+?)(?: because (.+))?[.]?$/i,
  );
  if (genericMatch) {
    const subject = trimTerminalPunctuation(genericMatch[1] ?? "");
    const value = `use ${trimTerminalPunctuation(genericMatch[2] ?? "")}`.trim();
    if (subject && value) {
      return createResponseStyleCanonicalMatch({
        template: "response_style_generalized_guidance",
        family: "generalized_guidance",
        subject,
        value,
        ...(correction ? { captureClass: "requirement_correction" as const } : {}),
      });
    }
  }

  return null;
}

function inferForgetResponseStyle(
  text: string,
): Extract<ResolvedResponseStyleIngestion, { action: "forget" }> | null {
  const normalized = normalizeSingleLine(text).replace(
    /^(?:forget|remove|drop)\s+(?:response (?:preference|requirement):\s*)?/i,
    "",
  );
  const match = inferResponseStyleCanonicalMatch(normalized);
  if (!match) {
    return null;
  }
  return {
    action: "forget",
    familyId: "response_style",
    source: "content",
    detectionSource: "deterministic",
    confidence: "high",
    evidence: ["model_semantic_output", "deterministic_forget_validation"],
    subject: match.subject,
    subjectKey: match.subjectKey,
    observedText: text,
  };
}

function inferFieldKey(subjectLabel: string): ProjectFactFieldKey | undefined {
  const normalized = trimTerminalPunctuation(subjectLabel)
    .toLowerCase()
    .replace(/^the\s+/, "");
  if (normalized === "default branch") {
    return "default_branch";
  }
  if (normalized === "staging branch") {
    return "staging_branch";
  }
  if (normalized === "repository url") {
    return "repository_url";
  }
  if (normalized === "deployment url") {
    return "deployment_url";
  }
  if (normalized === "documentation url") {
    return "documentation_url";
  }
  if (normalized === "runbook url") {
    return "runbook_url";
  }
  if (normalized === "primary package manager") {
    return "primary_package_manager";
  }
  if (normalized === "primary environment name") {
    return "primary_environment_name";
  }
  return undefined;
}

function inferProjectFactResolved(
  text: string,
  confidence: "high" | "medium",
): ResolvedProjectFactIngestion | null {
  const match = normalizeSingleLine(text).match(
    /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?), (?:the )?(.+?) is (.+?)[.]?$/i,
  );
  if (!match) {
    return null;
  }
  const projectScope = trimTerminalPunctuation(match[1] ?? "");
  const subjectLabel = trimTerminalPunctuation(match[2] ?? "");
  const value = trimTerminalPunctuation(match[3] ?? "");
  if (!projectScope || !subjectLabel || !value) {
    return null;
  }
  const fieldKey = inferFieldKey(subjectLabel);
  const factFamily = fieldKey
    ? "supported_field"
    : isBoundedGenericProjectFactReference({ subjectLabel, value })
      ? "generalized_reference"
      : null;
  if (!factFamily) {
    return null;
  }
  const canonical = createProjectFactCanonicalMatch({
    projectScope,
    subjectLabel,
    value,
    factFamily,
    ...(fieldKey ? { fieldKey } : {}),
  });
  return {
    familyId: "project_fact",
    parsed: toOrdinaryTurnProjectFactMatch(canonical),
    factFamily: canonical.factFamily,
    ...(canonical.fieldKey ? { fieldKey: canonical.fieldKey } : {}),
    reviewMode: confidence === "high" ? "pending_confirmation" : "hold_for_more_evidence",
    source: "content",
    detectionSource: "deterministic",
    confidence,
    evidence: ["model_semantic_output", "deterministic_project_fact_validation"],
    observedText: text,
  };
}

function parseProcedureSteps(body: string): string[] | null {
  const steps = normalizeText(body)
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:\d+[.)]|[-*])\s+(.+)$/)?.[1] ?? null)
    .filter((line): line is string => Boolean(line))
    .map((line) => trimTerminalPunctuation(line))
    .filter((line) => line.length >= 3);
  return steps.length >= 2 ? steps : null;
}

function inferProcedureKeyFromTitle(title: string): RecurringProcedureKey | undefined {
  const normalized = normalizeLower(title);
  return RECURRING_PROCEDURE_KEYS.find(
    (procedureKey) => normalizeLower(getRecurringProcedureTitle(procedureKey)) === normalized,
  );
}

function inferRecurringProcedureResolved(
  text: string,
  confidence: "high" | "medium",
): ResolvedRecurringProcedureIngestion | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/^([^\n:]{4,96}):\n([\s\S]+)$/);
  if (!match) {
    return null;
  }
  const title = trimTerminalPunctuation(match[1] ?? "");
  const steps = parseProcedureSteps(match[2] ?? "");
  if (!title || !steps) {
    return null;
  }
  const procedureKey = inferProcedureKeyFromTitle(title);
  const canonical = createRecurringProcedureCanonicalMatch({
    title,
    steps,
    procedureFamily: procedureKey ? "supported_key" : "generalized_named_checklist",
    ...(procedureKey ? { procedureKey } : {}),
  });
  return {
    familyId: "recurring_procedure",
    parsed: toOrdinaryTurnRecurringProcedureMatch(canonical),
    procedureFamily: canonical.procedureFamily,
    ...(canonical.procedureKey ? { procedureKey: canonical.procedureKey } : {}),
    reviewMode: confidence === "high" ? "pending_confirmation" : "hold_for_more_evidence",
    source: "content",
    detectionSource: "deterministic",
    confidence,
    evidence: ["model_semantic_output", "deterministic_procedure_validation"],
    observedText: text,
  };
}

function inferWorkflowGuidancePattern(
  recommendedAction?: string,
  avoidAction?: string,
  trustSignal?: boolean,
): WorkflowImprovementGuidancePattern {
  if (trustSignal && recommendedAction && avoidAction) {
    return "trust_for_scope";
  }
  if (recommendedAction && avoidAction) {
    return "use_instead_of";
  }
  return "avoid_only";
}

function inferWorkflowResolved(params: {
  text: string;
  confidence: WorkflowImprovementSemanticConfidence;
  categoryHint: "workflow_improvement" | "project_rule" | "unmet_need" | "reference_routing";
}): {
  resolved: ResolvedWorkflowIngestion;
  categoryOverride?: "reference_routing";
} | null {
  const singleLine = normalizeSingleLine(params.text);

  if (params.categoryHint === "unmet_need") {
    const unmetMatch = singleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?), we (?:need|are missing) (.+?) for (.+?)(?: because (.+))?[.]?$/i,
    );
    if (!unmetMatch) {
      return null;
    }
    const canonical = createUnmetNeedCanonicalMatch({
      projectScope: unmetMatch[1] ?? "",
      neededCapability: unmetMatch[2] ?? "",
      subject: unmetMatch[3] ?? "",
      ...(unmetMatch[4] ? { rationale: unmetMatch[4] } : {}),
    });
    return {
      resolved: {
        captureCategory: "unmet_need",
        parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
        lessonFamily: canonical.lessonFamily,
        reviewMode: "hold_for_more_evidence",
        source: "content",
        detectionSource: "deterministic",
        confidence: params.confidence,
        evidence: ["model_semantic_output", "deterministic_unmet_need_validation"],
        observedText: params.text,
      },
    };
  }

  if (params.categoryHint === "project_rule") {
    const trustMatch = singleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?), trust (.+?) for (.+?); (.+?) is only (.+?)[.]?$/i,
    );
    if (trustMatch) {
      const canonical = createProjectRuleCanonicalMatch({
        projectScope: trustMatch[1] ?? "",
        guidancePattern: "trust_for_scope",
        recommendedAction: trustMatch[2] ?? "",
        subject: trustMatch[3] ?? "",
        avoidAction: trustMatch[4] ?? "",
        rationale: trustMatch[5] ?? "",
      });
      return {
        resolved: {
          captureCategory: "project_rule",
          parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
          lessonFamily: canonical.lessonFamily,
          guidancePattern: canonical.guidancePattern,
          reviewMode: "hold_for_more_evidence",
          source: "content",
          detectionSource: "deterministic",
          confidence: params.confidence,
          evidence: ["model_semantic_output", "deterministic_project_rule_validation"],
          observedText: params.text,
        },
      };
    }
    const useMatch = singleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?), use (.+?) for (.+?)(?: instead of (.+?))?(?: because (.+))?[.]?$/i,
    );
    if (!useMatch) {
      return null;
    }
    const canonical = createProjectRuleCanonicalMatch({
      projectScope: useMatch[1] ?? "",
      guidancePattern: useMatch[4] ? "use_instead_of" : "avoid_only",
      recommendedAction: useMatch[2] ?? "",
      subject: useMatch[3] ?? "",
      ...(useMatch[4] ? { avoidAction: useMatch[4] } : {}),
      ...(useMatch[5] ? { rationale: useMatch[5] } : {}),
    });
    return {
      resolved: {
        captureCategory: "project_rule",
        parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
        lessonFamily: canonical.lessonFamily,
        guidancePattern: canonical.guidancePattern,
        reviewMode:
          params.confidence === "high" ? "pending_confirmation" : "hold_for_more_evidence",
        source: "content",
        detectionSource: "deterministic",
        confidence: params.confidence,
        evidence: ["model_semantic_output", "deterministic_project_rule_validation"],
        observedText: params.text,
      },
    };
  }

  const trustMatch = singleLine.match(/^For (.+?), trust (.+?); (.+?) is only (.+?)[.]?$/i);
  if (trustMatch) {
    const canonical = createGeneralizedWorkflowImprovementMatch({
      guidancePattern: "trust_for_scope",
      subject: trustMatch[1] ?? "",
      recommendedAction: trustMatch[2] ?? "",
      avoidAction: trustMatch[3] ?? "",
      rationale: trustMatch[4] ?? "",
    });
    return {
      resolved: {
        captureCategory: "workflow_improvement",
        parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
        lessonFamily: canonical.lessonFamily,
        guidancePattern: canonical.guidancePattern,
        reviewMode: "hold_for_more_evidence",
        source: "content",
        detectionSource: "deterministic",
        confidence: params.confidence,
        evidence: ["model_semantic_output", "deterministic_workflow_validation"],
        observedText: params.text,
      },
      ...(params.categoryHint === "reference_routing"
        ? { categoryOverride: "reference_routing" as const }
        : {}),
    };
  }

  const useMatch = singleLine.match(
    /^For (.+?), use (.+?)(?: instead of (.+?))?(?: because (.+))?[.]?$/i,
  );
  if (useMatch) {
    const canonical = createGeneralizedWorkflowImprovementMatch({
      guidancePattern: inferWorkflowGuidancePattern(useMatch[2], useMatch[3]),
      subject: useMatch[1] ?? "",
      recommendedAction: useMatch[2] ?? "",
      ...(useMatch[3] ? { avoidAction: useMatch[3] } : {}),
      ...(useMatch[4] ? { rationale: useMatch[4] } : {}),
    });
    return {
      resolved: {
        captureCategory: "workflow_improvement",
        parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
        lessonFamily: canonical.lessonFamily,
        guidancePattern: canonical.guidancePattern,
        reviewMode:
          params.confidence === "high" ? "pending_confirmation" : "hold_for_more_evidence",
        source: "content",
        detectionSource: "deterministic",
        confidence: params.confidence,
        evidence: ["model_semantic_output", "deterministic_workflow_validation"],
        observedText: params.text,
      },
      ...(params.categoryHint === "reference_routing"
        ? { categoryOverride: "reference_routing" as const }
        : {}),
    };
  }

  const avoidMatch = singleLine.match(/^For (.+?), avoid (.+?)(?: because (.+))?[.]?$/i);
  if (!avoidMatch) {
    return null;
  }
  const canonical = createGeneralizedWorkflowImprovementMatch({
    guidancePattern: "avoid_only",
    subject: avoidMatch[1] ?? "",
    avoidAction: avoidMatch[2] ?? "",
    ...(avoidMatch[3] ? { rationale: avoidMatch[3] } : {}),
  });
  return {
    resolved: {
      captureCategory: "workflow_improvement",
      parsed: toOrdinaryTurnWorkflowImprovementMatch(canonical),
      lessonFamily: canonical.lessonFamily,
      guidancePattern: canonical.guidancePattern,
      reviewMode: "hold_for_more_evidence",
      source: "content",
      detectionSource: "deterministic",
      confidence: params.confidence,
      evidence: ["model_semantic_output", "deterministic_workflow_validation"],
      observedText: params.text,
    },
    ...(params.categoryHint === "reference_routing"
      ? { categoryOverride: "reference_routing" as const }
      : {}),
  };
}

export async function validateMemorySemanticDecision(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  decision: MemorySemanticInterpretationDecision;
  projectId?: string;
}): Promise<ValidatedMemorySemanticDecision> {
  const { decision } = params;
  void params.config;
  void params.lane;
  void params.projectId;

  if (decision.action === "ignore") {
    return {
      action: "ignore",
      reason: decision.rationale.join("; "),
    };
  }

  const confidence = mapInterpretationConfidence(decision.confidence);
  if (!confidence) {
    return {
      action: "ignore",
      reason: "model confidence below deterministic acceptance threshold",
    };
  }

  if (decision.action === "forget") {
    const resolved = inferForgetResponseStyle(decision.candidateText);
    return resolved
      ? { action: "forget", resolved }
      : {
          action: "ignore",
          reason: "model forget decision did not validate against the response-style contract",
        };
  }

  const applyReviewModeHint = <
    T extends { reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence" },
  >(
    resolved: T,
  ): T => ({
    ...resolved,
    reviewMode: resolveMostCautiousReviewMode(resolved.reviewMode, decision.reviewModeHint),
  });

  switch (decision.captureCategoryHint) {
    case "response_style": {
      const canonical = inferResponseStyleCanonicalMatch(decision.candidateText);
      if (!canonical) {
        return {
          action: "ignore",
          reason:
            "model response-style candidate did not validate against the response-style contract",
        };
      }
      return {
        action: "capture",
        resolved: applyReviewModeHint({
          action: "capture",
          familyId: "response_style",
          parsed: toOrdinaryTurnResponseStyleMatch(canonical),
          responseStyleFamily: canonical.family,
          reviewMode:
            canonical.family === "generalized_guidance" ? "hold_for_more_evidence" : "direct",
          source: "content",
          detectionSource: "deterministic",
          confidence,
          evidence: readEvidence(decision),
          observedText: decision.candidateText,
        }),
      };
    }
    case "project_fact": {
      const resolved = inferProjectFactResolved(decision.candidateText, confidence);
      return resolved
        ? { action: "capture", resolved: applyReviewModeHint(resolved) }
        : {
            action: "ignore",
            reason:
              "model project-fact candidate did not validate against the project-fact contract",
          };
    }
    case "recurring_procedure": {
      const resolved = inferRecurringProcedureResolved(decision.candidateText, confidence);
      return resolved
        ? { action: "capture", resolved: applyReviewModeHint(resolved) }
        : {
            action: "ignore",
            reason:
              "model procedure candidate did not validate against the recurring-procedure contract",
          };
    }
    case "workflow_improvement":
    case "project_rule":
    case "unmet_need":
    case "reference_routing": {
      const workflow = inferWorkflowResolved({
        text: decision.candidateText,
        confidence,
        categoryHint: decision.captureCategoryHint,
      });
      if (!workflow) {
        return {
          action: "ignore",
          reason: "model workflow candidate did not validate against the workflow contract",
        };
      }
      return {
        action: "capture",
        resolved: applyReviewModeHint(workflow.resolved),
        ...(workflow.categoryOverride ? { categoryOverride: workflow.categoryOverride } : {}),
      };
    }
  }
}
