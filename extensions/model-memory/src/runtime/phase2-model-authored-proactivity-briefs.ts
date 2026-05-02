import { z } from "zod";
import { sha256JsonValue } from "../hashing.ts";
import type { JsonModelExecutor } from "../model-execution.ts";
import { parseJsonModelOutput } from "../model-execution.ts";
import {
  MAX_PROACTIVITY_BRIEF_NEXT_STEP_LENGTH,
  MAX_PROACTIVITY_BRIEF_PURPOSE_LENGTH,
  MAX_PROACTIVITY_BRIEF_TITLE_LENGTH,
  validateUserFacingProactivityBrief,
  type Phase2UserFacingProactivityBrief,
  type Phase2UserFacingProactivityBriefInput,
  type Phase2UserFacingProactivityBriefKindLabel,
} from "./phase2-user-facing-proactivity-briefs.ts";

export const MODEL_AUTHORED_PROACTIVITY_BRIEF_INPUT_SCHEMA_VERSION =
  "model_authored_proactivity_brief_input.v1" as const;
export const MODEL_AUTHORED_PROACTIVITY_BRIEF_OUTPUT_SCHEMA_VERSION =
  "model_authored_proactivity_brief_output.v1" as const;
export const MODEL_AUTHORED_PROACTIVITY_BRIEF_REPORT_SCHEMA_VERSION =
  "model_authored_proactivity_brief_report.v1" as const;
export const DEFAULT_MODEL_AUTHORED_PROACTIVITY_BRIEF_MODEL_ID = "openai-codex/gpt-5.4";

type ModelAuthoredBriefDecision = "surface" | "demote" | "repair";
type ModelAuthoredBriefSource = "model" | "demoted";
type ModelAuthoredBriefKindCode =
  | "new_skill"
  | "improve_skill"
  | "merge_skill"
  | "proactive_plan"
  | "follow_up"
  | "question"
  | "draft_ready"
  | "repair";
type ExistingSkillMatchBasis =
  | "explicit_candidate_field"
  | "explicit_name_phrase"
  | "prior_candidate_linkage";

export type ModelAuthoredProactivityBriefInput = {
  schemaVersion: typeof MODEL_AUTHORED_PROACTIVITY_BRIEF_INPUT_SCHEMA_VERSION;
  opportunityId: string;
  queueItemId?: string;
  opportunityClass: string;
  workItemKind?: string;
  currentKindLabel?: string;
  currentTitle?: string;
  currentPurpose?: string;
  currentNextStep?: string;
  boundedLedgerSummary: {
    title?: string;
    whyNow?: string;
    proposedNextStep?: string;
    expectedUserValue?: string;
    evidenceSummary?: string;
    confidence?: string;
  };
  skillContext?: {
    skillCandidateId?: string;
    suggestedSkillName?: string;
    suggestedExistingSkillName?: string;
    normalizedIntentKey?: string;
    candidateType?: string;
    riskTier?: string;
    lifecycleStatus?: string;
    existingSkillMatch?: {
      name: string;
      matchBasis: ExistingSkillMatchBasis;
    } | null;
  };
  draftContext?: {
    skillPackageId?: string;
    decision?: string;
    packageTitle?: string;
    nextReviewStep?: string;
  } | null;
  reversePromptContext?: {
    proposedQuestion?: string;
    uncertainty?: string;
  } | null;
  safetyInstructions: {
    presentationOnly: true;
    doNotMutateCanonicalState: true;
    noRawTranscript: true;
    noActionExecution: true;
    noInstallOrPromotion: true;
  };
};

export type ModelAuthoredProactivityBriefReport = {
  schemaVersion: typeof MODEL_AUTHORED_PROACTIVITY_BRIEF_REPORT_SCHEMA_VERSION;
  source: ModelAuthoredBriefSource;
  enabled: boolean;
  modelId?: string;
  resolvedModelId?: string;
  elapsedMs: number;
  inputHash: string;
  outputHash?: string;
  decision: ModelAuthoredBriefDecision;
  validationStatus: Phase2UserFacingProactivityBrief["quality"]["status"];
  reasonCodes: string[];
  promptPersisted: false;
  rawResponsePersisted: false;
  promptChars: number;
  outputChars?: number;
};

export type ModelAuthoredProactivityBriefOptions = {
  enabled?: boolean;
  executor?: JsonModelExecutor | null;
  modelId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium";
  verbosity?: "low" | "medium";
  maxOutputTokens?: number;
  maxItemsPerReport?: number;
};

export type ModelAuthoredProactivityBriefBuildInput = {
  briefInput: Phase2UserFacingProactivityBriefInput;
  deterministicBrief: Phase2UserFacingProactivityBrief;
  opportunityId?: string;
  queueItemId?: string;
};

const OutputSchema = z
  .object({
    schemaVersion: z.literal(MODEL_AUTHORED_PROACTIVITY_BRIEF_OUTPUT_SCHEMA_VERSION),
    decision: z.enum(["surface", "demote", "repair"]),
    kindCode: z.enum([
      "new_skill",
      "improve_skill",
      "merge_skill",
      "proactive_plan",
      "follow_up",
      "question",
      "draft_ready",
      "repair",
    ]),
    titleWords: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
    oneLinePurposeWords: z.array(z.string().trim().min(1).max(32)).min(4).max(30),
    recommendedNextStepWords: z.array(z.string().trim().min(1).max(32)).min(3).max(30),
    primaryActionLabelWords: z
      .array(z.string().trim().min(1).max(32))
      .min(1)
      .max(8)
      .nullable()
      .optional(),
    statusLabelWords: z.array(z.string().trim().min(1).max(32)).min(1).max(8).nullable().optional(),
    detailSummaryWords: z
      .array(z.string().trim().min(1).max(32))
      .min(3)
      .max(24)
      .nullable()
      .optional(),
    hiddenDiagnostics: z
      .object({
        whyDemotedOrRepairedWords: z
          .array(z.string().trim().min(1).max(32))
          .min(3)
          .max(30)
          .nullable()
          .optional(),
        limitations: z.array(z.string().trim().min(1).max(80)).max(10),
      })
      .strict(),
    qualityReasons: z.array(z.string().trim().min(1).max(80)).max(12),
  })
  .strict();

type ModelAuthoredProactivityBriefOutput = z.infer<typeof OutputSchema>;

const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { enum: [MODEL_AUTHORED_PROACTIVITY_BRIEF_OUTPUT_SCHEMA_VERSION] },
    decision: { enum: ["surface", "demote", "repair"] },
    kindCode: {
      enum: [
        "new_skill",
        "improve_skill",
        "merge_skill",
        "proactive_plan",
        "follow_up",
        "question",
        "draft_ready",
        "repair",
      ],
    },
    titleWords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 1,
      maxItems: 12,
    },
    oneLinePurposeWords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 4,
      maxItems: 30,
    },
    recommendedNextStepWords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 3,
      maxItems: 30,
    },
    primaryActionLabelWords: {
      type: ["array", "null"],
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 1,
      maxItems: 8,
    },
    statusLabelWords: {
      type: ["array", "null"],
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 1,
      maxItems: 8,
    },
    detailSummaryWords: {
      type: ["array", "null"],
      items: { type: "string", minLength: 1, maxLength: 32 },
      minItems: 3,
      maxItems: 24,
    },
    hiddenDiagnostics: {
      type: "object",
      properties: {
        whyDemotedOrRepairedWords: {
          type: ["array", "null"],
          items: { type: "string", minLength: 1, maxLength: 32 },
          minItems: 3,
          maxItems: 30,
        },
        limitations: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
          maxItems: 10,
        },
      },
      required: ["whyDemotedOrRepairedWords", "limitations"],
      additionalProperties: false,
    },
    qualityReasons: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 80 },
      maxItems: 12,
    },
  },
  required: [
    "schemaVersion",
    "decision",
    "kindCode",
    "titleWords",
    "oneLinePurposeWords",
    "recommendedNextStepWords",
    "primaryActionLabelWords",
    "statusLabelWords",
    "detailSummaryWords",
    "hiddenDiagnostics",
    "qualityReasons",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "You rewrite one OpenClaw proactive item into a human-facing decision card.",
  "Your output is presentation-only JSON. Do not infer or mutate canonical truth.",
  "Use only the typed bounded input. Do not invent facts, ids, provenance, installs, sends, actions, or file edits.",
  "If the card cannot be made clear, choose decision=demote.",
  "Use compact kindCode values exactly as provided by the schema; do not output display labels with spaces.",
  "Use word arrays for every user-facing text field. Put each displayed word as its own array item. Do not combine multiple words in one item.",
  "Use null for optional word-array fields when there is no useful value.",
  "A surfaced card must have a title naming a capability, decision, or outcome.",
  "Titles must be human-readable, not slug-like. Do not output hyphenated file/key names such as candidate-discovery-qa-gate as a title; write Candidate Discovery QA Gate instead.",
  "Use natural title case or sentence case for titles. Use normal sentence capitalization for purpose and next-step copy.",
  "The purpose must explain what the item does or unlocks.",
  "The next step must be actionable and must not repeat the title.",
  "Keep the next step short enough to fit as a complete sentence; prefer 8-16 words over long lane lists.",
  "Do not preserve source-fragment grammar or clipped sentence fragments.",
  "Do not use generic fallback phrases such as 'Turns a recent idea into a bounded next step', 'without digging through the inbox', 'Already recurring', 'Build the bounded request with', 'It sets the default', 'Question worth asking before', 'Skill worth creating', or 'Draft ready' as prose.",
  "Do not mention ids, timestamps, source refs, provenance, ledgers, raw prompts, transcripts, tool logs, system instructions, installs, promotions, action execution, or outbound sends in primary fields.",
  "For skill candidates, say New skill only when no explicit existing-skill fit is provided. Say Improve skill only when existingSkillMatch is present.",
  "For first-class proactive plans, use kindCode=proactive_plan and name the planned outcome.",
  "For reverse prompts, surface only a real question that names the decision or uncertainty.",
].join("\n");

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].toSorted();
}

function trimBounded(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return boundCompleteText(normalized, maxLength);
}

function readModelId(options: ModelAuthoredProactivityBriefOptions): string {
  return options.modelId?.trim() || DEFAULT_MODEL_AUTHORED_PROACTIVITY_BRIEF_MODEL_ID;
}

function explicitMatchBasis(input: Phase2UserFacingProactivityBriefInput): ExistingSkillMatchBasis {
  return input.skillCandidate?.suggestedExistingSkillName
    ? "explicit_candidate_field"
    : "explicit_name_phrase";
}

export function buildModelAuthoredProactivityBriefInput(
  input: ModelAuthoredProactivityBriefBuildInput,
): ModelAuthoredProactivityBriefInput {
  const skill = input.briefInput.skillCandidate;
  const draft = input.briefInput.skillifierDraft;
  const existingSkillName = input.deterministicBrief.possibleExistingSkillName;
  return {
    schemaVersion: MODEL_AUTHORED_PROACTIVITY_BRIEF_INPUT_SCHEMA_VERSION,
    opportunityId: input.opportunityId ?? "standard",
    queueItemId: input.queueItemId,
    opportunityClass: input.briefInput.opportunityClass ?? "standard",
    workItemKind: input.briefInput.workItemKind,
    currentKindLabel: input.deterministicBrief.kindLabel,
    currentTitle: trimBounded(input.deterministicBrief.title, 120),
    currentPurpose: trimBounded(input.deterministicBrief.oneLinePurpose, 220),
    currentNextStep: trimBounded(input.deterministicBrief.recommendedNextStep, 220),
    boundedLedgerSummary: {
      title: trimBounded(input.briefInput.title, 180),
      whyNow: trimBounded(input.briefInput.whyNow, 220),
      proposedNextStep: trimBounded(input.briefInput.proposedNextStep, 220),
      expectedUserValue: trimBounded(input.briefInput.expectedUserValue, 220),
      evidenceSummary: trimBounded(input.briefInput.evidenceSummary, 220),
      confidence: input.briefInput.confidence,
    },
    skillContext: skill
      ? {
          skillCandidateId: skill.skillCandidateId,
          suggestedSkillName: trimBounded(skill.suggestedSkillName, 80),
          suggestedExistingSkillName: trimBounded(skill.suggestedExistingSkillName, 80),
          normalizedIntentKey: trimBounded(skill.normalizedIntentKey, 120),
          candidateType: skill.candidateType,
          riskTier: skill.riskTier,
          lifecycleStatus: skill.lifecycleStatus,
          existingSkillMatch: existingSkillName
            ? { name: existingSkillName, matchBasis: explicitMatchBasis(input.briefInput) }
            : null,
        }
      : undefined,
    draftContext: draft
      ? {
          skillPackageId: draft.skillPackageId,
          decision: draft.decision,
          packageTitle: trimBounded(draft.packageTitle, 120),
          nextReviewStep: trimBounded(draft.nextReviewStep, 180),
        }
      : null,
    reversePromptContext:
      input.briefInput.opportunityClass === "reverse_prompt"
        ? {
            proposedQuestion: trimBounded(input.briefInput.title, 120),
            uncertainty: trimBounded(
              input.briefInput.whyNow ?? input.briefInput.evidenceSummary,
              180,
            ),
          }
        : null,
    safetyInstructions: {
      presentationOnly: true,
      doNotMutateCanonicalState: true,
      noRawTranscript: true,
      noActionExecution: true,
      noInstallOrPromotion: true,
    },
  };
}

function buildUserPrompt(input: ModelAuthoredProactivityBriefInput): string {
  return [
    "Return exactly one JSON object matching the requested schema.",
    "Rewrite or demote this bounded OpenClaw proactive item:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

function textFromWords(words: string[] | null | undefined, maxLength: number): string | undefined {
  if (!Array.isArray(words) || words.length === 0) {
    return undefined;
  }
  const text = words
    .map((word) => word.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{])\s+/gu, "$1")
    .replace(/\s+([)\]}])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text) {
    return undefined;
  }
  return boundCompleteText(text, maxLength);
}

function boundCompleteText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const clipped = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const wordBoundary = clipped.lastIndexOf(" ");
  const bounded =
    wordBoundary >= Math.floor(maxLength * 0.55) ? clipped.slice(0, wordBoundary) : clipped;
  return `${bounded.replace(/[,\-:;]+$/u, "").trimEnd()}.`;
}

function sentenceFromWords(
  words: string[] | null | undefined,
  maxLength: number,
): string | undefined {
  const text = textFromWords(words, maxLength);
  if (!text) {
    return undefined;
  }
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function ensureTitleKindPrefix(params: {
  title: string;
  kindLabel: Phase2UserFacingProactivityBriefKindLabel;
}): string {
  const title = params.title
    .replace(/^(?:new|improve|merge)\s+skill:\s*/iu, "")
    .replace(/^(?:new|improve|merge)\s+/iu, "")
    .trim();
  if (
    params.kindLabel === "New skill" ||
    params.kindLabel === "Improve skill" ||
    params.kindLabel === "Merge skill" ||
    params.kindLabel === "Question"
  ) {
    const prefix = `${params.kindLabel}:`;
    return title.toLowerCase().startsWith(prefix.toLowerCase()) ? title : `${prefix} ${title}`;
  }
  return title;
}

function kindLabelFromCode(
  code: ModelAuthoredBriefKindCode,
): Phase2UserFacingProactivityBriefKindLabel {
  switch (code) {
    case "new_skill":
      return "New skill";
    case "improve_skill":
      return "Improve skill";
    case "merge_skill":
      return "Merge skill";
    case "proactive_plan":
      return "Proactive plan";
    case "follow_up":
      return "Follow-up";
    case "question":
      return "Question";
    case "draft_ready":
      return "Draft ready";
    case "repair":
      return "Repair";
  }
  return "Repair";
}

function demoteBrief(params: {
  brief: Phase2UserFacingProactivityBrief;
  reasons: string[];
  authorship: NonNullable<Phase2UserFacingProactivityBrief["authorship"]>;
}): Phase2UserFacingProactivityBrief {
  const reasons = uniqueSorted(params.reasons);
  return {
    ...params.brief,
    primaryActionLabel: "Review diagnostics",
    statusLabel: "presentation demoted",
    detailSummary: "Presentation quality diagnostics are available in details.",
    hiddenDiagnostics: {
      ...params.brief.hiddenDiagnostics,
      limitations: uniqueSorted([...params.brief.hiddenDiagnostics.limitations, ...reasons]),
    },
    quality: {
      status: "demote",
      reasons,
    },
    authorship: params.authorship,
  };
}

function briefFromModelOutput(params: {
  deterministicBrief: Phase2UserFacingProactivityBrief;
  output: ModelAuthoredProactivityBriefOutput;
  inputHash: string;
  outputHash: string;
  modelId: string;
}): Phase2UserFacingProactivityBrief {
  const kindLabel = kindLabelFromCode(params.output.kindCode);
  const title = ensureTitleKindPrefix({
    title:
      textFromWords(params.output.titleWords, MAX_PROACTIVITY_BRIEF_TITLE_LENGTH) ??
      params.deterministicBrief.title,
    kindLabel,
  });
  const oneLinePurpose =
    sentenceFromWords(params.output.oneLinePurposeWords, MAX_PROACTIVITY_BRIEF_PURPOSE_LENGTH) ??
    params.deterministicBrief.oneLinePurpose;
  const recommendedNextStep =
    sentenceFromWords(
      params.output.recommendedNextStepWords,
      MAX_PROACTIVITY_BRIEF_NEXT_STEP_LENGTH,
    ) ?? params.deterministicBrief.recommendedNextStep;
  const primaryActionLabel =
    textFromWords(params.output.primaryActionLabelWords, 80) ??
    params.deterministicBrief.primaryActionLabel;
  const statusLabel =
    textFromWords(params.output.statusLabelWords, 80) ?? params.deterministicBrief.statusLabel;
  const detailSummary =
    sentenceFromWords(params.output.detailSummaryWords, 180) ??
    params.deterministicBrief.detailSummary;
  const whyDemotedOrRepaired = sentenceFromWords(
    params.output.hiddenDiagnostics.whyDemotedOrRepairedWords,
    220,
  );
  const modelStatus =
    params.output.decision === "demote"
      ? "demote"
      : params.output.decision === "repair"
        ? "repair"
        : "pass";
  const candidate: Phase2UserFacingProactivityBrief = {
    ...params.deterministicBrief,
    title,
    kindLabel,
    oneLinePurpose,
    recommendedNextStep,
    primaryActionLabel,
    statusLabel,
    detailSummary,
    hiddenDiagnostics: {
      ...params.deterministicBrief.hiddenDiagnostics,
      limitations: uniqueSorted([
        ...params.deterministicBrief.hiddenDiagnostics.limitations,
        ...params.output.hiddenDiagnostics.limitations,
        ...params.output.qualityReasons,
        whyDemotedOrRepaired,
      ]),
    },
    quality: {
      status: modelStatus,
      reasons: uniqueSorted(params.output.qualityReasons),
    },
    authorship: {
      source: "model",
      modelId: params.modelId,
      inputHash: params.inputHash,
      outputHash: params.outputHash,
      validationStatus: modelStatus,
    },
  };
  const validated = validateUserFacingProactivityBrief(candidate);
  if (params.output.decision === "demote" || validated.status === "demote") {
    return demoteBrief({
      brief: candidate,
      reasons: uniqueSorted([
        ...params.output.qualityReasons,
        ...validated.reasons,
        ...(params.output.decision === "demote" ? ["model_chose_demote"] : []),
      ]),
      authorship: {
        source: "model",
        modelId: params.modelId,
        inputHash: params.inputHash,
        outputHash: params.outputHash,
        validationStatus: "demote",
      },
    });
  }
  return {
    ...candidate,
    quality: validated.status === "repair" ? validated : { status: "pass", reasons: [] },
    authorship: {
      source: "model",
      modelId: params.modelId,
      inputHash: params.inputHash,
      outputHash: params.outputHash,
      validationStatus: validated.status,
    },
  };
}

function fallbackResult(params: {
  deterministicBrief: Phase2UserFacingProactivityBrief;
  inputHash: string;
  elapsedMs: number;
  reasonCodes: string[];
  enabled: boolean;
}): {
  brief: Phase2UserFacingProactivityBrief;
  source: ModelAuthoredBriefSource;
  report: ModelAuthoredProactivityBriefReport;
} {
  const validated = validateUserFacingProactivityBrief(params.deterministicBrief);
  const authorship = {
    source: "deterministic" as const,
    inputHash: params.inputHash,
    validationStatus: "demote" as const,
  };
  const reportReasons = uniqueSorted([
    ...params.reasonCodes,
    ...validated.reasons,
    "model_authored_visible_copy_required",
  ]);
  const brief = demoteBrief({
    brief: params.deterministicBrief,
    reasons: reportReasons,
    authorship,
  });
  return {
    brief,
    source: "demoted",
    report: {
      schemaVersion: MODEL_AUTHORED_PROACTIVITY_BRIEF_REPORT_SCHEMA_VERSION,
      source: "demoted",
      enabled: params.enabled,
      elapsedMs: params.elapsedMs,
      inputHash: params.inputHash,
      decision: "demote",
      validationStatus: brief.quality.status,
      reasonCodes: reportReasons,
      promptPersisted: false,
      rawResponsePersisted: false,
      promptChars: 0,
    },
  };
}

function modelErrorReasonCodes(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return ["model_error:unknown"];
  }
  const trace = (error as { trace?: unknown }).trace;
  if (!trace || typeof trace !== "object") {
    return [`model_error:${error.name}`];
  }
  const fields = trace as {
    failureClass?: unknown;
    failureStage?: unknown;
    httpStatus?: unknown;
  };
  return uniqueSorted([
    `model_error:${error.name}`,
    typeof fields.failureClass === "string" ? `model_failure:${fields.failureClass}` : undefined,
    typeof fields.failureStage === "string" ? `model_stage:${fields.failureStage}` : undefined,
    typeof fields.httpStatus === "number" ? `model_http:${fields.httpStatus}` : undefined,
  ]);
}

export async function buildModelAuthoredUserFacingProactivityBrief(
  input: ModelAuthoredProactivityBriefBuildInput,
  options: ModelAuthoredProactivityBriefOptions = {},
): Promise<{
  brief: Phase2UserFacingProactivityBrief;
  source: ModelAuthoredBriefSource;
  report: ModelAuthoredProactivityBriefReport;
}> {
  const startedAt = Date.now();
  const modelInput = buildModelAuthoredProactivityBriefInput(input);
  const inputHash = sha256JsonValue(modelInput);
  const enabled = options.enabled === true && Boolean(options.executor);
  if (!enabled || !options.executor) {
    return fallbackResult({
      deterministicBrief: input.deterministicBrief,
      inputHash,
      elapsedMs: Date.now() - startedAt,
      reasonCodes: enabled ? ["model_executor_missing"] : ["model_briefing_disabled"],
      enabled,
    });
  }

  const modelId = readModelId(options);
  const userPrompt = buildUserPrompt(modelInput);
  try {
    const response = await options.executor.execute({
      contract: {
        contractName: "session_summary_generation",
        contractVersion: "phase2-model-authored-brief-v1",
        modelId,
      },
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      responseFormat: "json",
      responseOptions: {
        maxOutputTokens: options.maxOutputTokens ?? 900,
        reasoningEffort: options.reasoningEffort ?? "medium",
        verbosity: options.verbosity ?? "low",
        transport: {
          type: "json_schema",
          name: "model_authored_proactivity_brief",
          strict: true,
          schema: MODEL_OUTPUT_JSON_SCHEMA,
        },
      },
    });
    const output = parseJsonModelOutput(
      response,
      {
        contractName: "session_summary_generation",
        contractVersion: "phase2-model-authored-brief-v1",
        modelId,
      },
      OutputSchema,
    );
    const outputHash = sha256JsonValue(output);
    const brief = briefFromModelOutput({
      deterministicBrief: input.deterministicBrief,
      output,
      inputHash,
      outputHash,
      modelId: response.resolvedModelId ?? modelId,
    });
    return {
      brief,
      source: brief.quality.status === "demote" ? "demoted" : "model",
      report: {
        schemaVersion: MODEL_AUTHORED_PROACTIVITY_BRIEF_REPORT_SCHEMA_VERSION,
        source: brief.quality.status === "demote" ? "demoted" : "model",
        enabled: true,
        modelId,
        resolvedModelId: response.resolvedModelId,
        elapsedMs: Date.now() - startedAt,
        inputHash,
        outputHash,
        decision: brief.quality.status === "demote" ? "demote" : output.decision,
        validationStatus: brief.quality.status,
        reasonCodes: brief.quality.reasons,
        promptPersisted: false,
        rawResponsePersisted: false,
        promptChars: userPrompt.length,
        outputChars: response.outputText.length,
      },
    };
  } catch (error) {
    return fallbackResult({
      deterministicBrief: input.deterministicBrief,
      inputHash,
      elapsedMs: Date.now() - startedAt,
      reasonCodes: ["model_brief_generation_failed", ...modelErrorReasonCodes(error)],
      enabled: true,
    });
  }
}
