// Manual facade. Keep loader boundary explicit and host-facing.
type FacadeModule = typeof import("@openclaw/model-memory/runtime-api.js");
import {
  createLazyFacadeArrayValue,
  createLazyFacadeObjectValue,
  loadBundledPluginPublicSurfaceModuleSync,
} from "./facade-runtime.js";

function loadFacadeModule(): FacadeModule {
  return loadBundledPluginPublicSurfaceModuleSync<FacadeModule>({
    dirName: "model-memory",
    artifactBasename: "runtime-api.js",
  });
}

function bindFacadeFunction<K extends keyof FacadeModule>(key: K): FacadeModule[K] {
  return ((...args: unknown[]) =>
    (loadFacadeModule()[key] as (...args: unknown[]) => unknown)(...args)) as FacadeModule[K];
}

function createLazyFacadeClassValue<K extends keyof FacadeModule>(key: K): FacadeModule[K] {
  const target = function facadeClassProxy() {} as unknown as object;
  return new Proxy(target, {
    apply(_target, thisArg, args) {
      return Reflect.apply(loadFacadeModule()[key] as CallableFunction, thisArg, args);
    },
    construct(_target, args, newTarget) {
      return Reflect.construct(
        loadFacadeModule()[key] as new (...args: unknown[]) => object,
        args,
        newTarget as new (...args: unknown[]) => object,
      );
    },
    defineProperty(_target, property, descriptor) {
      return Reflect.defineProperty(loadFacadeModule()[key] as object, property, descriptor);
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(loadFacadeModule()[key] as object, property);
    },
    get(_target, property, receiver) {
      return Reflect.get(loadFacadeModule()[key] as object, property, receiver);
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(loadFacadeModule()[key] as object, property);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(loadFacadeModule()[key] as object);
    },
    has(_target, property) {
      return Reflect.has(loadFacadeModule()[key] as object, property);
    },
    isExtensible() {
      return Reflect.isExtensible(loadFacadeModule()[key] as object);
    },
    ownKeys() {
      return Reflect.ownKeys(loadFacadeModule()[key] as object);
    },
    preventExtensions() {
      return Reflect.preventExtensions(loadFacadeModule()[key] as object);
    },
    set(_target, property, value, receiver) {
      return Reflect.set(loadFacadeModule()[key] as object, property, value, receiver);
    },
    setPrototypeOf(_target, prototype) {
      return Reflect.setPrototypeOf(loadFacadeModule()[key] as object, prototype);
    },
  }) as FacadeModule[K];
}

export type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  BoundedCandidateAdjudicationBatchDecision,
  BoundedCandidateAdjudicationRequest,
  BoundedCandidateAdjudicationSource,
  ClaimFieldComparison,
  CollisionAdjudicationBatchDecision,
  CollisionAdjudicationDecision,
  CollisionAdjudicationRequest,
  CollisionCandidate,
  ContextArtifactRecord,
  DatabaseMemoryObjectStoreObserver,
  InterpretedRetrievalRequest,
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  ModelMemoryStorageEngine,
  MemoryIdentityDescriptor,
  ModelMemoryLifecycleState,
  ModelMemoryObject,
  ModelMemoryObjectRecord,
  ModelMemoryPgPool,
  ModelMemoryPgPoolConfig,
  ModelMemorySourceKind,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemoryWriteEventRecord,
  PackagingDriftType,
  ProjectionMaterializationResult,
  ProductionHookProbeRecord,
  RetrievalEnvelope,
  RetrievalResultItemRecord,
  RuntimeCompatibleMemoryRecord,
  RuntimeMemoryRecord,
  RuntimeRebuildResult,
  SameClaimConfidence,
  SearchTextOverlap,
  SemanticCollisionAdjudicator,
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
  SessionContextStateRecord,
  SqlClient,
  StructuralDeltaClass,
  ToolResultProofCaptureBuildResult,
  ToolResultProofCaptureInput,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "@openclaw/model-memory/runtime-api.js";

export const CanonicalClassSchema: FacadeModule["CanonicalClassSchema"] =
  createLazyFacadeObjectValue(() => loadFacadeModule().CanonicalClassSchema);

export const DatabaseMemoryObjectStore: FacadeModule["DatabaseMemoryObjectStore"] =
  createLazyFacadeClassValue("DatabaseMemoryObjectStore");

export const DatabaseRetrievalStore: FacadeModule["DatabaseRetrievalStore"] =
  createLazyFacadeClassValue("DatabaseRetrievalStore");

export const DEFAULT_WORKSPACE_PROJECTION_TARGETS: FacadeModule["DEFAULT_WORKSPACE_PROJECTION_TARGETS"] =
  createLazyFacadeArrayValue(() => loadFacadeModule().DEFAULT_WORKSPACE_PROJECTION_TARGETS);

export const ExecutorBackedRetrievalRequestInterpreter: FacadeModule["ExecutorBackedRetrievalRequestInterpreter"] =
  createLazyFacadeClassValue("ExecutorBackedRetrievalRequestInterpreter");

export const ExecutorBackedSemanticCollisionAdjudicator: FacadeModule["ExecutorBackedSemanticCollisionAdjudicator"] =
  createLazyFacadeClassValue("ExecutorBackedSemanticCollisionAdjudicator");

export const ExecutorBackedSemanticInterpreter: FacadeModule["ExecutorBackedSemanticInterpreter"] =
  createLazyFacadeClassValue("ExecutorBackedSemanticInterpreter");

export const JsonModelOutputError: FacadeModule["JsonModelOutputError"] =
  createLazyFacadeClassValue("JsonModelOutputError");

export const MemoryKindSchema: FacadeModule["MemoryKindSchema"] = createLazyFacadeObjectValue(
  () => loadFacadeModule().MemoryKindSchema,
);

export const ModelMemoryCanonicalRepository: FacadeModule["ModelMemoryCanonicalRepository"] =
  createLazyFacadeClassValue("ModelMemoryCanonicalRepository");

export const MmV2DatabaseMemoryObjectStore: FacadeModule["MmV2DatabaseMemoryObjectStore"] =
  createLazyFacadeClassValue("MmV2DatabaseMemoryObjectStore");

export const MmV2NativeRepository: FacadeModule["MmV2NativeRepository"] =
  createLazyFacadeClassValue("MmV2NativeRepository");

export const ModelMemoryOperatorInspection: FacadeModule["ModelMemoryOperatorInspection"] =
  createLazyFacadeClassValue("ModelMemoryOperatorInspection");

export const RuntimeContextRepository: FacadeModule["RuntimeContextRepository"] =
  createLazyFacadeClassValue("RuntimeContextRepository");

export const adaptOrdinaryTurnSource = bindFacadeFunction("adaptOrdinaryTurnSource");
export const applyModelMemoryMigrations = bindFacadeFunction("applyModelMemoryMigrations");
export const assessStructuralSameClaimDelta = bindFacadeFunction("assessStructuralSameClaimDelta");
export const buildCalibrationReport = bindFacadeFunction("buildCalibrationReport");
export const buildCollisionCandidates = bindFacadeFunction("buildCollisionCandidates");
export const buildContextArtifact = bindFacadeFunction("buildContextArtifact");
export const buildDeterministicUuid = bindFacadeFunction("buildDeterministicUuid");
export const buildHarnessProjectionOutputs = bindFacadeFunction("buildHarnessProjectionOutputs");
export const buildLexicalBaselineRetrievalRequest = bindFacadeFunction(
  "buildLexicalBaselineRetrievalRequest",
);
export const buildRetrievalPackArtifact = bindFacadeFunction("buildRetrievalPackArtifact");
export const buildRetrievalRequestPrompt = bindFacadeFunction("buildRetrievalRequestPrompt");
export const buildToolResultProofLiveCapture = bindFacadeFunction(
  "buildToolResultProofLiveCapture",
);
export const buildWorkspaceProjectionVersion = bindFacadeFunction(
  "buildWorkspaceProjectionVersion",
);
export const buildZeroCandidateRecoverySelection = bindFacadeFunction(
  "buildZeroCandidateRecoverySelection",
);
export const calculateSearchTextOverlap = bindFacadeFunction("calculateSearchTextOverlap");
export const captureOrdinaryTurnLive = bindFacadeFunction("captureOrdinaryTurnLive");
export const compileProjection = bindFacadeFunction("compileProjection");
export const createModelMemoryPgPool = bindFacadeFunction("createModelMemoryPgPool");
export const deriveMemoryIdentity = bindFacadeFunction("deriveMemoryIdentity");
export const describeClaimFieldComparison = bindFacadeFunction("describeClaimFieldComparison");
export const describeDecisiveFieldAgreement = bindFacadeFunction("describeDecisiveFieldAgreement");
export const evaluateModelMemoryReadiness = bindFacadeFunction("evaluateModelMemoryReadiness");
export const executeRetrieval = bindFacadeFunction("executeRetrieval");
export const ingestDocumentLive = bindFacadeFunction("ingestDocumentLive");
export const isDeterministicSameSlotSupersession = bindFacadeFunction(
  "isDeterministicSameSlotSupersession",
);
export const listRuntimeMemoryRecords = bindFacadeFunction("listRuntimeMemoryRecords");
export const materializeProjectionArtifacts = bindFacadeFunction("materializeProjectionArtifacts");
export const normalizeIdentityText = bindFacadeFunction("normalizeIdentityText");
export const rankRetrievalCandidates = bindFacadeFunction("rankRetrievalCandidates");
export const rebuildDerivedRuntimeState = bindFacadeFunction("rebuildDerivedRuntimeState");
export const recoverDailyContinuityCandidatesLive = bindFacadeFunction(
  "recoverDailyContinuityCandidatesLive",
);
export const recordProductionHookProbe = bindFacadeFunction("recordProductionHookProbe");
export const resolveModelMemoryStorageEngine = bindFacadeFunction(
  "resolveModelMemoryStorageEngine",
);
export const runLiveDocumentShadow = bindFacadeFunction("runLiveDocumentShadow");
export const runModelMemoryContextEngine = bindFacadeFunction("runModelMemoryContextEngine");
export const selectDeterministicAttachCollisionCandidate = bindFacadeFunction(
  "selectDeterministicAttachCollisionCandidate",
);
export const toBoundedCandidateAdjudicationCandidatesFromRetained = bindFacadeFunction(
  "toBoundedCandidateAdjudicationCandidatesFromRetained",
);
export const toBoundedCandidateAdjudicationCandidatesFromSearch = bindFacadeFunction(
  "toBoundedCandidateAdjudicationCandidatesFromSearch",
);
