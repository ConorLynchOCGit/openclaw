import {
  getMemoryProfileByCaptureClass,
  getMemoryProfileIdByWorkflowLessonFamily,
  type MemoryProfileCaptureCategory,
  type MemoryProfileId,
} from "openclaw/plugin-sdk/memory-profile-registry";
import { readCanonicalMemoryIngestionCandidateFromMetadata } from "./memory-canonical-compat.js";

const RESPONSE_STYLE_CAPTURE_CLASSES = new Set([
  "explicit_preference",
  "preference_correction",
  "explicit_requirement",
  "requirement_correction",
]);

const RESPONSE_STYLE_TEMPLATES = new Set([
  "responses_concise",
  "responses_bullets",
  "responses_plain_english",
  "responses_no_tables",
  "responses_numbered_steps",
  "response_style_generalized_guidance",
]);

function readCanonicalCandidateProfileId(
  metadata: Record<string, unknown> | undefined,
): MemoryProfileId | null {
  const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(metadata);
  if (!canonicalCandidate) {
    return null;
  }

  const captureCategory = canonicalCandidate.record.compatibility.captureCategory;
  if (
    captureCategory === "project_fact" ||
    captureCategory === "recurring_procedure" ||
    captureCategory === "workflow_improvement" ||
    captureCategory === "project_rule" ||
    captureCategory === "unmet_need"
  ) {
    return captureCategory;
  }

  const captureClass = canonicalCandidate.compatibility.captureClass;
  if (captureClass) {
    const captureClassProfileId = getMemoryProfileByCaptureClass(captureClass)?.id;
    if (captureClassProfileId) {
      return captureClassProfileId;
    }
    if (RESPONSE_STYLE_CAPTURE_CLASSES.has(captureClass)) {
      return "response_style";
    }
  }

  const lessonFamily = canonicalCandidate.compatibility.metadata.lessonFamily;
  if (typeof lessonFamily === "string") {
    const workflowProfileId = getMemoryProfileIdByWorkflowLessonFamily(lessonFamily);
    if (workflowProfileId) {
      return workflowProfileId;
    }
  }

  const tags = new Set(canonicalCandidate.record.tags);
  for (const profileId of [
    "response_style",
    "project_fact",
    "recurring_procedure",
    "workflow_improvement",
    "project_rule",
    "unmet_need",
  ] as const) {
    if (tags.has(profileId)) {
      return profileId;
    }
  }
  if (tags.has("workflow_guidance")) {
    return "workflow_improvement";
  }
  if (tags.has("procedure")) {
    return "recurring_procedure";
  }
  return canonicalCandidate.record.kind === "user" ? "response_style" : null;
}

function readOptionalAutoCaptureString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const autoCapture = metadata?.autoCapture;
  if (!autoCapture || typeof autoCapture !== "object" || Array.isArray(autoCapture)) {
    return undefined;
  }
  const value = (autoCapture as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readLegacySubmissionProfileId(
  metadata: Record<string, unknown> | undefined,
): MemoryProfileId | null {
  const captureClass = readOptionalAutoCaptureString(metadata, "captureClass");
  if (captureClass) {
    const captureClassProfileId = getMemoryProfileByCaptureClass(captureClass)?.id;
    if (captureClassProfileId) {
      return captureClassProfileId;
    }
    if (RESPONSE_STYLE_CAPTURE_CLASSES.has(captureClass)) {
      return "response_style";
    }
  }

  const lessonFamily = readOptionalAutoCaptureString(metadata, "lessonFamily");
  if (lessonFamily) {
    const workflowProfileId = getMemoryProfileIdByWorkflowLessonFamily(lessonFamily);
    if (workflowProfileId) {
      return workflowProfileId;
    }
  }

  const template = readOptionalAutoCaptureString(metadata, "template");
  if (template && RESPONSE_STYLE_TEMPLATES.has(template)) {
    return "response_style";
  }

  if (readOptionalAutoCaptureString(metadata, "fieldKey")) {
    return "project_fact";
  }
  if (
    readOptionalAutoCaptureString(metadata, "procedureKey") ||
    readOptionalAutoCaptureString(metadata, "title")
  ) {
    return "recurring_procedure";
  }
  return null;
}

export function readSubmissionProfileId(
  metadata: Record<string, unknown> | undefined,
): MemoryProfileId | null {
  return readCanonicalCandidateProfileId(metadata) ?? readLegacySubmissionProfileId(metadata);
}

export function readSubmissionCaptureCategory(
  metadata: Record<string, unknown> | undefined,
): MemoryProfileCaptureCategory | null {
  const profileId = readSubmissionProfileId(metadata);
  if (
    profileId === "project_fact" ||
    profileId === "recurring_procedure" ||
    profileId === "workflow_improvement" ||
    profileId === "project_rule" ||
    profileId === "unmet_need"
  ) {
    return profileId;
  }
  return null;
}

export function readWorkflowSubmissionCaptureCategory(
  metadata: Record<string, unknown> | undefined,
): Extract<
  MemoryProfileCaptureCategory,
  "workflow_improvement" | "project_rule" | "unmet_need"
> | null {
  const captureCategory = readSubmissionCaptureCategory(metadata);
  return captureCategory === "workflow_improvement" ||
    captureCategory === "project_rule" ||
    captureCategory === "unmet_need"
    ? captureCategory
    : null;
}

export function matchesSubmissionRoutingTarget(
  metadata: Record<string, unknown> | undefined,
  target: MemoryProfileId,
): boolean {
  return readSubmissionProfileId(metadata) === target;
}

export function resolveWorkflowCaptureCategoryFromCaptureClass(
  captureClass: string,
): Extract<MemoryProfileCaptureCategory, "workflow_improvement" | "project_rule" | "unmet_need"> {
  const captureCategory = getMemoryProfileByCaptureClass(captureClass)?.capture?.category;
  return captureCategory === "project_rule" || captureCategory === "unmet_need"
    ? captureCategory
    : "workflow_improvement";
}

export function resolveWorkflowReviewModeFromCaptureClass(
  captureClass: string,
): "pending_confirmation" | "hold_for_more_evidence" {
  const captureCategory = getMemoryProfileByCaptureClass(captureClass)?.capture?.category;
  if (captureCategory === "project_rule" || captureCategory === "unmet_need") {
    return "hold_for_more_evidence";
  }
  return captureClass === "workflow_generalized_guidance"
    ? "hold_for_more_evidence"
    : "pending_confirmation";
}
