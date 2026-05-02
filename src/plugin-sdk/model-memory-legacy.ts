// Explicit legacy/admin facade. Runtime call sites should import this only
// when they intentionally depend on retained compatibility surfaces.
type LegacyFacadeModule = typeof import("@openclaw/model-memory/legacy-admin-api.js");
import {
  bindFacadeFunction,
  createLazyFacadeClassValue,
  loadBundledPluginPublicSurfaceModuleSync,
} from "./facade-runtime.js";

function loadLegacyFacadeModule(): LegacyFacadeModule {
  return loadBundledPluginPublicSurfaceModuleSync<LegacyFacadeModule>({
    dirName: "model-memory",
    artifactBasename: "legacy-admin-api.js",
  });
}

export type {
  BoundedCandidateAdjudicationBatchDecision,
  BoundedCandidateAdjudicationRequest,
  BoundedCandidateAdjudicationSource,
  ClaimFieldComparison,
  CollisionAdjudicationBatchDecision,
  CollisionAdjudicationDecision,
  CollisionAdjudicationRequest,
  CollisionCandidate,
  DatabaseMemoryObjectStoreObserver,
  MemoryIdentityDescriptor,
  PackagingDriftType,
  SameClaimConfidence,
  SearchTextOverlap,
  SemanticCollisionAdjudicator,
  StructuralDeltaClass,
} from "@openclaw/model-memory/legacy-admin-api.js";

export const DatabaseMemoryObjectStore = createLazyFacadeClassValue(
  loadLegacyFacadeModule,
  "DatabaseMemoryObjectStore",
);
export const DisabledCapturedObjectWriteStore = createLazyFacadeClassValue(
  loadLegacyFacadeModule,
  "DisabledCapturedObjectWriteStore",
);
export const ExecutorBackedSemanticCollisionAdjudicator = createLazyFacadeClassValue(
  loadLegacyFacadeModule,
  "ExecutorBackedSemanticCollisionAdjudicator",
);
export const MmV2DatabaseMemoryObjectStore = createLazyFacadeClassValue(
  loadLegacyFacadeModule,
  "MmV2DatabaseMemoryObjectStore",
);

export const assessStructuralSameClaimDelta = bindFacadeFunction(
  loadLegacyFacadeModule,
  "assessStructuralSameClaimDelta",
);
export const buildCollisionCandidates = bindFacadeFunction(
  loadLegacyFacadeModule,
  "buildCollisionCandidates",
);
export const buildZeroCandidateRecoverySelection = bindFacadeFunction(
  loadLegacyFacadeModule,
  "buildZeroCandidateRecoverySelection",
);
export const calculateSearchTextOverlap = bindFacadeFunction(
  loadLegacyFacadeModule,
  "calculateSearchTextOverlap",
);
export const deriveMemoryIdentity = bindFacadeFunction(
  loadLegacyFacadeModule,
  "deriveMemoryIdentity",
);
export const describeClaimFieldComparison = bindFacadeFunction(
  loadLegacyFacadeModule,
  "describeClaimFieldComparison",
);
export const describeDecisiveFieldAgreement = bindFacadeFunction(
  loadLegacyFacadeModule,
  "describeDecisiveFieldAgreement",
);
export const isDeterministicSameSlotSupersession = bindFacadeFunction(
  loadLegacyFacadeModule,
  "isDeterministicSameSlotSupersession",
);
export const isLegacyCapturedObjectWriteFallbackEnabled = bindFacadeFunction(
  loadLegacyFacadeModule,
  "isLegacyCapturedObjectWriteFallbackEnabled",
);
export const listLegacyFallbackSurfaces = bindFacadeFunction(
  loadLegacyFacadeModule,
  "listLegacyFallbackSurfaces",
);
export const normalizeIdentityText = bindFacadeFunction(
  loadLegacyFacadeModule,
  "normalizeIdentityText",
);
export const runLiveDocumentShadow = bindFacadeFunction(
  loadLegacyFacadeModule,
  "runLiveDocumentShadow",
);
export const toBoundedCandidateAdjudicationCandidatesFromRetained = bindFacadeFunction(
  loadLegacyFacadeModule,
  "toBoundedCandidateAdjudicationCandidatesFromRetained",
);
export const toBoundedCandidateAdjudicationCandidatesFromSearch = bindFacadeFunction(
  loadLegacyFacadeModule,
  "toBoundedCandidateAdjudicationCandidatesFromSearch",
);
