import { stringArrayValue, stringValue } from "./projection-utils.ts";

export function projectBoundaryReplayReadback(input: {
  checkpointRefs: string[];
  graphCheckpointRefs: string[];
  planRefs: string[];
  latestCheckpointKind: string | null;
  latestBoundaryData: Record<string, unknown>;
  latestBoundaryProgressData: Record<string, unknown>;
  latestBoundaryPlanData: Record<string, unknown>;
  latestRunBoundaryReplay: Record<string, unknown> | null;
}) {
  const {
    checkpointRefs,
    graphCheckpointRefs,
    latestBoundaryData,
    latestBoundaryPlanData,
    latestBoundaryProgressData,
    latestCheckpointKind,
    latestRunBoundaryReplay,
    planRefs,
  } = input;
  return {
    state: checkpointRefs.length > 0 || planRefs.length > 0 ? "present" : "missing",
    latestCheckpointKind,
    currentReplayBoundary:
      stringValue(latestRunBoundaryReplay?.currentReplayBoundary) ?? latestCheckpointKind,
    nextReplayBoundary: stringValue(latestRunBoundaryReplay?.nextReplayBoundary),
    checkpointRefs,
    graphCheckpointRefs,
    planRefs,
    replayStartPolicy:
      stringValue(latestBoundaryData.replayStartPolicy) ??
      stringValue(latestRunBoundaryReplay?.replayStartPolicy),
    replaySafetyStatus:
      stringValue(latestBoundaryData.replaySafetyStatus) ??
      stringValue(latestRunBoundaryReplay?.replaySafetyStatus),
    replayFreshnessStatus:
      stringValue(latestBoundaryData.replayFreshnessStatus) ??
      stringValue(latestRunBoundaryReplay?.replayFreshnessStatus),
    replayContinuationMode:
      stringValue(latestBoundaryData.replayContinuationMode) ??
      stringValue(latestRunBoundaryReplay?.replayContinuationMode),
    exactContinuationAction:
      stringValue(latestBoundaryPlanData.exactContinuationAction) ??
      stringValue(latestRunBoundaryReplay?.exactContinuationAction),
    exactContinuationMode:
      stringValue(latestBoundaryPlanData.exactContinuationMode) ??
      stringValue(latestRunBoundaryReplay?.exactContinuationMode),
    registryVersion:
      stringValue(latestBoundaryPlanData.registryVersion) ??
      stringValue(latestBoundaryData.registryVersion) ??
      stringValue(latestRunBoundaryReplay?.registryVersion),
    diagnosticOnly:
      typeof latestBoundaryPlanData.diagnosticOnly === "boolean"
        ? latestBoundaryPlanData.diagnosticOnly
        : typeof latestBoundaryData.diagnosticOnly === "boolean"
          ? latestBoundaryData.diagnosticOnly
          : typeof latestRunBoundaryReplay?.diagnosticOnly === "boolean"
            ? latestRunBoundaryReplay.diagnosticOnly
            : null,
    allowedNextTransitions: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.allowedNextTransitions, 20),
        ...stringArrayValue(latestRunBoundaryReplay?.allowedNextTransitions, 20),
      ]),
    ].slice(0, 20),
    terminalBlockerClasses: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.terminalBlockerClasses, 20),
        ...stringArrayValue(latestRunBoundaryReplay?.terminalBlockerClasses, 20),
      ]),
    ].slice(0, 20),
    readbackProjectionFields: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.readbackProjectionFields, 30),
        ...stringArrayValue(latestRunBoundaryReplay?.readbackProjectionFields, 30),
      ]),
    ].slice(0, 30),
    latestAcceptedCheckpointRef:
      stringValue(latestBoundaryPlanData.latestAcceptedCheckpointRef) ??
      stringValue(latestRunBoundaryReplay?.latestAcceptedCheckpointRef),
    latestAcceptedCheckpointKind:
      stringValue(latestBoundaryPlanData.latestAcceptedCheckpointKind) ??
      stringValue(latestRunBoundaryReplay?.latestAcceptedCheckpointKind),
    missingCheckpointKinds: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.missingCheckpointKinds, 30),
        ...stringArrayValue(latestRunBoundaryReplay?.missingCheckpointKinds, 30),
      ]),
    ].slice(0, 30),
    skippedUpstreamCheckpointKinds: stringArrayValue(
      latestBoundaryPlanData.skippedUpstreamCheckpointKinds,
      20,
    ),
    resumeFromArtifactRefs: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.resumeFromArtifactRefs, 20),
        ...stringArrayValue(latestRunBoundaryReplay?.resumeFromArtifactRefs, 20),
      ]),
    ].slice(0, 20),
    invalidReasonCodes: [
      ...new Set([
        ...stringArrayValue(latestBoundaryPlanData.invalidReasonCodes, 40),
        ...stringArrayValue(latestRunBoundaryReplay?.invalidReasonCodes, 40),
      ]),
    ].slice(0, 40),
    acceptedCheckpointRefs: stringArrayValue(latestBoundaryPlanData.acceptedCheckpointRefs, 40),
    staleCheckpointRefs: stringArrayValue(latestBoundaryPlanData.staleCheckpointRefs, 40),
    rejectedCheckpointRefs: stringArrayValue(latestBoundaryPlanData.rejectedCheckpointRefs, 40),
    latestSummary:
      stringValue(latestBoundaryData.operatorReadbackSummary) ??
      stringValue(latestBoundaryProgressData.eli5Progress),
    reasonCodes: [
      ...new Set([
        ...stringArrayValue(latestBoundaryData.reasonCodes, 20),
        ...stringArrayValue(latestBoundaryProgressData.reasonCodes, 20),
        ...stringArrayValue(latestBoundaryPlanData.reasonCodes, 20),
        ...stringArrayValue(latestRunBoundaryReplay?.reasonCodes, 20),
      ]),
    ].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export type BoundaryReplayReadback = ReturnType<typeof projectBoundaryReplayReadback>;
