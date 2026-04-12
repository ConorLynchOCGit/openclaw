import {
  listMemoryProfiles,
  type MemoryProfileId,
} from "openclaw/plugin-sdk/memory-profile-registry";
import type { RankedRetrievedMemoryRecord } from "./db/runtime.js";
import { readSubmissionProfileId } from "./memory-profile-routing.js";

export type ProjectRetrievedProfile =
  | "project_fact"
  | "workflow_guidance"
  | "project_rule"
  | "unmet_need"
  | "other";

const PROJECT_RETRIEVED_PROFILE_BY_SUBMISSION_PROFILE = new Map<
  MemoryProfileId,
  ProjectRetrievedProfile
>();
for (const profile of listMemoryProfiles()) {
  const captureCategory = profile.capture?.category;
  if (captureCategory === "project_fact" || captureCategory === "project_rule") {
    PROJECT_RETRIEVED_PROFILE_BY_SUBMISSION_PROFILE.set(profile.id, captureCategory);
    continue;
  }
  if (captureCategory === "unmet_need") {
    PROJECT_RETRIEVED_PROFILE_BY_SUBMISSION_PROFILE.set(profile.id, "unmet_need");
    continue;
  }
  if (profile.derivedViews.includes("workflow_guidance") || profile.canonicalKind === "feedback") {
    PROJECT_RETRIEVED_PROFILE_BY_SUBMISSION_PROFILE.set(profile.id, "workflow_guidance");
  }
}

export function classifyProjectRetrievedProfile(
  record: RankedRetrievedMemoryRecord,
): ProjectRetrievedProfile {
  if (record.objectType !== "memory_object") {
    return "other";
  }

  const profileId = readSubmissionProfileId(record.metadata);
  if (!profileId) {
    return "other";
  }
  return PROJECT_RETRIEVED_PROFILE_BY_SUBMISSION_PROFILE.get(profileId) ?? "other";
}
