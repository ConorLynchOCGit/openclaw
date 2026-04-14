// Manual facade. Keep loader boundary explicit.
type FacadeModule = typeof import("@openclaw/model-memory/runtime-api.js");
import {
  createLazyFacadeArrayValue,
  createLazyFacadeObjectValue,
  loadBundledPluginPublicSurfaceModuleSync,
} from "./facade-loader.js";

export function loadModelMemoryRuntimeModule(): FacadeModule {
  return loadBundledPluginPublicSurfaceModuleSync<FacadeModule>({
    dirName: "model-memory",
    artifactBasename: "runtime-api.js",
  });
}

export const CanonicalClassSchema: FacadeModule["CanonicalClassSchema"] =
  createLazyFacadeObjectValue(
    () => loadModelMemoryRuntimeModule().CanonicalClassSchema as object,
  ) as FacadeModule["CanonicalClassSchema"];

export const MemoryKindSchema: FacadeModule["MemoryKindSchema"] = createLazyFacadeObjectValue(
  () => loadModelMemoryRuntimeModule().MemoryKindSchema as object,
) as FacadeModule["MemoryKindSchema"];

export const applyModelMemoryMigrations: FacadeModule["applyModelMemoryMigrations"] = ((...args) =>
  loadModelMemoryRuntimeModule().applyModelMemoryMigrations(
    ...args,
  )) as FacadeModule["applyModelMemoryMigrations"];

export const buildContextArtifact: FacadeModule["buildContextArtifact"] = ((...args) =>
  loadModelMemoryRuntimeModule().buildContextArtifact(
    ...args,
  )) as FacadeModule["buildContextArtifact"];

export const buildHarnessProjectionOutputs: FacadeModule["buildHarnessProjectionOutputs"] = ((
  ...args
) =>
  loadModelMemoryRuntimeModule().buildHarnessProjectionOutputs(
    ...args,
  )) as FacadeModule["buildHarnessProjectionOutputs"];

export const buildWorkspaceProjectionVersion: FacadeModule["buildWorkspaceProjectionVersion"] = ((
  ...args
) =>
  loadModelMemoryRuntimeModule().buildWorkspaceProjectionVersion(
    ...args,
  )) as FacadeModule["buildWorkspaceProjectionVersion"];

export const createModelMemoryPgPool: FacadeModule["createModelMemoryPgPool"] = ((...args) =>
  loadModelMemoryRuntimeModule().createModelMemoryPgPool(
    ...args,
  )) as FacadeModule["createModelMemoryPgPool"];

export const DEFAULT_WORKSPACE_PROJECTION_TARGETS: FacadeModule["DEFAULT_WORKSPACE_PROJECTION_TARGETS"] =
  createLazyFacadeArrayValue(
    () => loadModelMemoryRuntimeModule().DEFAULT_WORKSPACE_PROJECTION_TARGETS,
  );

export const ingestDocumentLive: FacadeModule["ingestDocumentLive"] = ((...args) =>
  loadModelMemoryRuntimeModule().ingestDocumentLive(...args)) as FacadeModule["ingestDocumentLive"];

export const runModelMemoryContextEngine: FacadeModule["runModelMemoryContextEngine"] = ((
  ...args
) =>
  loadModelMemoryRuntimeModule().runModelMemoryContextEngine(
    ...args,
  )) as FacadeModule["runModelMemoryContextEngine"];

export function createDatabaseMemoryObjectStore(
  ...args: ConstructorParameters<FacadeModule["DatabaseMemoryObjectStore"]>
): InstanceType<FacadeModule["DatabaseMemoryObjectStore"]> {
  const RuntimeClass = loadModelMemoryRuntimeModule().DatabaseMemoryObjectStore;
  return new RuntimeClass(...args);
}

export function createDatabaseRetrievalStore(
  ...args: ConstructorParameters<FacadeModule["DatabaseRetrievalStore"]>
): InstanceType<FacadeModule["DatabaseRetrievalStore"]> {
  const RuntimeClass = loadModelMemoryRuntimeModule().DatabaseRetrievalStore;
  return new RuntimeClass(...args);
}

export function createExecutorBackedSemanticInterpreter(
  ...args: ConstructorParameters<FacadeModule["ExecutorBackedSemanticInterpreter"]>
): InstanceType<FacadeModule["ExecutorBackedSemanticInterpreter"]> {
  const RuntimeClass = loadModelMemoryRuntimeModule().ExecutorBackedSemanticInterpreter;
  return new RuntimeClass(...args);
}

export function createModelMemoryCanonicalRepository(
  ...args: ConstructorParameters<FacadeModule["ModelMemoryCanonicalRepository"]>
): InstanceType<FacadeModule["ModelMemoryCanonicalRepository"]> {
  const RuntimeClass = loadModelMemoryRuntimeModule().ModelMemoryCanonicalRepository;
  return new RuntimeClass(...args);
}

export function createRuntimeContextRepository(
  ...args: ConstructorParameters<FacadeModule["RuntimeContextRepository"]>
): InstanceType<FacadeModule["RuntimeContextRepository"]> {
  const RuntimeClass = loadModelMemoryRuntimeModule().RuntimeContextRepository;
  return new RuntimeClass(...args);
}

export type ContextArtifactRecord =
  import("@openclaw/model-memory/runtime-api.js").ContextArtifactRecord;
export type DatabaseMemoryObjectStore =
  import("@openclaw/model-memory/runtime-api.js").DatabaseMemoryObjectStore;
export type DatabaseRetrievalStore =
  import("@openclaw/model-memory/runtime-api.js").DatabaseRetrievalStore;
export type JsonModelExecutionRequest =
  import("@openclaw/model-memory/runtime-api.js").JsonModelExecutionRequest;
export type JsonModelExecutionResponse =
  import("@openclaw/model-memory/runtime-api.js").JsonModelExecutionResponse;
export type JsonModelExecutor = import("@openclaw/model-memory/runtime-api.js").JsonModelExecutor;
export type ModelMemoryCanonicalRepository =
  import("@openclaw/model-memory/runtime-api.js").ModelMemoryCanonicalRepository;
export type ModelMemoryContextEngineResult = ReturnType<
  typeof import("@openclaw/model-memory/runtime-api.js").runModelMemoryContextEngine
>;
export type ModelMemoryObject = import("@openclaw/model-memory/runtime-api.js").ModelMemoryObject;
export type ModelMemoryObjectRecord =
  import("@openclaw/model-memory/runtime-api.js").ModelMemoryObjectRecord;
export type ModelMemoryPgPool = import("@openclaw/model-memory/runtime-api.js").ModelMemoryPgPool;
export type ModelMemoryPgPoolConfig =
  import("@openclaw/model-memory/runtime-api.js").ModelMemoryPgPoolConfig;
export type ModelMemorySourceKind =
  import("@openclaw/model-memory/runtime-api.js").ModelMemorySourceKind;
export type RuntimeRebuildResult =
  import("@openclaw/model-memory/runtime-api.js").RuntimeRebuildResult;
export type RuntimeContextRepository =
  import("@openclaw/model-memory/runtime-api.js").RuntimeContextRepository;
export type SemanticInterpreter =
  import("@openclaw/model-memory/runtime-api.js").SemanticInterpreter;
export type SemanticInterpreterInput =
  import("@openclaw/model-memory/runtime-api.js").SemanticInterpreterInput;
export type SemanticInterpreterResult =
  import("@openclaw/model-memory/runtime-api.js").SemanticInterpreterResult;
export type SessionContextStateRecord =
  import("@openclaw/model-memory/runtime-api.js").SessionContextStateRecord;
export type SqlClient = import("@openclaw/model-memory/runtime-api.js").SqlClient;
export type WorkspaceProjectionTargetRecord =
  import("@openclaw/model-memory/runtime-api.js").WorkspaceProjectionTargetRecord;
export type WorkspaceProjectionVersionRecord =
  import("@openclaw/model-memory/runtime-api.js").WorkspaceProjectionVersionRecord;
