import { createHash } from "node:crypto";

export const RESPONSE_STYLE_TEMPLATES = [
  "responses_concise",
  "responses_bullets",
  "responses_plain_english",
  "responses_no_tables",
  "responses_numbered_steps",
] as const;

export type ResponseStyleTemplate = (typeof RESPONSE_STYLE_TEMPLATES)[number];

export type ResponseStyleSemanticConfidence = "high" | "medium";

export type ResponseStyleCanonicalMatch = {
  captureClass: "explicit_requirement" | "requirement_correction";
  candidateKind: "learning" | "correction";
  reasonCode: "explicit_requirement_statement" | "explicit_requirement_correction";
  template: ResponseStyleTemplate;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
};

export type ResponseStyleSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: ResponseStyleSemanticConfidence;
      evidence: string[];
      match: ResponseStyleCanonicalMatch;
    }
  | {
      action: "forget";
      confidence: "high";
      evidence: string[];
      template: ResponseStyleTemplate;
      subject: string;
      subjectKey: string;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

type ResponseStyleTemplateSpec = {
  subject: string;
  value: string;
  learningContent: string;
  correctionContent: string;
};

const RESPONSE_STYLE_TEMPLATE_SPECS: Record<ResponseStyleTemplate, ResponseStyleTemplateSpec> = {
  responses_concise: {
    subject: "response style",
    value: "keep responses concise",
    learningContent: "User requirement: keep responses concise.",
    correctionContent: "User correction: keep responses concise.",
  },
  responses_bullets: {
    subject: "response format",
    value: "use bullet points when listing items",
    learningContent: "User requirement: use bullet points when listing items.",
    correctionContent: "User correction: use bullet points when listing items.",
  },
  responses_plain_english: {
    subject: "response language",
    value: "use plain English",
    learningContent: "User requirement: use plain English.",
    correctionContent: "User correction: use plain English.",
  },
  responses_no_tables: {
    subject: "response format",
    value: "do not use tables unless the user asks",
    learningContent: "User requirement: do not use tables unless the user asks.",
    correctionContent: "User correction: do not use tables unless the user asks.",
  },
  responses_numbered_steps: {
    subject: "response format",
    value: "use numbered steps when giving instructions",
    learningContent: "User requirement: use numbered steps when giving instructions.",
    correctionContent: "User correction: use numbered steps when giving instructions.",
  },
};

const CORRECTION_PREFIX_PATTERNS = [
  /^actually\b/,
  /^no\b/,
  /^nope\b/,
  /^sorry\b/,
  /^i meant\b/,
  /^correction\b/,
  /^that's not right\b/,
  /^thats not right\b/,
];

const FORGET_PREFIX_PATTERNS = [
  /^(?:please\s+)?forget\b/,
  /^(?:please\s+)?(?:do not|don't|dont)\s+remember\b/,
  /^(?:please\s+)?remove\b/,
  /^(?:please\s+)?drop\b/,
];

const DIRECTIVE_TOKENS = [
  "please",
  "use",
  "keep",
  "make",
  "write",
  "give",
  "prefer",
  "want",
  "can",
  "could",
  "would",
];

const RESPONSE_NOUNS = [
  "response",
  "responses",
  "reply",
  "replies",
  "answer",
  "answers",
  "instruction",
  "instructions",
];

const RESPONSE_STYLE_FORGET_ALIASES: Array<{
  template: ResponseStyleTemplate;
  phrases: string[];
}> = [
  {
    template: "responses_plain_english",
    phrases: ["plain english", "plain language", "jargon"],
  },
  {
    template: "responses_bullets",
    phrases: ["bullet points", "bullets", "bullet point"],
  },
  {
    template: "responses_no_tables",
    phrases: ["tables", "table"],
  },
  {
    template: "responses_concise",
    phrases: ["concise", "brief", "short", "shorter replies", "keep it short"],
  },
  {
    template: "responses_numbered_steps",
    phrases: ["numbered steps", "numbered lists", "numbered list"],
  },
];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeSemanticText(value: string): string {
  return normalizeLower(value)
    .replace(/[’']/g, "")
    .replace(/\bpls\b/g, "please")
    .replace(/\bplz\b/g, "please")
    .replace(/\bbullet[- ]?point\b/g, "bullet points")
    .replace(/\bbullet[- ]?points\b/g, "bullet points")
    .replace(/\bplain[- ]?english\b/g, "plain english")
    .replace(/\bplain[- ]?language\b/g, "plain language")
    .replace(/\bnumbered[- ]?steps\b/g, "numbered steps")
    .replace(/\bnumbered[- ]?lists?\b/g, "numbered lists")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeSemanticText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function isResponseStyleTemplate(value: string): value is ResponseStyleTemplate {
  return RESPONSE_STYLE_TEMPLATES.includes(value as ResponseStyleTemplate);
}

function buildAutoCaptureKey(params: {
  template: string;
  normalizedSubject: string;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "user-preference-v1",
        params.template,
        params.normalizedSubject,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildAutoCaptureSubjectKey(params: {
  template: string;
  normalizedSubject: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "user-preference-subject",
        params.template,
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function levenshteinAtMost(left: string, right: string, maxDistance: number): boolean {
  if (left === right) {
    return true;
  }
  if (Math.abs(left.length - right.length) > maxDistance) {
    return false;
  }
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let bestInRow = row;
    let diagonal = row - 1;
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cached = previous[column] ?? column;
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const nextValue = Math.min(
        (previous[column] ?? column) + 1,
        (previous[column - 1] ?? column - 1) + 1,
        diagonal + cost,
      );
      diagonal = cached;
      previous[column] = nextValue;
      if (nextValue < bestInRow) {
        bestInRow = nextValue;
      }
    }
    if (bestInRow > maxDistance) {
      return false;
    }
  }
  return (previous[right.length] ?? maxDistance + 1) <= maxDistance;
}

function hasApproxToken(
  tokens: string[],
  variants: string[],
  maxDistance: number,
): string | undefined {
  for (const token of tokens) {
    for (const variant of variants) {
      if (token === variant || levenshteinAtMost(token, variant, maxDistance)) {
        return variant;
      }
    }
  }
  return undefined;
}

function containsAny(tokens: string[], variants: string[], maxDistance = 0): boolean {
  return Boolean(hasApproxToken(tokens, variants, maxDistance));
}

function containsPhrase(normalized: string, phrase: string): boolean {
  return normalized.includes(phrase);
}

function startsWithAny(normalized: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(normalized));
}

function buildCanonicalMatch(params: {
  template: ResponseStyleTemplate;
  captureClass: "explicit_requirement" | "requirement_correction";
}): ResponseStyleCanonicalMatch {
  const spec = RESPONSE_STYLE_TEMPLATE_SPECS[params.template];
  const normalizedSubject = normalizeLower(spec.subject);
  const normalizedValue = normalizeLower(spec.value);
  return {
    captureClass: params.captureClass,
    candidateKind: params.captureClass === "requirement_correction" ? "correction" : "learning",
    reasonCode:
      params.captureClass === "requirement_correction"
        ? "explicit_requirement_correction"
        : "explicit_requirement_statement",
    template: params.template,
    subject: spec.subject,
    value: spec.value,
    normalizedSubject,
    normalizedValue,
    content:
      params.captureClass === "requirement_correction"
        ? spec.correctionContent
        : spec.learningContent,
    subjectKey: buildAutoCaptureSubjectKey({
      template: params.template,
      normalizedSubject,
    }),
    key: buildAutoCaptureKey({
      template: params.template,
      normalizedSubject,
      normalizedValue,
    }),
  };
}

function scoreConcise(tokens: string[], normalized: string): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (containsPhrase(normalized, "keep it short")) {
    score += 3;
    evidence.push("keep_it_short_phrase");
  }
  if (containsPhrase(normalized, "shorter replies")) {
    score += 3;
    evidence.push("shorter_replies_phrase");
  }
  if (containsAny(tokens, ["concise", "brief"], 1)) {
    score += 2;
    evidence.push("brevity_term");
  }
  if (containsAny(tokens, ["short", "shorter"], 0)) {
    score += 2;
    evidence.push("short_term");
  }
  if (containsAny(tokens, RESPONSE_NOUNS, 1)) {
    score += 1;
    evidence.push("response_noun");
  }
  if (containsAny(tokens, DIRECTIVE_TOKENS, 1)) {
    score += 1;
    evidence.push("directive_token");
  }
  return { score, evidence };
}

function scoreBullets(tokens: string[], normalized: string): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (containsPhrase(normalized, "bullet points")) {
    score += 3;
    evidence.push("bullet_points_phrase");
  } else if (containsAny(tokens, ["bullet", "bullets"], 1)) {
    score += 2;
    evidence.push("bullet_token");
  }
  if (containsAny(tokens, ["list", "lists", "listing", "items", "structured"], 1)) {
    score += 1;
    evidence.push("list_context");
  }
  if (containsAny(tokens, DIRECTIVE_TOKENS, 1) || containsPhrase(normalized, "for me")) {
    score += 1;
    evidence.push("directive_token");
  }
  return { score, evidence };
}

function scorePlainEnglish(
  tokens: string[],
  normalized: string,
): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  const hasJargon = containsAny(tokens, ["jargon"], 1);
  const antiJargonIntent =
    containsPhrase(normalized, "less jargon") ||
    containsPhrase(normalized, "not jargon") ||
    containsPhrase(normalized, "avoid jargon") ||
    containsPhrase(normalized, "without jargon") ||
    containsPhrase(normalized, "skip jargon") ||
    (hasJargon && containsAny(tokens, ["avoid", "less", "without", "skip"], 1)) ||
    (hasJargon && containsAny(tokens, ["no", "not"], 0));
  if (containsPhrase(normalized, "plain english")) {
    score += 4;
    evidence.push("plain_english_phrase");
  }
  if (containsPhrase(normalized, "plain language")) {
    score += 3;
    evidence.push("plain_language_phrase");
  }
  if (hasJargon) {
    score += 2;
    evidence.push("jargon_term");
  }
  if (antiJargonIntent) {
    score += 3;
    evidence.push("anti_jargon_phrase");
  }
  if (containsAny(tokens, DIRECTIVE_TOKENS, 1)) {
    score += 1;
    evidence.push("directive_token");
  }
  return { score, evidence };
}

function scoreNoTables(
  tokens: string[],
  normalized: string,
): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (containsAny(tokens, ["table", "tables"], 1)) {
    score += 2;
    evidence.push("table_term");
  }
  if (
    containsAny(tokens, ["dont", "not", "no", "skip", "avoid"], 0) ||
    containsPhrase(normalized, "unless i ask")
  ) {
    score += 2;
    evidence.push("negative_table_signal");
  }
  if (containsPhrase(normalized, "unless i ask") || containsPhrase(normalized, "unless asked")) {
    score += 2;
    evidence.push("unless_asked_phrase");
  }
  if (containsAny(tokens, DIRECTIVE_TOKENS, 1)) {
    score += 1;
    evidence.push("directive_token");
  }
  return { score, evidence };
}

function scoreNumberedSteps(
  tokens: string[],
  normalized: string,
): { score: number; evidence: string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (containsPhrase(normalized, "numbered steps")) {
    score += 4;
    evidence.push("numbered_steps_phrase");
  } else if (
    containsAny(tokens, ["numbered", "number"], 1) &&
    containsAny(tokens, ["steps", "lists", "list"], 1)
  ) {
    score += 3;
    evidence.push("numbered_step_terms");
  }
  if (
    containsAny(tokens, ["instruction", "instructions"], 1) ||
    containsPhrase(normalized, "walk me through") ||
    containsPhrase(normalized, "giving instructions")
  ) {
    score += 1;
    evidence.push("instruction_context");
  }
  if (containsAny(tokens, DIRECTIVE_TOKENS, 1)) {
    score += 1;
    evidence.push("directive_token");
  }
  return { score, evidence };
}

function detectBestTemplate(
  tokens: string[],
  normalized: string,
): {
  template: ResponseStyleTemplate;
  score: number;
  evidence: string[];
} | null {
  const candidates = [
    { template: "responses_concise" as const, ...scoreConcise(tokens, normalized) },
    { template: "responses_bullets" as const, ...scoreBullets(tokens, normalized) },
    { template: "responses_plain_english" as const, ...scorePlainEnglish(tokens, normalized) },
    { template: "responses_no_tables" as const, ...scoreNoTables(tokens, normalized) },
    { template: "responses_numbered_steps" as const, ...scoreNumberedSteps(tokens, normalized) },
  ]
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const winner = candidates[0];
  if (!winner) {
    return null;
  }
  const runnerUp = candidates[1];
  if (runnerUp && runnerUp.score === winner.score) {
    return null;
  }
  return winner;
}

function resolveCaptureConfidence(
  template: ResponseStyleTemplate,
  score: number,
  normalized: string,
): ResponseStyleSemanticConfidence | null {
  switch (template) {
    case "responses_plain_english":
      if (score >= 5 || containsPhrase(normalized, "plain english please")) {
        return "high";
      }
      return score >= 3 ? "medium" : null;
    case "responses_bullets":
      if (score >= 4 || containsPhrase(normalized, "bullets please")) {
        return "high";
      }
      return score >= 3 ? "medium" : null;
    case "responses_concise":
      if (
        score >= 4 &&
        (containsPhrase(normalized, "keep it short") || normalized.includes("reply"))
      ) {
        return "high";
      }
      return score >= 3 ? "medium" : null;
    case "responses_no_tables":
      if (score >= 5) {
        return "high";
      }
      return score >= 3 ? "medium" : null;
    case "responses_numbered_steps":
      if (score >= 5) {
        return "high";
      }
      return score >= 3 ? "medium" : null;
  }
}

function detectForgetTarget(
  tokens: string[],
  normalized: string,
): { template: ResponseStyleTemplate; evidence: string[] } | null {
  const explicitForget =
    startsWithAny(normalized, FORGET_PREFIX_PATTERNS) ||
    containsPhrase(normalized, "dont remember") ||
    containsPhrase(normalized, "do not remember");
  const correctionForget =
    startsWithAny(normalized, CORRECTION_PREFIX_PATTERNS) &&
    (containsPhrase(normalized, "not bullets") ||
      containsPhrase(normalized, "not bullet points") ||
      containsPhrase(normalized, "not tables") ||
      containsPhrase(normalized, "not concise") ||
      containsPhrase(normalized, "not plain english") ||
      containsPhrase(normalized, "not numbered steps"));
  if (!explicitForget && !correctionForget) {
    return null;
  }

  const explicitAliasMatch = RESPONSE_STYLE_FORGET_ALIASES.find((candidate) =>
    candidate.phrases.some((phrase) => containsPhrase(normalized, phrase)),
  );
  if (explicitAliasMatch) {
    return {
      template: explicitAliasMatch.template,
      evidence: [
        `forget_alias_${explicitAliasMatch.template}`,
        explicitForget ? "explicit_forget_intent" : "correction_forget_intent",
      ],
    };
  }

  const bestTemplate = detectBestTemplate(tokens, normalized);
  if (!bestTemplate) {
    return null;
  }
  return {
    template: bestTemplate.template,
    evidence: [
      ...bestTemplate.evidence,
      explicitForget ? "explicit_forget_intent" : "correction_forget_intent",
    ],
  };
}

export function detectResponseStyleSemanticDecision(
  text: string,
): ResponseStyleSemanticCaptureDecision {
  const normalized = normalizeSemanticText(text);
  const tokens = tokenize(text);
  if (!normalized || tokens.length === 0 || normalized.length < 4 || normalized.length > 160) {
    return { action: "ignore", reason: "out_of_bounds", evidence: [] };
  }

  const forgetTarget = detectForgetTarget(tokens, normalized);
  if (forgetTarget) {
    const match = buildCanonicalMatch({
      template: forgetTarget.template,
      captureClass: "explicit_requirement",
    });
    return {
      action: "forget",
      confidence: "high",
      evidence: forgetTarget.evidence,
      template: forgetTarget.template,
      subject: match.subject,
      subjectKey: match.subjectKey,
    };
  }

  const bestTemplate = detectBestTemplate(tokens, normalized);
  if (!bestTemplate) {
    return { action: "ignore", reason: "no_supported_subject", evidence: [] };
  }

  const confidence = resolveCaptureConfidence(
    bestTemplate.template,
    bestTemplate.score,
    normalized,
  );
  if (!confidence) {
    return {
      action: "ignore",
      reason: "weak_or_ambiguous",
      evidence: bestTemplate.evidence,
    };
  }

  const isCorrection = startsWithAny(normalized, CORRECTION_PREFIX_PATTERNS);
  const match = buildCanonicalMatch({
    template: bestTemplate.template,
    captureClass: isCorrection ? "requirement_correction" : "explicit_requirement",
  });
  return {
    action: "capture",
    confidence,
    evidence: bestTemplate.evidence,
    match,
  };
}

export function getResponseStyleTemplateSpec(
  template: ResponseStyleTemplate,
): ResponseStyleTemplateSpec {
  return RESPONSE_STYLE_TEMPLATE_SPECS[template];
}

export function isResponseStyleCorrectionMatch(match: {
  template: string;
  captureClass: string;
}): match is {
  template: ResponseStyleTemplate;
  captureClass: "requirement_correction";
} {
  return isResponseStyleTemplate(match.template) && match.captureClass === "requirement_correction";
}

export function isResponseStyleLearningMatch(match: {
  template: string;
  captureClass: string;
}): match is {
  template: ResponseStyleTemplate;
  captureClass: "explicit_requirement";
} {
  return isResponseStyleTemplate(match.template) && match.captureClass === "explicit_requirement";
}
