function isCompatibilityOverlayImportAllowed(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.VITEST_WORKER_ID) ||
    /^(?:1|true|yes|on)$/iu.test(
      process.env.OPENCLAW_MODEL_MEMORY_COMPAT_RETRIEVAL_CONTEXT_ENABLED ?? "",
    )
  );
}

if (!isCompatibilityOverlayImportAllowed()) {
  throw new Error("model_memory_retrieval_context_compatibility_overlay_disabled_in_production");
}

export {
  assembleRouteAwareBootstrapContextPack,
  buildLiveRetrievalEnvelope,
  buildProjectionBootstrapContextFiles,
  resolveModelMemoryBootstrapOverlay,
  shouldAttemptLiveRetrievalContext,
  type LiveRetrievalContextInput,
  type ModelMemoryBootstrapOverlay,
} from "./route-aware-context-pack.js";
