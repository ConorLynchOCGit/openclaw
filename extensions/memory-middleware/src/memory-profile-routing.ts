import {
  getMemoryProfile,
  getMemoryProfileByCaptureClass,
  getMemoryProfileIdByWorkflowLessonFamily,
  listMemoryProfiles,
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

const PROFILE_ID_BY_DERIVED_VIEW_OR_TAG = new Map<string, MemoryProfileId>();
const SUBMISSION_CAPTURE_CATEGORIES = new Set<MemoryProfileCaptureCategory>();
const WORKFLOW_CAPTURE_CATEGORIES = new Set<
  Extract<MemoryProfileCaptureCategory, "workflow_improvement" | "project_rule" | "unmet_need">
>();
for (const profile of listMemoryProfiles()) {
  PROFILE_ID_BY_DERIVED_VIEW_OR_TAG.set(profile.id, profile.id);
  for (const derivedView of profile.derivedViews) {
    PROFILE_ID_BY_DERIVED_VIEW_OR_TAG.set(derivedView, profile.id);
  }
  if (profile.capture?.category) {
    SUBMISSION_CAPTURE_CATEGORIES.add(profile.capture.category);
    if (
      profile.capture.category === "workflow_improvement" ||
      profile.capture.category === "project_rule" ||
      profile.capture.category === "unmet_need"
    ) {
      WORKFLOW_CAPTURE_CATEGORIES.add(profile.capture.category);
    }
  }
}

function isSubmissionCaptureCategory(
  value: string | undefined,
): value is MemoryProfileCaptureCategory {
  return value ? SUBMISSION_CAPTURE_CATEGORIES.has(value as MemoryProfileCaptureCategory) : false;
}

function isWorkflowSubmissionCaptureCategory(
  value: MemoryProfileCaptureCategory | null,
): value is Extract<
  MemoryProfileCaptureCategory,
  "workflow_improvement" | "project_rule" | "unmet_need"
> {
  return value
    ? WORKFLOW_CAPTURE_CATEGORIES.has(
        value as Extract<
          MemoryProfileCaptureCategory,
          "workflow_improvement" | "project_rule" | "unmet_need"
        >,
      )
    : false;
}

function readCanonicalCandidateProfileId(
  metadata: Record<string, unknown> | undefined,
): MemoryProfileId | null {
  const canonicalCandidate = readCanonicalMemoryIngestionCandidateFromMetadata(metadata);
  if (!canonicalCandidate) {
    return null;
  }

  const captureCategory =
    typeof canonicalCandidate.record.compatibility.captureCategory === "string"
      ? canonicalCandidate.record.compatibility.captureCategory
      : undefined;
  if (isSubmissionCaptureCategory(captureCategory)) {
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

  for (const tag of canonicalCandidate.record.tags) {
    const profileId = PROFILE_ID_BY_DERIVED_VIEW_OR_TAG.get(tag);
    if (profileId) {
      return profileId;
    }
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
  return profileId ? (getMemoryProfile(profileId).capture?.category ?? null) : null;
}

export function readWorkflowSubmissionCaptureCategory(
  metadata: Record<string, unknown> | undefined,
): Extract<
  MemoryProfileCaptureCategory,
  "workflow_improvement" | "project_rule" | "unmet_need"
> | null {
  const captureCategory = readSubmissionCaptureCategory(metadata);
  return isWorkflowSubmissionCaptureCategory(captureCategory) ? captureCategory : null;
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
  return captureCategory === "project_rule" ||
    captureCategory === "unmet_need" ||
    captureCategory === "workflow_improvement"
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
