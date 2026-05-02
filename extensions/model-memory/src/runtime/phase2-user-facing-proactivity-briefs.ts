import type { SourceProfileId } from "../source-authority.ts";
import type {
  Phase2OpportunityLedgerEntry,
  Phase2OpportunityLifecycleStatus,
} from "./phase2-proactivity-opportunity-ledger.ts";
import type {
  Phase2ProactivityWorkItemAction,
  Phase2ProactivityWorkItemKind,
} from "./phase2-proactivity-work-items.ts";
import type { Phase2SkillCandidateRecord } from "./phase2-skill-candidate-ledger.ts";
import type { Phase2SkillPackageDraft } from "./phase2-skillifier-draft.ts";
import {
  buildProactivityUserFacingFocusKey,
  cleanProactivityUserFacingText,
} from "./proactivity-text.ts";

export type Phase2UserFacingProactivityBriefKindLabel =
  | "New skill"
  | "Improve skill"
  | "Merge skill"
  | "Follow-up"
  | "Proactive plan"
  | "Question"
  | "Draft ready"
  | "Repair";

export type Phase2UserFacingSkillPresentationKind =
  | "new_skill_candidate"
  | "existing_skill_enhancement"
  | "merge_or_extend_candidate"
  | "not_skill_worthy";

export type Phase2UserFacingProactivityBriefQualityStatus = "pass" | "demote" | "repair";

export type Phase2UserFacingProactivityBrief = {
  title: string;
  kindLabel: Phase2UserFacingProactivityBriefKindLabel;
  oneLinePurpose: string;
  recommendedNextStep: string;
  primaryActionLabel: string;
  statusLabel?: string;
  detailSummary?: string;
  skillPresentationKind?: Phase2UserFacingSkillPresentationKind;
  possibleExistingSkillName?: string;
  hiddenDiagnostics: {
    whyNow?: string;
    evidenceSummary?: string;
    provenanceRefs: string[];
    limitations: string[];
    sourceRefs?: string[];
  };
  quality: {
    status: Phase2UserFacingProactivityBriefQualityStatus;
    reasons: string[];
  };
  authorship?: {
    source: "deterministic" | "model";
    modelId?: string;
    inputHash?: string;
    outputHash?: string;
    validationStatus?: "pass" | "demote" | "repair";
  };
};

export type Phase2UserFacingProactivityExistingSkill = {
  name: string;
  description?: string;
  source?: string;
};

export type Phase2UserFacingProactivityBriefInput = {
  opportunityClass?: Phase2OpportunityLedgerEntry["opportunityClass"] | "standard";
  opportunityStatus?: Phase2OpportunityLifecycleStatus;
  workItemKind?: Phase2ProactivityWorkItemKind;
  title: string;
  whyNow?: string;
  proposedNextStep?: string;
  expectedUserValue?: string;
  evidenceSummary?: string;
  confidence?: "high" | "medium" | "low";
  primaryAction?: Phase2ProactivityWorkItemAction | null;
  skillCandidate?: Phase2SkillCandidateRecord;
  skillifierDraft?: Phase2SkillPackageDraft | null;
  existingSkills?: Phase2UserFacingProactivityExistingSkill[];
  sourceRefs?: string[];
  sourceProfileIds?: SourceProfileId[];
};

export const MAX_PROACTIVITY_BRIEF_TITLE_LENGTH = 72;
export const MAX_PROACTIVITY_BRIEF_PURPOSE_LENGTH = 170;
export const MAX_PROACTIVITY_BRIEF_NEXT_STEP_LENGTH = 190;

const MAX_TITLE_LENGTH = MAX_PROACTIVITY_BRIEF_TITLE_LENGTH;
const MAX_PURPOSE_LENGTH = MAX_PROACTIVITY_BRIEF_PURPOSE_LENGTH;
const MAX_NEXT_STEP_LENGTH = MAX_PROACTIVITY_BRIEF_NEXT_STEP_LENGTH;

const PROHIBITED_PRIMARY_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

const REVERSE_PROMPT_BAD_PREFIX = /^question worth asking before\b/i;
const TURN_PREFIX = /^turn\b/i;
const DUPLICATED_TURN = /\bturn\s+turn\b/i;
const CLIPPED_FRAGMENT_PREFIX =
  /^(?:already recurring|build the bounded request with|it sets the default|current skillifier outputs|first bounded draft package should include only what is)\b/i;
const GENERIC_PURPOSE_PATTERN =
  /\bturns a recent idea into a bounded next step\b|\bwithout digging through the inbox\b|\badvance the current work with one bounded next step\b/i;
const UNSAFE_ACTION_CLAIM_PATTERN =
  /\b(?:auto-?promote|execute[ds]?|ran|mutated?|wrote files?|edited files?|send\s+now|sent\s+message|install(?:ed)?\s+the|promote(?:d)?\s+the)\b/i;
const SOURCE_REF_PATTERN = /\b(?:source:\s*)?(?:chat|gateway|memory|file|docs?):\/\//i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const TIMESTAMP_PATTERN = /\b20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function isSlugLikeDisplayTitle(value: string): boolean {
  const trimmed = value
    .trim()
    .replace(
      /^(?:new skill|improve skill|merge skill|proactive plan|follow-up|question|draft ready|repair):\s*/iu,
      "",
    );
  return (
    trimmed.length > 24 && !/\s/u.test(trimmed) && /[-_]/u.test(trimmed) && /[a-z]/u.test(trimmed)
  );
}

function sourceTitleDiagnostics(sourceTitle: string | undefined): string[] {
  const reasons: string[] = [];
  const title = sourceTitle ?? "";
  if (TURN_PREFIX.test(title)) {
    reasons.push("source_title_was_transformation_instruction");
  }
  if (DUPLICATED_TURN.test(title)) {
    reasons.push("source_title_contained_duplicated_turn");
  }
  if (REVERSE_PROMPT_BAD_PREFIX.test(title)) {
    reasons.push("source_title_was_reverse_prompt_fallback");
  }
  return reasons;
}

function compact(value: string | undefined, maxLength: number): string {
  const cleaned = cleanProactivityUserFacingText(value ?? "", { maxLength }) ?? "";
  return cleaned.trim();
}

function sentence(value: string | undefined, fallback: string, maxLength: number): string {
  const cleaned = compact(value, maxLength);
  if (!cleaned) {
    return fallback;
  }
  return cleaned.endsWith(".") || cleaned.endsWith("?") || cleaned.endsWith("!")
    ? cleaned
    : `${cleaned}.`;
}

function normalizeWords(value: string | undefined): string {
  return (buildProactivityUserFacingFocusKey(value ?? "") ?? "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProactivityBriefWordsForTest(value: string | undefined): string {
  return normalizeWords(value);
}

function slugFromWords(value: string): string {
  return normalizeWords(value).replace(/\s+/g, "-").slice(0, 48).replace(/-+$/g, "");
}

function titleCaseFromWords(value: string): string {
  const words = normalizeWords(value).split(" ").filter(Boolean).slice(0, 7);
  return words
    .map((word) => (word.length <= 3 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`))
    .join(" ");
}

function cleanSkillName(value: string | undefined): string {
  const slug = slugFromWords(value ?? "");
  return slug || "reusable-workflow";
}

function capabilityNameForSkill(input: {
  skillCandidate: Phase2SkillCandidateRecord;
  title: string;
  proposedNextStep?: string;
}): string {
  const combined = normalizeWords(
    [
      input.skillCandidate.suggestedSkillName,
      input.skillCandidate.normalizedIntentKey,
      input.title,
      input.proposedNextStep,
    ].join(" "),
  );
  if (/\bweb research routing\b/.test(combined)) {
    return "web-research-routing";
  }
  if (/\bdraft package\b/.test(combined) || /\bbounded draft package\b/.test(combined)) {
    return "draft-skill-package-checklist";
  }
  return cleanSkillName(
    input.skillCandidate.suggestedSkillName || input.skillCandidate.normalizedIntentKey,
  );
}

function skillPurposeFor(input: {
  capabilityName: string;
  skillCandidate: Phase2SkillCandidateRecord;
  existingSkillName?: string;
  expectedUserValue?: string;
}): string {
  const key = normalizeWords(
    `${input.capabilityName} ${input.skillCandidate.normalizedIntentKey} ${input.skillCandidate.evidenceSummary}`,
  );
  if (input.existingSkillName && /\bskill vetting\b/.test(key)) {
    return `Add a repeatable ClawHub quarantine and review workflow to the existing ${input.existingSkillName} path.`;
  }
  if (/\bweb research routing\b/.test(key)) {
    return "Choose the correct retrieval lane before external-web research starts.";
  }
  if (/\bdraft skill package checklist\b|\bdraft package\b/.test(key)) {
    return "Define what belongs in the first bounded Skillifier draft package before any install or promotion.";
  }
  if (input.existingSkillName) {
    return `Add this repeated workflow to the existing ${input.existingSkillName} skill.`;
  }
  return sentence(
    input.expectedUserValue,
    `Turn the repeated ${titleCaseFromWords(input.skillCandidate.normalizedIntentKey)} workflow into a reusable skill.`,
    MAX_PURPOSE_LENGTH,
  );
}

function explicitExistingSkillMatch(input: {
  skillCandidate?: Phase2SkillCandidateRecord;
  title: string;
  proposedNextStep?: string;
  existingSkills?: Phase2UserFacingProactivityExistingSkill[];
}): Phase2UserFacingProactivityExistingSkill | null {
  const candidate = input.skillCandidate;
  if (!candidate || !input.existingSkills?.length) {
    return null;
  }
  const explicitName = normalizeWords(candidate.suggestedExistingSkillName);
  if (explicitName) {
    const direct = input.existingSkills.find(
      (skill) => normalizeWords(skill.name) === explicitName,
    );
    if (direct) {
      return direct;
    }
  }
  const haystack = ` ${normalizeWords(
    [
      candidate.suggestedSkillName,
      candidate.normalizedIntentKey,
      candidate.evidenceSummary,
      input.title,
      input.proposedNextStep,
    ].join(" "),
  )} `;
  return (
    input.existingSkills.find((skill) => {
      const nameWords = normalizeWords(skill.name);
      if (!nameWords || nameWords.split(" ").length < 2) {
        return false;
      }
      return haystack.includes(` ${nameWords} `);
    }) ?? null
  );
}

function primaryActionLabelFor(input: Phase2UserFacingProactivityBriefInput): string {
  if (input.skillifierDraft) {
    return "Review draft";
  }
  if (input.primaryAction?.label) {
    return input.primaryAction.label;
  }
  if (input.opportunityClass === "skill_candidate") {
    return "Draft skill package";
  }
  if (input.opportunityClass === "reverse_prompt") {
    return "Answer question";
  }
  if (input.opportunityClass === "proactive_plan") {
    return "Plan this";
  }
  return "Open in chat";
}

function isCompleteQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.endsWith("?")) {
    return false;
  }
  return /^(?:should|what|which|where|when|why|how|do|does|can|could|would|is|are)\b/i.test(
    trimmed,
  );
}

function stripNextStepPrefix(value: string): string {
  return value.replace(/^next step:\s*/i, "").trim();
}

function repeatsTitle(input: { title: string; recommendedNextStep: string }): boolean {
  const title = normalizeWords(
    input.title.replace(
      /^(?:new skill|improve skill|merge skill|question|draft ready|repair|follow-up):\s*/i,
      "",
    ),
  );
  const nextStep = normalizeWords(stripNextStepPrefix(input.recommendedNextStep));
  if (!title || !nextStep) {
    return false;
  }
  return title === nextStep || nextStep.startsWith(`${title} `) || title.startsWith(`${nextStep} `);
}

function hasActionableNextStep(value: string): boolean {
  return /\b(?:add|create|draft|extend|review|run|decide|choose|answer|open|start|inspect|investigate|summarize|compare|approve|demote|repair|clarify|define|check|test|verify|plan|write|select|outline)\b/i.test(
    value,
  );
}

function buildReversePromptBrief(
  input: Phase2UserFacingProactivityBriefInput,
): Phase2UserFacingProactivityBrief {
  const title = compact(input.title, MAX_TITLE_LENGTH);
  const proposed = compact(input.proposedNextStep, MAX_NEXT_STEP_LENGTH);
  const goodQuestion = isCompleteQuestion(title) && !REVERSE_PROMPT_BAD_PREFIX.test(title);
  const visibleTitle = goodQuestion ? `Question: ${title}` : title || "Question";
  const reasons = qualityReasons({
    title: visibleTitle,
    oneLinePurpose: sentence(
      input.expectedUserValue ?? input.whyNow,
      "Clarify the missing decision before the next proactive step.",
      MAX_PURPOSE_LENGTH,
    ),
    recommendedNextStep: sentence(
      proposed,
      "Turn the answer into a bounded checklist or investigation brief.",
      MAX_NEXT_STEP_LENGTH,
    ),
    sourceTitle: input.title,
    reversePrompt: true,
  });
  if (!goodQuestion) {
    reasons.push("reverse_prompt_title_not_complete_question");
  }
  const status: Phase2UserFacingProactivityBriefQualityStatus = reasons.length ? "demote" : "pass";
  return {
    title: visibleTitle,
    kindLabel: "Question",
    oneLinePurpose: sentence(
      input.expectedUserValue ?? input.whyNow,
      "Clarify the missing decision before the next proactive step.",
      MAX_PURPOSE_LENGTH,
    ),
    recommendedNextStep: sentence(
      proposed,
      "Turn the answer into a bounded checklist or investigation brief.",
      MAX_NEXT_STEP_LENGTH,
    ),
    primaryActionLabel: primaryActionLabelFor(input),
    statusLabel: input.opportunityStatus?.replace(/_/g, " "),
    detailSummary: "Reverse-prompt diagnostics are available in details.",
    hiddenDiagnostics: {
      whyNow: compact(input.whyNow, 220),
      evidenceSummary: compact(input.evidenceSummary, 220),
      provenanceRefs: input.sourceRefs ?? [],
      limitations: status === "pass" ? [] : reasons,
      sourceRefs: input.sourceRefs,
    },
    quality: { status, reasons },
  };
}

function buildSkillBrief(
  input: Phase2UserFacingProactivityBriefInput,
): Phase2UserFacingProactivityBrief {
  const skillCandidate = input.skillCandidate;
  if (!skillCandidate) {
    return buildStandardBrief(input);
  }
  const existingSkill = explicitExistingSkillMatch(input);
  const capabilityName = capabilityNameForSkill({
    skillCandidate,
    title: input.title,
    proposedNextStep: input.proposedNextStep,
  });
  const kindLabel: Phase2UserFacingProactivityBriefKindLabel = existingSkill
    ? "Improve skill"
    : "New skill";
  const skillPresentationKind: Phase2UserFacingSkillPresentationKind = existingSkill
    ? "existing_skill_enhancement"
    : "new_skill_candidate";
  const oneLinePurpose = skillPurposeFor({
    capabilityName,
    skillCandidate,
    existingSkillName: existingSkill?.name,
    expectedUserValue: input.expectedUserValue,
  });
  const title = `${kindLabel}: ${existingSkill?.name ?? capabilityName}`;
  const recommendedNextStep = input.skillifierDraft
    ? sentence(input.skillifierDraft.nextReviewStep, "Review the bounded draft package.", 170)
    : existingSkill
      ? `Next step: Draft the enhancement checklist and acceptance tests.`
      : `Next step: Draft the skill contract and routing or workflow checks.`;
  const reasons = qualityReasons({
    title,
    oneLinePurpose,
    recommendedNextStep,
  });
  const sourceDiagnostics = sourceTitleDiagnostics(input.title);
  return {
    title,
    kindLabel,
    oneLinePurpose,
    recommendedNextStep,
    primaryActionLabel: primaryActionLabelFor(input),
    statusLabel: input.skillifierDraft
      ? "draft ready"
      : input.opportunityStatus?.replace(/_/g, " "),
    detailSummary: input.skillifierDraft
      ? "A review-only skill draft is ready; install and promotion remain off."
      : "Candidate evidence and why-now diagnostics are available in details.",
    skillPresentationKind,
    possibleExistingSkillName: existingSkill?.name,
    hiddenDiagnostics: {
      whyNow: compact(input.whyNow, 220),
      evidenceSummary: compact(input.evidenceSummary ?? skillCandidate.evidenceSummary, 220),
      provenanceRefs: skillCandidate.provenanceRefs,
      limitations: [...reasons, ...sourceDiagnostics].toSorted(),
      sourceRefs: input.sourceRefs,
    },
    quality: { status: reasons.length ? "repair" : "pass", reasons },
  };
}

function buildStandardBrief(
  input: Phase2UserFacingProactivityBriefInput,
): Phase2UserFacingProactivityBrief {
  const kindLabel: Phase2UserFacingProactivityBriefKindLabel =
    input.opportunityClass === "self_healing"
      ? "Repair"
      : input.opportunityClass === "proactive_plan"
        ? "Proactive plan"
        : input.opportunityClass === "followup" || input.opportunityClass === "recovery"
          ? "Follow-up"
          : input.skillifierDraft
            ? "Draft ready"
            : "Follow-up";
  const title =
    compact(input.title, MAX_TITLE_LENGTH) ||
    (kindLabel === "Repair" ? "Repair proactive surface quality" : "Review proactive next step");
  const oneLinePurpose = sentence(
    input.expectedUserValue ?? input.whyNow,
    "Advance the current work with one bounded next step.",
    MAX_PURPOSE_LENGTH,
  );
  const recommendedNextStep = sentence(
    input.proposedNextStep,
    "Start a bounded chat handoff for the next useful step.",
    MAX_NEXT_STEP_LENGTH,
  );
  const reasons = qualityReasons({
    title,
    oneLinePurpose,
    recommendedNextStep,
    sourceTitle: input.title,
  });
  return {
    title,
    kindLabel,
    oneLinePurpose,
    recommendedNextStep,
    primaryActionLabel: primaryActionLabelFor(input),
    statusLabel: input.opportunityStatus?.replace(/_/g, " "),
    detailSummary: "Evidence and why-now diagnostics are available in details.",
    hiddenDiagnostics: {
      whyNow: compact(input.whyNow, 220),
      evidenceSummary: compact(input.evidenceSummary, 220),
      provenanceRefs: input.sourceRefs ?? [],
      limitations: reasons,
      sourceRefs: input.sourceRefs,
    },
    quality: { status: reasons.length ? "repair" : "pass", reasons },
  };
}

function qualityReasons(input: {
  title: string;
  oneLinePurpose: string;
  recommendedNextStep: string;
  sourceTitle?: string;
  reversePrompt?: boolean;
}): string[] {
  const reasons: string[] = [];
  const primaryText = [input.title, input.oneLinePurpose, input.recommendedNextStep].join("\n");
  const title = input.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    reasons.push("title_too_long");
  }
  if (isSlugLikeDisplayTitle(title)) {
    reasons.push("title_is_slug_like");
  }
  if (CLIPPED_FRAGMENT_PREFIX.test(title)) {
    reasons.push("title_is_clipped_source_fragment");
  }
  if (TURN_PREFIX.test(title) || TURN_PREFIX.test(input.sourceTitle ?? "")) {
    reasons.push("title_derived_from_transformation_instruction");
  }
  if (DUPLICATED_TURN.test(primaryText) || DUPLICATED_TURN.test(input.sourceTitle ?? "")) {
    reasons.push("title_contains_duplicated_turn");
  }
  if (
    REVERSE_PROMPT_BAD_PREFIX.test(title) ||
    REVERSE_PROMPT_BAD_PREFIX.test(input.sourceTitle ?? "")
  ) {
    reasons.push("reverse_prompt_fallback_title");
  }
  if (/\bwhy now\b/i.test(primaryText)) {
    reasons.push("primary_copy_contains_why_now");
  }
  if (/\b(?:skill worth creating|draft ready)\b/i.test(primaryText)) {
    reasons.push("primary_copy_contains_internal_heading");
  }
  if (GENERIC_PURPOSE_PATTERN.test(input.oneLinePurpose)) {
    reasons.push("purpose_is_generic_fallback");
  }
  if (repeatsTitle({ title, recommendedNextStep: input.recommendedNextStep })) {
    reasons.push("next_step_repeats_title");
  }
  if (!hasActionableNextStep(input.recommendedNextStep)) {
    reasons.push("next_step_not_actionable");
  }
  if (SOURCE_REF_PATTERN.test(primaryText)) {
    reasons.push("primary_copy_contains_source_ref");
  }
  if (UUID_PATTERN.test(primaryText)) {
    reasons.push("primary_copy_contains_id");
  }
  if (TIMESTAMP_PATTERN.test(primaryText)) {
    reasons.push("primary_copy_contains_timestamp");
  }
  for (const marker of PROHIBITED_PRIMARY_MARKERS) {
    if (primaryText.toLowerCase().includes(marker)) {
      reasons.push("primary_copy_contains_prohibited_content");
      break;
    }
  }
  if (UNSAFE_ACTION_CLAIM_PATTERN.test(primaryText)) {
    reasons.push("primary_copy_claims_unsafe_action");
  }
  if (input.reversePrompt && !isCompleteQuestion(title.replace(/^question:\s*/i, ""))) {
    reasons.push("reverse_prompt_title_not_complete_question");
  }
  return [...new Set(reasons)].toSorted();
}

export function validateUserFacingProactivityBrief(
  brief: Phase2UserFacingProactivityBrief,
): Phase2UserFacingProactivityBrief["quality"] {
  const reasons = qualityReasons({
    title: brief.title,
    oneLinePurpose: brief.oneLinePurpose,
    recommendedNextStep: brief.recommendedNextStep,
    reversePrompt: brief.kindLabel === "Question",
  });
  return {
    status:
      brief.quality.status === "demote" || reasons.length > 0
        ? "demote"
        : brief.quality.status === "repair"
          ? "repair"
          : "pass",
    reasons: [...new Set([...brief.quality.reasons, ...reasons])].toSorted(),
  };
}

export function buildUserFacingProactivityBrief(
  input: Phase2UserFacingProactivityBriefInput,
): Phase2UserFacingProactivityBrief {
  if (input.opportunityClass === "reverse_prompt") {
    return buildReversePromptBrief(input);
  }
  if (input.opportunityClass === "skill_candidate") {
    return buildSkillBrief(input);
  }
  return buildStandardBrief(input);
}
