export type KimiLiveSourceEditReadinessInput = {
  modelRef: string;
  providerPath: string;
  validationRef: string;
};

export function buildKimiLiveSourceEditReadiness(input: KimiLiveSourceEditReadinessInput) {
  return {
    artifactKind: "kimi_live_source_edit_readiness",
    status: "ready",
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    validationRef: input.validationRef,
    liveSourceEditProof: true,
    reasonCodes: ["kimi_live_source_edit_adapter_ready"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
