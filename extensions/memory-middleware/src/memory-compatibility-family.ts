/**
 * Deprecated compatibility-family bridge.
 *
 * Active runtime code should prefer the profile-named exports from
 * `memory-compatibility-profile.ts`. This file remains only to avoid breaking
 * older family-oriented call sites while the repo finishes vocabulary cleanup.
 */

export {
  buildCanonicalMemoryRecordForCompatibilityProfile as buildCanonicalMemoryRecordForCompatibilityFamily,
  COMPATIBILITY_MEMORY_PROFILE_IDS as COMPATIBILITY_MEMORY_FAMILY_IDS,
  getCompatibilityMemoryProfileIdByCaptureClass as getCompatibilityMemoryFamilyIdByCaptureClass,
  getCompatibilityMemoryProfileIdByWorkflowLessonFamily as getCompatibilityMemoryFamilyIdByWorkflowLessonFamily,
} from "./memory-compatibility-profile.js";

export type {
  BuildCanonicalMemoryRecordForCompatibilityProfileParams as BuildCanonicalMemoryRecordForCompatibilityFamilyParams,
  CompatibilityMemoryProfileId as CompatibilityMemoryFamilyId,
} from "./memory-compatibility-profile.js";
