// Manual facade. Keep loader boundary explicit and host-facing.
type FacadeModule = typeof import("@openclaw/model-memory/runtime-api.js");
type LegacyFacadeModule = typeof import("@openclaw/model-memory/legacy-admin-api.js");
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

function loadLegacyFacadeModule(): LegacyFacadeModule {
  return loadBundledPluginPublicSurfaceModuleSync<LegacyFacadeModule>({
    dirName: "model-memory",
    artifactBasename: "legacy-admin-api.js",
  });
}

function bindFacadeFunction<K extends keyof FacadeModule>(key: K): FacadeModule[K] {
  return ((...args: unknown[]) =>
    (loadFacadeModule()[key] as (...args: unknown[]) => unknown)(...args)) as FacadeModule[K];
}

function bindLegacyFacadeFunction<K extends keyof LegacyFacadeModule>(
  key: K,
): LegacyFacadeModule[K] {
  return ((...args: unknown[]) =>
    (loadLegacyFacadeModule()[key] as (...args: unknown[]) => unknown)(
      ...args,
    )) as LegacyFacadeModule[K];
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

function createLazyLegacyFacadeClassValue<K extends keyof LegacyFacadeModule>(
  key: K,
): LegacyFacadeModule[K] {
  const target = function legacyFacadeClassProxy() {} as unknown as object;
  return new Proxy(target, {
    apply(_target, thisArg, args) {
      return Reflect.apply(loadLegacyFacadeModule()[key] as CallableFunction, thisArg, args);
    },
    construct(_target, args, newTarget) {
      return Reflect.construct(
        loadLegacyFacadeModule()[key] as new (...args: unknown[]) => object,
        args,
        newTarget as new (...args: unknown[]) => object,
      );
    },
    get(_target, property, receiver) {
      return Reflect.get(loadLegacyFacadeModule()[key] as object, property, receiver);
    },
  }) as LegacyFacadeModule[K];
}

export type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  ContextArtifactRecord,
  InterpretedRetrievalRequest,
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  LiveMemoryPersistenceResult,
  MemoryIngestionFailureClass,
  ModelMemoryStorageEngine,
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
  ProjectionMaterializationResult,
  ProductionHookProbeRecord,
  RetrievalEnvelope,
  RetrievalResultItemRecord,
  RuntimeCompatibleMemoryRecord,
  RuntimeMemoryRecord,
  RuntimeRebuildResult,
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
  SessionContextStateRecord,
  SqlClient,
  ToolResultProofCaptureBuildResult,
  ToolResultProofCaptureInput,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "@openclaw/model-memory/runtime-api.js";

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

export const CanonicalClassSchema: FacadeModule["CanonicalClassSchema"] =
  createLazyFacadeObjectValue(() => loadFacadeModule().CanonicalClassSchema);

export const DatabaseMemoryObjectStore: LegacyFacadeModule["DatabaseMemoryObjectStore"] =
  createLazyLegacyFacadeClassValue("DatabaseMemoryObjectStore");

export const DatabaseRetrievalStore: FacadeModule["DatabaseRetrievalStore"] =
  createLazyFacadeClassValue("DatabaseRetrievalStore");

export const DEFAULT_WORKSPACE_PROJECTION_TARGETS: FacadeModule["DEFAULT_WORKSPACE_PROJECTION_TARGETS"] =
  createLazyFacadeArrayValue(() => loadFacadeModule().DEFAULT_WORKSPACE_PROJECTION_TARGETS);

export const ExecutorBackedRetrievalRequestInterpreter: FacadeModule["ExecutorBackedRetrievalRequestInterpreter"] =
  createLazyFacadeClassValue("ExecutorBackedRetrievalRequestInterpreter");

export const ExecutorBackedSemanticCollisionAdjudicator: LegacyFacadeModule["ExecutorBackedSemanticCollisionAdjudicator"] =
  createLazyLegacyFacadeClassValue("ExecutorBackedSemanticCollisionAdjudicator");

export const ExecutorBackedSemanticInterpreter: FacadeModule["ExecutorBackedSemanticInterpreter"] =
  createLazyFacadeClassValue("ExecutorBackedSemanticInterpreter");

export const JsonModelOutputError: FacadeModule["JsonModelOutputError"] =
  createLazyFacadeClassValue("JsonModelOutputError");

export const MemoryKindSchema: FacadeModule["MemoryKindSchema"] = createLazyFacadeObjectValue(
  () => loadFacadeModule().MemoryKindSchema,
);

export const ModelMemoryCanonicalRepository: FacadeModule["ModelMemoryCanonicalRepository"] =
  createLazyFacadeClassValue("ModelMemoryCanonicalRepository");

export const MmV2DatabaseMemoryObjectStore: LegacyFacadeModule["MmV2DatabaseMemoryObjectStore"] =
  createLazyLegacyFacadeClassValue("MmV2DatabaseMemoryObjectStore");

export const MmV2NativeRepository: FacadeModule["MmV2NativeRepository"] =
  createLazyFacadeClassValue("MmV2NativeRepository");

export const ModelMemoryOperatorInspection: FacadeModule["ModelMemoryOperatorInspection"] =
  createLazyFacadeClassValue("ModelMemoryOperatorInspection");

export const RuntimeContextRepository: FacadeModule["RuntimeContextRepository"] =
  createLazyFacadeClassValue("RuntimeContextRepository");

export const adaptOrdinaryTurnSource = bindFacadeFunction("adaptOrdinaryTurnSource");
export const applyModelMemoryMigrations = bindFacadeFunction("applyModelMemoryMigrations");
export const assessStructuralSameClaimDelta = bindLegacyFacadeFunction(
  "assessStructuralSameClaimDelta",
);
export const buildCalibrationReport = bindFacadeFunction("buildCalibrationReport");
export const buildCollisionCandidates = bindLegacyFacadeFunction("buildCollisionCandidates");
export const buildContextArtifact = bindFacadeFunction("buildContextArtifact");
export const buildDeterministicUuid = bindFacadeFunction("buildDeterministicUuid");
export const buildHarnessProjectionOutputs = bindFacadeFunction("buildHarnessProjectionOutputs");
export const buildLexicalBaselineRetrievalRequest = bindFacadeFunction(
  "buildLexicalBaselineRetrievalRequest",
);
export const buildOrdinaryTurnMemoryTraceId = bindFacadeFunction("buildOrdinaryTurnMemoryTraceId");
export const buildRetrievalPackArtifact = bindFacadeFunction("buildRetrievalPackArtifact");
export const buildRetrievalRequestPrompt = bindFacadeFunction("buildRetrievalRequestPrompt");
export const buildToolResultMemoryTraceId = bindFacadeFunction("buildToolResultMemoryTraceId");
export const buildToolResultProofLiveCapture = bindFacadeFunction(
  "buildToolResultProofLiveCapture",
);
export const buildWorkspaceProjectionVersion = bindFacadeFunction(
  "buildWorkspaceProjectionVersion",
);
export const buildZeroCandidateRecoverySelection = bindLegacyFacadeFunction(
  "buildZeroCandidateRecoverySelection",
);
export const calculateSearchTextOverlap = bindLegacyFacadeFunction("calculateSearchTextOverlap");
export const captureOrdinaryTurnLive = bindFacadeFunction("captureOrdinaryTurnLive");
export const classifyMemoryIngestionFailure = bindFacadeFunction("classifyMemoryIngestionFailure");
export const compileProjection = bindFacadeFunction("compileProjection");
export const createModelMemoryPgPool = bindFacadeFunction("createModelMemoryPgPool");
export const createMemoryIngestionTelemetryEvent = bindFacadeFunction(
  "createMemoryIngestionTelemetryEvent",
);
export const deriveMemoryIdentity = bindLegacyFacadeFunction("deriveMemoryIdentity");
export const describeClaimFieldComparison = bindLegacyFacadeFunction(
  "describeClaimFieldComparison",
);
export const describeDecisiveFieldAgreement = bindLegacyFacadeFunction(
  "describeDecisiveFieldAgreement",
);
export const emitMemoryIngestionCloseoutIfConfigured = bindFacadeFunction(
  "emitMemoryIngestionCloseoutIfConfigured",
);
export const evaluateModelMemoryReadiness = bindFacadeFunction("evaluateModelMemoryReadiness");
export const executeRetrieval = bindFacadeFunction("executeRetrieval");
export const ingestDocumentLive = bindFacadeFunction("ingestDocumentLive");
export const isDeterministicSameSlotSupersession = bindLegacyFacadeFunction(
  "isDeterministicSameSlotSupersession",
);
export const listRuntimeMemoryRecords = bindFacadeFunction("listRuntimeMemoryRecords");
export const materializeProjectionArtifacts = bindFacadeFunction("materializeProjectionArtifacts");
export const normalizeIdentityText = bindLegacyFacadeFunction("normalizeIdentityText");
export const rankRetrievalCandidates = bindFacadeFunction("rankRetrievalCandidates");
export const readMemoryTraceIdFromScope = bindFacadeFunction("readMemoryTraceIdFromScope");
export const rebuildDerivedRuntimeState = bindFacadeFunction("rebuildDerivedRuntimeState");
export const sanitizeMemoryTraceId = bindFacadeFunction("sanitizeMemoryTraceId");
export const recoverDailyContinuityCandidatesLive = bindFacadeFunction(
  "recoverDailyContinuityCandidatesLive",
);
export const recordProductionHookProbe = bindFacadeFunction("recordProductionHookProbe");
export const resolveModelMemoryStorageEngine = bindFacadeFunction(
  "resolveModelMemoryStorageEngine",
);
export const runLiveDocumentShadow = bindLegacyFacadeFunction("runLiveDocumentShadow");
export const runModelMemoryContextEngine = bindFacadeFunction("runModelMemoryContextEngine");
export const selectDeterministicAttachCollisionCandidate = bindLegacyFacadeFunction(
  "selectDeterministicAttachCollisionCandidate",
);
export const toBoundedCandidateAdjudicationCandidatesFromRetained = bindLegacyFacadeFunction(
  "toBoundedCandidateAdjudicationCandidatesFromRetained",
);
export const toBoundedCandidateAdjudicationCandidatesFromSearch = bindLegacyFacadeFunction(
  "toBoundedCandidateAdjudicationCandidatesFromSearch",
);
