import { createHash } from "node:crypto";

export const SECTION_MAP_CANDIDATE_HINTS_STRATEGY = "section_map_candidate_hints" as const;

export type SectionMapCandidateType = "claim" | "procedure" | "decision";

export type SectionMapDocumentSection = {
  sourceId: string;
  sectionId: string;
  windowId: string;
  spanId: string;
  title: string;
  headingPath: string[];
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  sourceHash: string;
  sectionHash: string;
  boundedSummary: string;
  text: string;
};

export type SectionMapDocument = {
  strategy: typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  sourceId: string;
  sourcePath?: string;
  sourceHash: string;
  sections: SectionMapDocumentSection[];
  rawContentPersisted: false;
  canonicalTruth: false;
};

export type SectionMapCandidateHint = {
  candidateId: string;
  candidateType: SectionMapCandidateType;
  text: string;
  sourceSectionId: string;
  sourceSpanId: string;
  boundedQuote: string;
  confidence: number;
  uncertaintyReason?: string;
};

export type SectionMapCandidateHintsInput = {
  sourceId: string;
  sourceHash: string;
  sections: Array<{
    sectionId: string;
    title: string;
    boundedSummary: string;
    sourceHash: string;
  }>;
};

export type SectionMapCandidateHintsOutput = {
  strategy: typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  sourceId: string;
  sourceHash: string;
  hints: SectionMapCandidateHint[];
  omittedSections: string[];
  uncertainSections: string[];
  canonicalTruth: false;
};

export type SectionMapHintValidationResult = {
  hint: SectionMapCandidateHint;
  status: "validated" | "unsupported" | "uncertain" | "omitted";
  quoteHash?: string;
  failureClass?: "missing_section" | "wrong_span" | "quote_not_found" | "uncertain";
};

export type SectionMapStrategyTelemetry = {
  strategy: typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  sourceId: string;
  sourceHash: string;
  sectionCount: number;
  hintCount: number;
  validatedCount: number;
  quarantinedCount: number;
  admittedCount: number;
  missedKnownFactCount: number;
  partial: boolean;
  retrySections: string[];
  stricterEvidenceRetrySections: string[];
};

export type SectionMapAdaptiveFallbackPlan = {
  partial: boolean;
  retrySections: string[];
  stricterEvidenceRetrySections: string[];
  retryBudgetUsed: number;
  reasons: string[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function headingSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug || "section";
}

export function buildSectionMapDocument(input: {
  sourceId: string;
  sourcePath?: string;
  text: string;
  maxSummaryChars?: number;
}): SectionMapDocument {
  const maxSummaryChars = input.maxSummaryChars ?? 700;
  const sourceHash = sha256(input.text);
  const offsets = lineOffsets(input.text);
  const lines = input.text.split(/\r?\n/u);
  const headingStack: Array<{ level: number; title: string; slug: string; ordinal: number }> = [];
  const headingCounts = new Map<string, number>();
  const starts: Array<{
    lineIndex: number;
    level: number;
    title: string;
    headingPath: string[];
  }> = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const match = /^(#{1,6})\s+(.+)$/u.exec(lines[lineIndex] ?? "");
    if (!match) {
      continue;
    }
    const level = match[1].length;
    const title = match[2].trim();
    const slug = headingSlug(title);
    const ordinal = (headingCounts.get(`${level}:${slug}`) ?? 0) + 1;
    headingCounts.set(`${level}:${slug}`, ordinal);
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    headingStack.push({ level, title, slug, ordinal });
    starts.push({
      lineIndex,
      level,
      title,
      headingPath: headingStack.map((entry) => `${entry.slug}-${entry.ordinal}`),
    });
  }

  if (starts.length === 0) {
    starts.push({
      lineIndex: 0,
      level: 1,
      title: "preamble",
      headingPath: ["preamble-1"],
    });
  } else if (starts[0].lineIndex > 0 && lines.slice(0, starts[0].lineIndex).join("\n").trim()) {
    starts.unshift({
      lineIndex: 0,
      level: 1,
      title: "preamble",
      headingPath: ["preamble-1"],
    });
  }

  const sections: SectionMapDocumentSection[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const next = starts[index + 1];
    const startOffset = offsets[start.lineIndex] ?? 0;
    const endLineExclusive = next?.lineIndex ?? lines.length;
    const endOffset =
      next?.lineIndex !== undefined
        ? (offsets[next.lineIndex] ?? input.text.length)
        : input.text.length;
    const sectionText = input.text.slice(startOffset, endOffset).trim();
    if (!sectionText) {
      continue;
    }
    const sectionHash = sha256(sectionText);
    const stableKey = `${input.sourceId}|${start.headingPath.join("/")}`;
    const sectionId = `section_${sha256(stableKey).slice(0, 16)}`;
    const windowId = `window_${sha256(`${sectionId}|${sectionHash}`).slice(0, 16)}`;
    const spanId = `span_${sha256(`${sectionId}|primary|${sectionHash}`).slice(0, 16)}`;
    sections.push({
      sourceId: input.sourceId,
      sectionId,
      windowId,
      spanId,
      title: start.title,
      headingPath: start.headingPath,
      startOffset,
      endOffset,
      startLine: start.lineIndex + 1,
      endLine: endLineExclusive,
      sourceHash,
      sectionHash,
      boundedSummary: normalizeWhitespace(sectionText).slice(0, maxSummaryChars),
      text: sectionText,
    });
  }

  return {
    strategy: SECTION_MAP_CANDIDATE_HINTS_STRATEGY,
    sourceId: input.sourceId,
    sourcePath: input.sourcePath,
    sourceHash,
    sections,
    rawContentPersisted: false,
    canonicalTruth: false,
  };
}

export function buildSectionMapCandidateHintsInput(
  document: SectionMapDocument,
): SectionMapCandidateHintsInput {
  return {
    sourceId: document.sourceId,
    sourceHash: document.sourceHash,
    sections: document.sections.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      boundedSummary: section.boundedSummary,
      sourceHash: section.sectionHash,
    })),
  };
}

export function validateSectionMapHint(
  document: SectionMapDocument,
  hint: SectionMapCandidateHint,
): SectionMapHintValidationResult {
  if (hint.uncertaintyReason && hint.confidence < 0.5) {
    return {
      hint,
      status: "uncertain",
      failureClass: "uncertain",
    };
  }
  const section = document.sections.find((entry) => entry.sectionId === hint.sourceSectionId);
  if (!section) {
    return {
      hint,
      status: "unsupported",
      failureClass: "missing_section",
    };
  }
  if (section.spanId !== hint.sourceSpanId) {
    return {
      hint,
      status: "unsupported",
      failureClass: "wrong_span",
    };
  }
  const quote = hint.boundedQuote.trim();
  if (!quote || !section.text.includes(quote)) {
    return {
      hint,
      status: "unsupported",
      failureClass: "quote_not_found",
    };
  }
  return {
    hint,
    status: "validated",
    quoteHash: sha256(quote),
  };
}

export function validateSectionMapHints(
  document: SectionMapDocument,
  output: SectionMapCandidateHintsOutput,
): SectionMapHintValidationResult[] {
  if (output.canonicalTruth) {
    throw new Error("section-map candidate hints are not canonical truth");
  }
  if (output.sourceId !== document.sourceId || output.sourceHash !== document.sourceHash) {
    return output.hints.map((hint) => ({
      hint,
      status: "unsupported",
      failureClass: "missing_section",
    }));
  }
  return output.hints.map((hint) => validateSectionMapHint(document, hint));
}

export function buildRigidCaptureWindowsFromValidatedHints(input: {
  document: SectionMapDocument;
  validations: SectionMapHintValidationResult[];
}): Array<{
  hintId: string;
  candidateType: SectionMapCandidateType;
  sourceId: string;
  sourceSectionId: string;
  sourceSpanId: string;
  quoteHash: string;
  boundedQuote: string;
  text: string;
}> {
  return input.validations
    .filter((validation) => validation.status === "validated")
    .map((validation) => ({
      hintId: validation.hint.candidateId,
      candidateType: validation.hint.candidateType,
      sourceId: input.document.sourceId,
      sourceSectionId: validation.hint.sourceSectionId,
      sourceSpanId: validation.hint.sourceSpanId,
      quoteHash: validation.quoteHash ?? sha256(validation.hint.boundedQuote),
      boundedQuote: validation.hint.boundedQuote,
      text: validation.hint.text,
    }));
}

export function planSectionMapAdaptiveFallback(input: {
  document: SectionMapDocument;
  validations: SectionMapHintValidationResult[];
  minValidatedHints?: number;
  maxRetrySections?: number;
}): SectionMapAdaptiveFallbackPlan {
  const minValidatedHints = input.minValidatedHints ?? 3;
  const maxRetrySections = input.maxRetrySections ?? 3;
  const validated = input.validations.filter((validation) => validation.status === "validated");
  const unsupported = input.validations.filter(
    (validation) => validation.failureClass === "quote_not_found",
  );
  const reasons: string[] = [];
  const retrySections = new Set<string>();
  const stricterEvidenceRetrySections = new Set<string>();
  if (validated.length < minValidatedHints) {
    reasons.push("low_candidate_coverage");
    for (const section of input.document.sections.slice(0, maxRetrySections)) {
      retrySections.add(section.sectionId);
    }
  }
  for (const validation of unsupported.slice(0, maxRetrySections)) {
    reasons.push("quote_validation_failed");
    stricterEvidenceRetrySections.add(validation.hint.sourceSectionId);
  }
  return {
    partial: reasons.length > 0,
    retrySections: [...retrySections],
    stricterEvidenceRetrySections: [...stricterEvidenceRetrySections],
    retryBudgetUsed: retrySections.size + stricterEvidenceRetrySections.size,
    reasons: [...new Set(reasons)],
  };
}

export function buildSectionMapStrategyTelemetry(input: {
  document: SectionMapDocument;
  validations: SectionMapHintValidationResult[];
  admittedCount?: number;
  missedKnownFactCount?: number;
}): SectionMapStrategyTelemetry {
  const fallback = planSectionMapAdaptiveFallback({
    document: input.document,
    validations: input.validations,
  });
  return {
    strategy: SECTION_MAP_CANDIDATE_HINTS_STRATEGY,
    sourceId: input.document.sourceId,
    sourceHash: input.document.sourceHash,
    sectionCount: input.document.sections.length,
    hintCount: input.validations.length,
    validatedCount: input.validations.filter((validation) => validation.status === "validated")
      .length,
    quarantinedCount: input.validations.filter((validation) => validation.status === "unsupported")
      .length,
    admittedCount: input.admittedCount ?? 0,
    missedKnownFactCount: input.missedKnownFactCount ?? 0,
    partial: fallback.partial,
    retrySections: fallback.retrySections,
    stricterEvidenceRetrySections: fallback.stricterEvidenceRetrySections,
  };
}

export function selectDocumentIngestStrategy(input: {
  requestedStrategy?: string | null;
  sourceText: string;
  largeDocWordThreshold?: number;
}): "direct_rigid_capture" | typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY {
  const requested = input.requestedStrategy?.trim() || "auto";
  const wordCount = input.sourceText.trim().split(/\s+/u).filter(Boolean).length;
  const threshold = input.largeDocWordThreshold ?? 2500;
  if (requested === "direct_rigid_capture") {
    return "direct_rigid_capture";
  }
  if (
    (requested === "auto" || requested === SECTION_MAP_CANDIDATE_HINTS_STRATEGY) &&
    wordCount >= threshold
  ) {
    return SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  }
  return "direct_rigid_capture";
}
