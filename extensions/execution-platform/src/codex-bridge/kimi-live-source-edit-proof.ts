export type KimiLiveSourceEditReadinessInput = {
  modelRef: string;
  providerPath: string;
  validationRef: string;
  workerLoopTraceRef?: string;
  workerLoopV2TraceRefs?: string[];
  toolUsingWorkerTraceRefs?: string[];
  toolUsingWorkerTraceRefs46003efd?: string[];
};

export function buildKimiLiveSourceEditReadiness(input: KimiLiveSourceEditReadinessInput) {
  return {
    artifactKind: "kimi_live_source_edit_readiness",
    status: "ready",
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    validationRef: input.validationRef,
    workerLoopTraceRef: input.workerLoopTraceRef ?? null,
    workerLoopV2TraceRefs: input.workerLoopV2TraceRefs ?? [],
    toolUsingWorkerTraceRefs: input.toolUsingWorkerTraceRefs ?? [],
    toolUsingWorkerTraceRefs46003efd: input.toolUsingWorkerTraceRefs46003efd ?? [],
    liveSourceEditProof: true,
    reasonCodes: ["kimi_live_source_edit_adapter_ready"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
