// Manual facade. Keep loader boundary explicit and host-facing.
type FacadeModule = typeof import("@openclaw/model-memory/runtime-api.js");
import {
  bindFacadeFunction,
  createLazyFacadeClassValue,
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

export const CanonicalClassSchema: FacadeModule["CanonicalClassSchema"] =
  createLazyFacadeObjectValue(() => loadFacadeModule().CanonicalClassSchema);

export const DatabaseRetrievalStore: FacadeModule["DatabaseRetrievalStore"] =
  createLazyFacadeClassValue(loadFacadeModule, "DatabaseRetrievalStore");

export const DEFAULT_WORKSPACE_PROJECTION_TARGETS: FacadeModule["DEFAULT_WORKSPACE_PROJECTION_TARGETS"] =
  createLazyFacadeArrayValue(() => loadFacadeModule().DEFAULT_WORKSPACE_PROJECTION_TARGETS);

export const ExecutorBackedRetrievalRequestInterpreter: FacadeModule["ExecutorBackedRetrievalRequestInterpreter"] =
  createLazyFacadeClassValue(loadFacadeModule, "ExecutorBackedRetrievalRequestInterpreter");

export const ExecutorBackedRetrievalFinalInclusionReviewer: FacadeModule["ExecutorBackedRetrievalFinalInclusionReviewer"] =
  createLazyFacadeClassValue(loadFacadeModule, "ExecutorBackedRetrievalFinalInclusionReviewer");

export const ExecutorBackedSemanticInterpreter: FacadeModule["ExecutorBackedSemanticInterpreter"] =
  createLazyFacadeClassValue(loadFacadeModule, "ExecutorBackedSemanticInterpreter");

export const JsonModelOutputError: FacadeModule["JsonModelOutputError"] =
  createLazyFacadeClassValue(loadFacadeModule, "JsonModelOutputError");

export const MemoryKindSchema: FacadeModule["MemoryKindSchema"] = createLazyFacadeObjectValue(
  () => loadFacadeModule().MemoryKindSchema,
);

export const ModelMemoryCanonicalRepository: FacadeModule["ModelMemoryCanonicalRepository"] =
  createLazyFacadeClassValue(loadFacadeModule, "ModelMemoryCanonicalRepository");

export const MmV2NativeRepository: FacadeModule["MmV2NativeRepository"] =
  createLazyFacadeClassValue(loadFacadeModule, "MmV2NativeRepository");

export const ModelMemoryOperatorInspection: FacadeModule["ModelMemoryOperatorInspection"] =
  createLazyFacadeClassValue(loadFacadeModule, "ModelMemoryOperatorInspection");

export const RuntimeContextRepository: FacadeModule["RuntimeContextRepository"] =
  createLazyFacadeClassValue(loadFacadeModule, "RuntimeContextRepository");

export const adaptOrdinaryTurnSource = bindFacadeFunction(
  loadFacadeModule,
  "adaptOrdinaryTurnSource",
);
export const applyModelMemoryMigrations = bindFacadeFunction(
  loadFacadeModule,
  "applyModelMemoryMigrations",
);
export const buildCalibrationReport = bindFacadeFunction(
  loadFacadeModule,
  "buildCalibrationReport",
);
export const buildContextArtifact = bindFacadeFunction(loadFacadeModule, "buildContextArtifact");
export const buildDeterministicUuid = bindFacadeFunction(
  loadFacadeModule,
  "buildDeterministicUuid",
);
export const buildHarnessProjectionOutputs = bindFacadeFunction(
  loadFacadeModule,
  "buildHarnessProjectionOutputs",
);
export const buildLexicalBaselineRetrievalRequest = bindFacadeFunction(
  loadFacadeModule,
  "buildLexicalBaselineRetrievalRequest",
);
export const buildOrdinaryTurnMemoryTraceId = bindFacadeFunction(
  loadFacadeModule,
  "buildOrdinaryTurnMemoryTraceId",
);
export const buildRetrievalPackArtifact = bindFacadeFunction(
  loadFacadeModule,
  "buildRetrievalPackArtifact",
);
export const buildRetrievalRequestPrompt = bindFacadeFunction(
  loadFacadeModule,
  "buildRetrievalRequestPrompt",
);
export const buildToolResultMemoryTraceId = bindFacadeFunction(
  loadFacadeModule,
  "buildToolResultMemoryTraceId",
);
export const buildToolResultProofLiveCapture = bindFacadeFunction(
  loadFacadeModule,
  "buildToolResultProofLiveCapture",
);
export const buildWorkspaceProjectionVersion = bindFacadeFunction(
  loadFacadeModule,
  "buildWorkspaceProjectionVersion",
);
export const captureOrdinaryTurnLive = bindFacadeFunction(
  loadFacadeModule,
  "captureOrdinaryTurnLive",
);
export const classifyLiveTurnSourceAuthority = bindFacadeFunction(
  loadFacadeModule,
  "classifyLiveTurnSourceAuthority",
);
export const classifyMemoryIngestionFailure = bindFacadeFunction(
  loadFacadeModule,
  "classifyMemoryIngestionFailure",
);
export const compileProjection = bindFacadeFunction(loadFacadeModule, "compileProjection");
export const createModelMemoryPgPool = bindFacadeFunction(
  loadFacadeModule,
  "createModelMemoryPgPool",
);
export const createMemoryIngestionTelemetryEvent = bindFacadeFunction(
  loadFacadeModule,
  "createMemoryIngestionTelemetryEvent",
);
export const emitMemoryIngestionCloseoutIfConfigured = bindFacadeFunction(
  loadFacadeModule,
  "emitMemoryIngestionCloseoutIfConfigured",
);
export const evaluateModelMemoryReadiness = bindFacadeFunction(
  loadFacadeModule,
  "evaluateModelMemoryReadiness",
);
export const executeRetrieval = bindFacadeFunction(loadFacadeModule, "executeRetrieval");
export const ingestDocumentLive = bindFacadeFunction(loadFacadeModule, "ingestDocumentLive");
export const listRuntimeMemoryRecords = bindFacadeFunction(
  loadFacadeModule,
  "listRuntimeMemoryRecords",
);
export const materializeProjectionArtifacts = bindFacadeFunction(
  loadFacadeModule,
  "materializeProjectionArtifacts",
);
export const rankRetrievalCandidates = bindFacadeFunction(
  loadFacadeModule,
  "rankRetrievalCandidates",
);
export const readMemoryTraceIdFromScope = bindFacadeFunction(
  loadFacadeModule,
  "readMemoryTraceIdFromScope",
);
export const rebuildDerivedRuntimeState = bindFacadeFunction(
  loadFacadeModule,
  "rebuildDerivedRuntimeState",
);
export const sanitizeMemoryTraceId = bindFacadeFunction(loadFacadeModule, "sanitizeMemoryTraceId");
export const recoverDailyContinuityCandidatesLive = bindFacadeFunction(
  loadFacadeModule,
  "recoverDailyContinuityCandidatesLive",
);
export const recordProductionHookProbe = bindFacadeFunction(
  loadFacadeModule,
  "recordProductionHookProbe",
);
export const resolveModelMemoryStorageEngine = bindFacadeFunction(
  loadFacadeModule,
  "resolveModelMemoryStorageEngine",
);
export const runModelMemoryContextEngine = bindFacadeFunction(
  loadFacadeModule,
  "runModelMemoryContextEngine",
);
