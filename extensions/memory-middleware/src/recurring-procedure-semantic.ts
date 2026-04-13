// Legacy compatibility detector only.

import { createHash } from "node:crypto";

export const RECURRING_PROCEDURE_KEYS = [
  "deploy_checklist",
  "release_checklist",
  "triage_checklist",
  "investigation_checklist",
] as const;

export type RecurringProcedureKey = (typeof RECURRING_PROCEDURE_KEYS)[number];
export type RecurringProcedureFamily = "supported_key" | "generalized_named_checklist";
export type RecurringProcedureSemanticConfidence = "high" | "medium";

export type RecurringProcedureCanonicalMatch = {
  captureClass: "explicit_recurring_procedure" | "recurring_procedure_correction";
  candidateKind: "procedure";
  reasonCode: "explicit_recurring_procedure_statement" | "recurring_procedure_correction";
  template: "named_recurring_checklist" | "generalized_recurring_checklist";
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  title: string;
  body: string;
  steps: string[];
  normalizedTitle: string;
  normalizedBody: string;
  content: string;
  subjectKey: string;
  key: string;
};

export type RecurringProcedureSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: RecurringProcedureSemanticConfidence;
      evidence: string[];
      match: RecurringProcedureCanonicalMatch;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

type ProcedureKeySpec = {
  title: string;
  aliases: string[];
  nounPhrases: string[];
};

const PROCEDURE_KEY_SPECS: Record<RecurringProcedureKey, ProcedureKeySpec> = {
  deploy_checklist: {
    title: "Deploy checklist",
    aliases: ["deploy", "deployment", "ship deploy"],
    nounPhrases: ["deploy checklist", "deployment checklist", "deploy steps"],
  },
  release_checklist: {
    title: "Release checklist",
    aliases: ["release", "releases", "ship release"],
    nounPhrases: ["release checklist", "release steps", "release process"],
  },
  triage_checklist: {
    title: "Triage checklist",
    aliases: ["triage", "incident triage", "bug triage"],
    nounPhrases: ["triage checklist", "triage steps"],
  },
  investigation_checklist: {
    title: "Investigation checklist",
    aliases: ["investigation", "debug investigation", "incident investigation"],
    nounPhrases: ["investigation checklist", "investigation steps", "debug checklist"],
  },
};

const CORRECTION_PREFIX_PATTERNS = [
  /^actually\b/i,
  /^no\b/i,
  /^sorry\b/i,
  /^i meant\b/i,
  /^correction\b/i,
  /^thats not right\b/i,
  /^that's not right\b/i,
];

const EXPLICIT_PATTERNS = [
  /^(?:remember|save|store)\s+(?:this|it)\s+as\s+(?:my\s+)?(.+?)[:,-]?\s*([\s\S]+)$/i,
  /^(?:here(?:'s| is)|this is)\s+(?:my\s+)?(.+?)[:,-]?\s*([\s\S]+)$/i,
  /^(?:my|our)\s+(.+? checklist)\s*[:,-]\s*([\s\S]+)$/i,
  /^(?:my\s+)?(.+?)\s+(?:is|looks like)\s*[:,-]?\s*([\s\S]+)$/i,
];

const MEDIUM_PATTERNS = [
  /^(?:for|during)\s+(.+?),?\s+we\s+(?:usually\s+)?(?:use|follow)\s+(?:this\s+)?(?:checklist|steps?)[:,-]?\s*([\s\S]+)$/i,
  /^(?:our|the)\s+(.+?)\s+(?:checklist|steps?)\s+(?:are|look like)\s*[:,-]?\s*([\s\S]+)$/i,
];

const GENERIC_PROCEDURE_SUFFIX_PATTERN = /\b(checklist|procedure|playbook|runbook|steps)\b/i;
const GENERIC_PROCEDURE_BLOCKLIST_PATTERN =
  /\b(today|tonight|tomorrow|right now|for now|one[ -]?off|temporary|quick fix|this deploy|this release|this incident)\b/i;
const GENERIC_PROCEDURE_AMBIGUOUS_LABEL_PATTERN = /^(?:this|that|it|here|there|one)$/i;

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function buildAutoCaptureKey(params: { normalizedTitle: string; normalizedBody: string }): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "recurring-procedure-v1",
        "named_recurring_checklist",
        params.normalizedTitle,
        params.normalizedBody,
      ].join("|"),
    )
    .digest("hex");
}

function buildAutoCaptureSubjectKey(params: { normalizedTitle: string }): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "recurring-procedure-subject-v1",
        "named_recurring_checklist",
        params.normalizedTitle,
      ].join("|"),
    )
    .digest("hex");
}

function stripCorrectionPrefix(text: string): { normalized: string; corrected: boolean } {
  for (const pattern of CORRECTION_PREFIX_PATTERNS) {
    if (pattern.test(text)) {
      return {
        normalized: normalizeText(text.replace(pattern, "").replace(/^[:,\s-]+/, "")),
        corrected: true,
      };
    }
  }
  return { normalized: text, corrected: false };
}

function inferProcedureKey(rawLabel: string): RecurringProcedureKey | null {
  const normalized = normalizeLower(rawLabel)
    .replace(/\bmy\b/g, "")
    .replace(/\bour\b/g, "")
    .replace(/\bthis\b/g, "")
    .replace(/\bthe\b/g, "")
    .replace(/\bchecklist\b/g, "")
    .replace(/\bsteps\b/g, "")
    .replace(/\bprocess\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }

  for (const [procedureKey, spec] of Object.entries(PROCEDURE_KEY_SPECS) as Array<
    [RecurringProcedureKey, ProcedureKeySpec]
  >) {
    if (spec.aliases.some((alias) => normalized === alias)) {
      return procedureKey;
    }
    if (
      spec.nounPhrases.some((phrase) => normalizeLower(rawLabel) === phrase) ||
      normalizeLower(spec.title) ===
        normalizeLower(rawLabel)
          .replace(/\bmy\b/g, "")
          .trim()
    ) {
      return procedureKey;
    }
  }
  return null;
}

function toDisplayProcedureTitle(value: string): string {
  return normalizeText(value)
    .split(/\s+/)
    .map((segment) =>
      segment.length <= 2 || /^[A-Z0-9#/_-]+$/.test(segment)
        ? segment
        : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join(" ");
}

function cleanGenericProcedureLabel(rawLabel: string): string {
  return normalizeText(rawLabel)
    .replace(/^[,:;\-\s]+/, "")
    .replace(/[,:;\-\s]+$/, "")
    .replace(/\b(?:my|our|the|this)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferGenericProcedureTitleFromExplicitLabel(rawLabel: string): string | null {
  const cleaned = cleanGenericProcedureLabel(rawLabel);
  if (
    !cleaned ||
    cleaned.length < 8 ||
    cleaned.length > 96 ||
    GENERIC_PROCEDURE_AMBIGUOUS_LABEL_PATTERN.test(cleaned) ||
    GENERIC_PROCEDURE_BLOCKLIST_PATTERN.test(cleaned) ||
    !GENERIC_PROCEDURE_SUFFIX_PATTERN.test(cleaned)
  ) {
    return null;
  }
  return toDisplayProcedureTitle(cleaned);
}

function inferGenericProcedureTitleFromMediumSubject(rawLabel: string): string | null {
  const cleaned = cleanGenericProcedureLabel(rawLabel);
  if (
    !cleaned ||
    cleaned.length < 8 ||
    cleaned.length > 88 ||
    GENERIC_PROCEDURE_AMBIGUOUS_LABEL_PATTERN.test(cleaned) ||
    GENERIC_PROCEDURE_BLOCKLIST_PATTERN.test(cleaned)
  ) {
    return null;
  }
  const titled = GENERIC_PROCEDURE_SUFFIX_PATTERN.test(cleaned) ? cleaned : `${cleaned} checklist`;
  return toDisplayProcedureTitle(titled);
}

function isExplicitActionProcedureStep(step: string): boolean {
  const normalizedStep = normalizeText(step);
  const colonIndex = normalizedStep.indexOf(":");
  const actionLead =
    colonIndex > 0 && colonIndex < normalizedStep.length - 1
      ? normalizeText(normalizedStep.slice(colonIndex + 1))
      : normalizedStep;
  return /^(?:run|add|freeze|capture|confirm|rerun|commit|push|verify|iterate|fill|reuse|prefer|use|treat|trust|include|avoid|do not|keep|save|post|update|follow|check|debug)\b/i.test(
    actionLead,
  );
}

function isActionableProcedureStep(step: string): boolean {
  const normalizedStep = normalizeText(step);
  if (isExplicitActionProcedureStep(normalizedStep)) {
    return true;
  }
  const colonIndex = normalizedStep.indexOf(":");
  return colonIndex > 0 && /`[^`]{2,80}`/.test(normalizedStep);
}

function hasActionableProcedureSteps(steps: string[]): boolean {
  return steps.filter((step) => isActionableProcedureStep(step)).length >= 2;
}

function hasExplicitActionProcedureSteps(steps: string[]): boolean {
  return steps.some((step) => isExplicitActionProcedureStep(step));
}

function inferGenericProcedureTitleFromStructuredLabel(
  rawLabel: string,
  steps: string[],
): string | null {
  const supportedTitle = inferProcedureKey(rawLabel);
  if (supportedTitle) {
    return PROCEDURE_KEY_SPECS[supportedTitle].title;
  }

  const explicitGenericTitle = inferGenericProcedureTitleFromExplicitLabel(rawLabel);
  if (explicitGenericTitle) {
    return explicitGenericTitle;
  }

  const cleaned = cleanGenericProcedureLabel(rawLabel);
  if (
    !cleaned ||
    cleaned.length < 6 ||
    cleaned.length > 96 ||
    GENERIC_PROCEDURE_AMBIGUOUS_LABEL_PATTERN.test(cleaned) ||
    GENERIC_PROCEDURE_BLOCKLIST_PATTERN.test(cleaned)
  ) {
    return null;
  }

  if (/\bphase order\b/i.test(cleaned)) {
    return toDisplayProcedureTitle(cleaned);
  }
  if (/\bgate\b/i.test(cleaned) && hasActionableProcedureSteps(steps)) {
    return toDisplayProcedureTitle(cleaned);
  }
  if (/\btiming\b/i.test(cleaned) && hasActionableProcedureSteps(steps)) {
    return toDisplayProcedureTitle(cleaned);
  }
  if (/\bverification\b/i.test(cleaned) && steps.length >= 2) {
    return toDisplayProcedureTitle(cleaned);
  }
  if (
    hasActionableProcedureSteps(steps) &&
    hasExplicitActionProcedureSteps(steps) &&
    cleaned.length <= 72
  ) {
    return toDisplayProcedureTitle(cleaned);
  }

  return null;
}

function cleanStep(step: string): string {
  return normalizeText(step)
    .replace(/[.!?]+$/, "")
    .replace(/^["']+|["']+$/g, "");
}

function parseChecklistSteps(body: string): string[] | null {
  const normalized = normalizeText(body);
  if (!normalized) {
    return null;
  }

  const multilineSteps = normalized
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/)?.[1] ?? null)
    .filter((step): step is string => Boolean(step))
    .map(cleanStep)
    .filter((step) => step.length >= 4 && step.length <= 280);
  if (multilineSteps.length >= 2 && multilineSteps.length <= 12) {
    return multilineSteps;
  }

  const inlineSteps = [
    ...normalized.matchAll(/(?:^|\s)(?:\d+[.)])\s+([^]+?)(?=(?:\s+\d+[.)]\s)|$)/g),
  ]
    .map((match) => cleanStep(match[1] ?? ""))
    .filter((step) => step.length >= 4 && step.length <= 280);
  if (inlineSteps.length >= 2 && inlineSteps.length <= 12) {
    return inlineSteps;
  }

  return null;
}

function detectStructuredBlockProcedure(
  normalized: string,
  corrected: boolean,
): RecurringProcedureSemanticCaptureDecision | null {
  const matched = normalized.match(/^([^\n:]{4,96}):\n([\s\S]+)$/);
  if (!matched) {
    return null;
  }

  const rawLabel = matched[1] ?? "";
  const steps = parseChecklistSteps(matched[2] ?? "");
  if (!steps) {
    return null;
  }

  const procedureKey = inferProcedureKey(rawLabel);
  const title = inferGenericProcedureTitleFromStructuredLabel(rawLabel, steps);
  if (!title) {
    return null;
  }

  return {
    action: "capture",
    confidence: /\bphase order\b/i.test(rawLabel) ? "medium" : "high",
    evidence: corrected
      ? ["structured_titled_block", "structured_steps", "correction_prefix"]
      : ["structured_titled_block", "structured_steps"],
    match: buildCanonicalMatch({
      procedureFamily: procedureKey ? "supported_key" : "generalized_named_checklist",
      ...(procedureKey ? { procedureKey } : {}),
      title,
      template: procedureKey ? "named_recurring_checklist" : "generalized_recurring_checklist",
      steps,
      corrected,
    }),
  };
}

function buildCanonicalMatch(params: {
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  title: string;
  template: "named_recurring_checklist" | "generalized_recurring_checklist";
  steps: string[];
  corrected: boolean;
}): RecurringProcedureCanonicalMatch {
  const body = params.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const normalizedTitle = normalizeLower(params.title);
  const normalizedBody = normalizeLower(body);
  return {
    captureClass: params.corrected
      ? "recurring_procedure_correction"
      : "explicit_recurring_procedure",
    candidateKind: "procedure",
    reasonCode: params.corrected
      ? "recurring_procedure_correction"
      : "explicit_recurring_procedure_statement",
    template: params.template,
    procedureFamily: params.procedureFamily,
    ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
    title: params.title,
    body,
    steps: params.steps,
    normalizedTitle,
    normalizedBody,
    content: body,
    subjectKey: buildAutoCaptureSubjectKey({ normalizedTitle }),
    key: buildAutoCaptureKey({ normalizedTitle, normalizedBody }),
  };
}

export function createRecurringProcedureCanonicalMatch(params: {
  title: string;
  steps: string[];
  procedureFamily: RecurringProcedureFamily;
  procedureKey?: RecurringProcedureKey;
  correction?: boolean;
}): RecurringProcedureCanonicalMatch {
  return buildCanonicalMatch({
    title: params.title,
    steps: params.steps,
    procedureFamily: params.procedureFamily,
    ...(params.procedureKey ? { procedureKey: params.procedureKey } : {}),
    template: params.procedureKey ? "named_recurring_checklist" : "generalized_recurring_checklist",
    corrected: params.correction ?? false,
  });
}

export function isSupportedRecurringProcedureKey(value: string): value is RecurringProcedureKey {
  return RECURRING_PROCEDURE_KEYS.includes(value as RecurringProcedureKey);
}

export function getRecurringProcedureTitle(procedureKey: RecurringProcedureKey): string {
  return PROCEDURE_KEY_SPECS[procedureKey].title;
}

/**
 * Legacy compatibility detector retained for degraded-mode fallback, comparison,
 * and migration tooling. Normal runtime semantic ownership is model-native.
 */
export function detectRecurringProcedureSemanticDecision(
  text: string,
): RecurringProcedureSemanticCaptureDecision {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 24 || normalized.length > 1_600) {
    return { action: "ignore", reason: "out_of_bounds", evidence: [] };
  }

  const correction = stripCorrectionPrefix(normalized);

  for (const pattern of EXPLICIT_PATTERNS) {
    const matched = correction.normalized.match(pattern);
    if (!matched) {
      continue;
    }
    const rawLabel = matched[1] ?? "";
    const procedureKey = inferProcedureKey(rawLabel);
    const genericTitle = procedureKey
      ? null
      : inferGenericProcedureTitleFromExplicitLabel(rawLabel);
    if (!procedureKey) {
      if (!genericTitle) {
        return { action: "ignore", reason: "unsupported_or_ambiguous_procedure", evidence: [] };
      }
    }
    const steps = parseChecklistSteps(matched[2] ?? "");
    if (!steps) {
      return { action: "ignore", reason: "missing_bounded_steps", evidence: [] };
    }
    return {
      action: "capture",
      confidence: "high",
      evidence: correction.corrected
        ? ["explicit_named_checklist", "structured_steps", "correction_prefix"]
        : ["explicit_named_checklist", "structured_steps"],
      match: buildCanonicalMatch({
        procedureFamily: procedureKey ? "supported_key" : "generalized_named_checklist",
        ...(procedureKey ? { procedureKey } : {}),
        title: procedureKey ? PROCEDURE_KEY_SPECS[procedureKey].title : (genericTitle as string),
        template: procedureKey ? "named_recurring_checklist" : "generalized_recurring_checklist",
        steps,
        corrected: correction.corrected,
      }),
    };
  }

  for (const pattern of MEDIUM_PATTERNS) {
    const matched = correction.normalized.match(pattern);
    if (!matched) {
      continue;
    }
    const rawLabel = matched[1] ?? "";
    const procedureKey = inferProcedureKey(rawLabel);
    const genericTitle = procedureKey
      ? null
      : inferGenericProcedureTitleFromMediumSubject(rawLabel);
    if (!procedureKey) {
      if (!genericTitle) {
        return { action: "ignore", reason: "unsupported_or_ambiguous_procedure", evidence: [] };
      }
    }
    const steps = parseChecklistSteps(matched[2] ?? "");
    if (!steps) {
      return { action: "ignore", reason: "missing_bounded_steps", evidence: [] };
    }
    return {
      action: "capture",
      confidence: "medium",
      evidence: correction.corrected
        ? ["soft_named_checklist", "structured_steps", "correction_prefix"]
        : ["soft_named_checklist", "structured_steps"],
      match: buildCanonicalMatch({
        procedureFamily: procedureKey ? "supported_key" : "generalized_named_checklist",
        ...(procedureKey ? { procedureKey } : {}),
        title: procedureKey ? PROCEDURE_KEY_SPECS[procedureKey].title : (genericTitle as string),
        template: procedureKey ? "named_recurring_checklist" : "generalized_recurring_checklist",
        steps,
        corrected: correction.corrected,
      }),
    };
  }

  const structuredBlockDecision = detectStructuredBlockProcedure(
    correction.normalized,
    correction.corrected,
  );
  if (structuredBlockDecision) {
    return structuredBlockDecision;
  }

  return {
    action: "ignore",
    reason: "no_supported_recurring_procedure_match",
    evidence: [],
  };
}
