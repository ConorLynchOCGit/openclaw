export type KimiLiveSourceEditReadinessInput = {
  modelRef: string;
  providerPath: string;
  validationRef: string;
  workerLoopTraceRef?: string;
  workerLoopV2TraceRefs?: string[];
  toolUsingWorkerTraceRefs?: string[];
  toolUsingWorkerTraceRefs46003efd?: string[];
  toolUsingWorkerTraceRefs5db60a57?: string[];
  toolUsingWorkerTraceRefs020714a8?: string[];
  toolUsingWorkerTraceRefs5d1e652c?: string[];
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
    toolUsingWorkerTraceRefs5db60a57: input.toolUsingWorkerTraceRefs5db60a57 ?? [],
    toolUsingWorkerTraceRefs020714a8: input.toolUsingWorkerTraceRefs020714a8 ?? [],
    toolUsingWorkerTraceRefs5d1e652c: input.toolUsingWorkerTraceRefs5d1e652c ?? [],
    liveSourceEditProof: true,
    reasonCodes: ["kimi_live_source_edit_adapter_ready"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
