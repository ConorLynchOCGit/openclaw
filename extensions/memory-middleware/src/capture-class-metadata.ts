import {
  getMemoryProfileByCaptureClass,
  type MemoryProfileCaptureCategory,
  type MemoryProfileCaptureSource,
} from "openclaw/plugin-sdk/memory-profile-registry";

export type CanonicalCaptureClassMetadata = {
  category: MemoryProfileCaptureCategory;
  source: MemoryProfileCaptureSource;
  subjectKeyMetadata?: "subject_key";
};

export function getCanonicalCaptureMetadataByCaptureClass(
  captureClass: string,
): CanonicalCaptureClassMetadata | null {
  const capture = getMemoryProfileByCaptureClass(captureClass)?.capture;
  if (!capture) {
    return null;
  }
  return {
    category: capture.category,
    source: capture.source,
    ...(capture.subjectKeyMetadata ? { subjectKeyMetadata: capture.subjectKeyMetadata } : {}),
  };
}
