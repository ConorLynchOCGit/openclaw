import type {
  AttachRuntimeJobArtifactInput,
  AttachRuntimeJobJsonPayloadArtifactInput,
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobArtifactPayload,
} from "./runtime-job-types.ts";

export const RUNTIME_ARTIFACT_CONTRACT_SCHEMA_VERSION =
  "execution-platform.runtime-artifact-contract.v1" as const;

export type RuntimeArtifactStoragePolicy =
  | "metadata_manifest_only"
  | "payload_required"
  | "payload_parts_required"
  | "debug_metadata_only";

export type RuntimeArtifactDomain =
  | "mission"
  | "packet"
  | "context"
  | "scheduler"
  | "resource"
  | "worker"
  | "validation"
  | "closeout"
  | "work_queue"
  | "diagnostic";

export type RuntimeArtifactRawStoragePolicy = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type RuntimeArtifactContract = {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  storagePolicy: RuntimeArtifactStoragePolicy;
  manifestSchemaRef: string;
  bodySchemaRef: string | null;
  maxManifestBytes: number;
  maxBodyBytes: number;
  hydrateToolId: "artifact.payload.get_json" | "artifact.payload.get_json_parts" | "metadata";
  rawStoragePolicy: RuntimeArtifactRawStoragePolicy;
  legacyHydration:
    | {
        allowed: true;
        bodyKeys: string[];
      }
    | { allowed: false; bodyKeys: [] };
  cleanSuccessEligible: boolean;
};

export type RuntimeArtifactContractAttachInput = Omit<
  AttachRuntimeJobJsonPayloadArtifactInput,
  "metadata"
> & {
  metadata?: Record<string, JsonValue>;
};

export type RuntimeArtifactContractHydrationResult = {
  artifact: RuntimeJobArtifact;
  contract: RuntimeArtifactContract | null;
  status:
    | "payload_hydrated"
    | "legacy_metadata_hydrated"
    | "metadata_manifest_only"
    | "missing_payload"
    | "invalid_contract_storage";
  body: JsonValue | null;
  payload: RuntimeJobArtifactPayload | null;
  reasonCodes: string[];
  legacyHydrated: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const FALSE_RAW_STORAGE_POLICY: RuntimeArtifactRawStoragePolicy = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

const BODY_KEY_HINTS = new Set([
  "body",
  "payloadBody",
  "packetBody",
  "fileWindowBodies",
  "providerResponseBodies",
  "providerDiagnosticBodies",
  "providerResponseShapeDiagnostic",
  "heapPhaseSnapshot",
  "nodeExecutionRunRecord",
  "nodeExecutionSnapshot",
  "nodeAgentWorkerPrompt",
  "nodePromptAuthoringFailureDiagnostic",
  "nodeFinish",
  "nodeAgentSessionTrace",
  "nodeAgentStartReceipt",
  "actionReviewArtifact",
  "workerEditReviewArtifact",
  "reviewDecisionArtifact",
  "boundedDiffPayload",
  "runtimeGraphPatch",
  "schedulerSnapshot",
  "runtimeResult",
  "graphNodes",
  "graphEdges",
  "targetFileSnapshots",
  "fileSnapshots",
  "snapshots",
  "boundedSnapshots",
  "snapshotBodies",
  "boundedContent",
  "lineNumberedContent",
  "splitTasks",
  "taskPackets",
  "missionContractLedger",
  "missionLedgerStabilityDiagnosticRun",
  "missionLedgerStabilityDiagnosticPair",
  "missionLedgerStabilityVerdict",
  "requirementMap",
  "requirementMapBody",
  "fastModelNoContentDiagnostic",
  "architectureResidueInventoryReport",
  "architectureResidueSourceInventory",
  "architectureResidueModelAudit",
  "architectureResidueModelAuditBody",
  "survivorRefs",
  "blockedSurvivorRefs",
  "sourcePromptWindow",
  "sourcePromptWindowBody",
]);

const BODY_ARTIFACT_CONTRACTS: RuntimeArtifactContract[] = [
  payloadContract({
    artifactType: "execution_platform.mission_contract_ledger",
    contractId: "runtime-artifact.mission-contract-ledger.v1",
    domain: "mission",
    bodySchemaRef: "MissionContractLedger",
    legacyBodyKeys: ["missionContractLedger", "ledgerBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.source_prompt_artifact",
    contractId: "runtime-artifact.source-prompt-artifact.v1",
    domain: "mission",
    bodySchemaRef: "SourcePromptArtifact",
    legacyBodyKeys: ["sourcePromptArtifact", "sourcePromptArtifactBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.source_prompt_window",
    contractId: "runtime-artifact.source-prompt-window.v1",
    domain: "mission",
    bodySchemaRef: "SourcePromptWindowArtifact",
    legacyBodyKeys: ["sourcePromptWindow", "sourcePromptWindowBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.requirement_map",
    contractId: "runtime-artifact.requirement-map.v1",
    domain: "mission",
    bodySchemaRef: "RequirementMap",
    legacyBodyKeys: ["requirementMap", "requirementMapBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_execution_run_record",
    contractId: "runtime-artifact.node-execution-run-record.v1",
    domain: "worker",
    bodySchemaRef: "NodeExecutionRunRecord",
    legacyBodyKeys: ["nodeExecutionRunRecord", "runRecord", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_execution_snapshot",
    contractId: "runtime-artifact.node-execution-snapshot.v1",
    domain: "worker",
    bodySchemaRef: "NodeExecutionSnapshot",
    legacyBodyKeys: ["nodeExecutionSnapshot", "snapshotBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_agent_worker_prompt",
    contractId: "runtime-artifact.node-agent-worker-prompt.v1",
    domain: "worker",
    bodySchemaRef: "NodeAgentWorkerPrompt",
    legacyBodyKeys: ["nodeAgentWorkerPrompt", "workerPrompt", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_prompt_authoring_failure_diagnostic",
    contractId: "runtime-artifact.node-prompt-authoring-failure-diagnostic.v1",
    domain: "worker",
    bodySchemaRef: "NodePromptAuthoringFailureDiagnostic",
    legacyBodyKeys: ["nodePromptAuthoringFailureDiagnostic", "diagnostic", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_finish",
    contractId: "runtime-artifact.node-finish.v1",
    domain: "worker",
    bodySchemaRef: "NodeFinish",
    legacyBodyKeys: ["nodeFinish", "finish", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_agent_session_trace",
    contractId: "runtime-artifact.node-agent-session-trace.v1",
    domain: "worker",
    bodySchemaRef: "NodeAgentSessionTrace",
    legacyBodyKeys: ["nodeAgentSessionTrace", "sessionTrace", "trace", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_agent_start_receipt",
    contractId: "runtime-artifact.node-agent-start-receipt.v1",
    domain: "worker",
    bodySchemaRef: "NodeAgentStartReceipt",
    legacyBodyKeys: ["nodeAgentStartReceipt", "startReceipt", "receipt", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.action_review_artifact",
    contractId: "runtime-artifact.action-review-artifact.v1",
    domain: "worker",
    bodySchemaRef: "ActionReviewArtifact",
    legacyBodyKeys: ["actionReviewArtifact", "reviewArtifact", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.worker_edit_review_artifact",
    contractId: "runtime-artifact.worker-edit-review-artifact.v1",
    domain: "worker",
    bodySchemaRef: "WorkerEditReviewArtifact",
    legacyBodyKeys: ["workerEditReviewArtifact", "actionReviewArtifact", "reviewArtifact", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_diagnostic_run",
    contractId: "runtime-artifact.mission-ledger-stability-diagnostic-run.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityDiagnosticRun",
    legacyBodyKeys: ["missionLedgerStabilityDiagnosticRun", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_diagnostic_pair",
    contractId: "runtime-artifact.mission-ledger-stability-diagnostic-pair.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityDiagnosticPair",
    legacyBodyKeys: ["missionLedgerStabilityDiagnosticPair", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.mission_ledger_stability_verdict",
    contractId: "runtime-artifact.mission-ledger-stability-verdict.v1",
    domain: "diagnostic",
    bodySchemaRef: "MissionLedgerStabilityVerdict",
    legacyBodyKeys: ["missionLedgerStabilityVerdict", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.fast_model.no_content_diagnostic",
    contractId: "runtime-artifact.fast-model-no-content-diagnostic.v1",
    domain: "diagnostic",
    bodySchemaRef: "FastModelNoContentDiagnosticSchema",
    legacyBodyKeys: ["fastModelNoContentDiagnostic", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.runtime_graph_patch",
    contractId: "runtime-artifact.runtime-graph-patch.v1",
    domain: "scheduler",
    bodySchemaRef: "RuntimeGraphPatch",
    legacyBodyKeys: ["runtimeGraphPatch", "graphPatch", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.provider_diagnostics.response_shape",
    contractId: "runtime-artifact.provider-diagnostics-response-shape.v1",
    domain: "diagnostic",
    bodySchemaRef: "ProviderResponseShapeDiagnostic",
    legacyBodyKeys: ["providerResponseShapeDiagnostic", "providerDiagnosticBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.proof_environment.heap_phase_snapshot",
    contractId: "runtime-artifact.proof-environment-heap-phase-snapshot.v1",
    domain: "diagnostic",
    bodySchemaRef: "HeapPhaseSnapshot",
    legacyBodyKeys: ["heapPhaseSnapshot", "proofEnvironmentHeapSnapshot", "body"],
  }),
];

const MANIFEST_ONLY_CONTRACTS: RuntimeArtifactContract[] = [
  manifestContract({
    artifactType: "agent_team.scheduler_progress",
    contractId: "runtime-artifact.agent-team-scheduler-progress-manifest.v1",
    domain: "scheduler",
    maxManifestBytes: 64 * 1024,
  }),
  manifestContract({
    artifactType: "execution_platform.scheduler_progress",
    contractId: "runtime-artifact.scheduler-progress-manifest.v1",
    domain: "scheduler",
    maxManifestBytes: 64 * 1024,
  }),
  manifestContract({
    artifactType: "execution_platform.latest_run_state",
    contractId: "runtime-artifact.latest-run-state-manifest.v1",
    domain: "scheduler",
  }),
];

const CONTRACTS = [...BODY_ARTIFACT_CONTRACTS, ...MANIFEST_ONLY_CONTRACTS];
const CONTRACT_BY_TYPE = new Map(CONTRACTS.map((contract) => [contract.artifactType, contract]));

function payloadContract(input: {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  bodySchemaRef: string;
  legacyBodyKeys: string[];
}): RuntimeArtifactContract {
  return {
    artifactType: input.artifactType,
    contractId: input.contractId,
    domain: input.domain,
    storagePolicy: "payload_required",
    manifestSchemaRef: "RuntimeJobArtifactPayloadManifest",
    bodySchemaRef: input.bodySchemaRef,
    maxManifestBytes: 32 * 1024,
    maxBodyBytes: 10 * 1024 * 1024,
    hydrateToolId: "artifact.payload.get_json",
    rawStoragePolicy: FALSE_RAW_STORAGE_POLICY,
    legacyHydration: { allowed: true, bodyKeys: input.legacyBodyKeys },
    cleanSuccessEligible: true,
  };
}

function manifestContract(input: {
  artifactType: string;
  contractId: string;
  domain: RuntimeArtifactDomain;
  maxManifestBytes?: number;
}): RuntimeArtifactContract {
  return {
    artifactType: input.artifactType,
    contractId: input.contractId,
    domain: input.domain,
    storagePolicy: "metadata_manifest_only",
    manifestSchemaRef: "RuntimeArtifactBoundedManifest",
    bodySchemaRef: null,
    maxManifestBytes: input.maxManifestBytes ?? 32 * 1024,
    maxBodyBytes: 0,
    hydrateToolId: "metadata",
    rawStoragePolicy: FALSE_RAW_STORAGE_POLICY,
    legacyHydration: { allowed: false, bodyKeys: [] },
    cleanSuccessEligible: true,
  };
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, JsonValue>;
}

function stringField(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayField(value: JsonValue | undefined, max = 40): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, max);
}

function bounded(value: string | null | undefined, max = 900): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return null;
  }
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}...`;
}

function inferSummaryFromBody(body: JsonValue, contract: RuntimeArtifactContract): string {
  const bodyRecord = record(body);
  const summary =
    stringField(bodyRecord.boundedSummary) ??
    stringField(bodyRecord.handoffSummaryForImplementation) ??
    stringField(bodyRecord.workerObjective) ??
    stringField(bodyRecord.objectiveSummary) ??
    stringField(bodyRecord.currentObjective) ??
    stringField(bodyRecord.taskSummary) ??
    stringField(bodyRecord.reasonSummary);
  if (summary) {
    return bounded(summary, 1_200) ?? contract.artifactType;
  }
  const id =
    stringField(bodyRecord.packetId) ??
    stringField(bodyRecord.nodeId) ??
    stringField(bodyRecord.commitmentId) ??
    stringField(bodyRecord.graphId);
  return bounded(`${contract.artifactType}${id ? ` ${id}` : ""}`, 1_200) ?? contract.artifactType;
}

function inferTargetCommitmentIds(body: JsonValue, metadata: Record<string, JsonValue>): string[] {
  const bodyRecord = record(body);
  return [
    ...stringArrayField(bodyRecord.targetCommitmentIds),
    ...stringArrayField(bodyRecord.commitmentIds),
    ...stringArrayField(metadata.targetCommitmentIds),
    ...(typeof bodyRecord.commitmentId === "string" ? [bodyRecord.commitmentId] : []),
    ...(typeof metadata.commitmentId === "string" ? [metadata.commitmentId] : []),
  ]
    .filter((value, index, array) => value.trim() && array.indexOf(value) === index)
    .slice(0, 40);
}

function inferTargetNodeIds(body: JsonValue, metadata: Record<string, JsonValue>): string[] {
  const bodyRecord = record(body);
  return [
    ...stringArrayField(bodyRecord.targetNodeIds),
    ...stringArrayField(metadata.targetNodeIds),
    ...(typeof bodyRecord.nodeId === "string" ? [bodyRecord.nodeId] : []),
    ...(typeof bodyRecord.sourceNodeId === "string" ? [bodyRecord.sourceNodeId] : []),
    ...(typeof metadata.nodeId === "string" ? [metadata.nodeId] : []),
  ]
    .filter((value, index, array) => value.trim() && array.indexOf(value) === index)
    .slice(0, 40);
}

function bodyContainsRegisteredBodyKey(metadata: JsonValue, path = "metadata"): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  if (Array.isArray(metadata)) {
    for (let index = 0; index < metadata.length; index += 1) {
      const child = bodyContainsRegisteredBodyKey(metadata[index], `${path}[${index}]`);
      if (child) {
        return child;
      }
    }
    return null;
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (BODY_KEY_HINTS.has(key) && value !== null && value !== undefined) {
      if (
        typeof value === "number" &&
        (path.endsWith(".inputCounts") ||
          path.endsWith(".outputCounts") ||
          path.endsWith(".maxBounds"))
      ) {
        continue;
      }
      return `${path}.${key}`;
    }
    const child = bodyContainsRegisteredBodyKey(value, `${path}.${key}`);
    if (child) {
      return child;
    }
  }
  return null;
}

export function listRuntimeArtifactContracts(): RuntimeArtifactContract[] {
  return [...CONTRACTS];
}

export function getRuntimeArtifactContract(artifactType: string): RuntimeArtifactContract | null {
  return CONTRACT_BY_TYPE.get(artifactType) ?? null;
}

export function isRuntimeArtifactPayloadRequired(artifactType: string): boolean {
  const contract = getRuntimeArtifactContract(artifactType);
  return (
    contract?.storagePolicy === "payload_required" ||
    contract?.storagePolicy === "payload_parts_required"
  );
}

export function buildRuntimeArtifactContractPayloadInput(
  input: RuntimeArtifactContractAttachInput,
): AttachRuntimeJobJsonPayloadArtifactInput {
  const contract = getRuntimeArtifactContract(input.artifactType);
  if (!contract) {
    throw new Error(`runtime artifact contract missing for artifactType=${input.artifactType}`);
  }
  if (contract.storagePolicy !== "payload_required") {
    throw new Error(
      `runtime artifact contract storage policy is not payload_required for artifactType=${input.artifactType}`,
    );
  }
  const metadata = input.metadata ?? {};
  const bodyBytes = jsonByteLength(input.body);
  if (bodyBytes > contract.maxBodyBytes) {
    throw new Error(
      `runtime artifact body exceeds contract maxBodyBytes:${bodyBytes}:${contract.maxBodyBytes}; artifactType=${input.artifactType}`,
    );
  }
  return {
    ...input,
    boundedSummary: input.boundedSummary ?? inferSummaryFromBody(input.body, contract),
    targetCommitmentIds:
      input.targetCommitmentIds ?? inferTargetCommitmentIds(input.body, metadata),
    targetNodeIds: input.targetNodeIds ?? inferTargetNodeIds(input.body, metadata),
    resourcePacketKind:
      input.resourcePacketKind ??
      stringField(record(input.body).packetKind) ??
      stringField(record(input.body).artifactKind) ??
      contract.domain,
    readinessStatus:
      input.readinessStatus ??
      stringField(record(input.body).readinessStatus) ??
      stringField(record(input.body).status),
    reasonCodes: input.reasonCodes ?? [
      `runtime_artifact_contract:${contract.contractId}`,
      "runtime_artifact_contract_payload_required",
    ],
    createdBy: input.createdBy ?? "runtime_artifact_contract_registry",
    metadata: {
      ...metadata,
      runtimeArtifactContract: {
        schemaVersion: RUNTIME_ARTIFACT_CONTRACT_SCHEMA_VERSION,
        contractId: contract.contractId,
        artifactType: contract.artifactType,
        domain: contract.domain,
        storagePolicy: contract.storagePolicy,
        bodySchemaRef: contract.bodySchemaRef,
        manifestSchemaRef: contract.manifestSchemaRef,
        hydrateToolId: contract.hydrateToolId,
        cleanSuccessEligible: contract.cleanSuccessEligible,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    },
  };
}

export function assertRuntimeArtifactContractStorage(input: AttachRuntimeJobArtifactInput): void {
  const contract = getRuntimeArtifactContract(input.artifactType);
  if (!contract) {
    return;
  }
  const metadata = input.metadata ?? {};
  const metadataBytes = jsonByteLength(metadata);
  if (metadataBytes > contract.maxManifestBytes) {
    throw new Error(
      `runtime artifact metadata exceeds contract maxManifestBytes:${metadataBytes}:${contract.maxManifestBytes}; artifactType=${input.artifactType}`,
    );
  }
  if (
    contract.storagePolicy === "payload_required" &&
    input.storageKind !== "runtime-artifact-payload"
  ) {
    throw new Error(
      `runtime artifact contract requires payload storage; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
    );
  }
  const bodyPath = bodyContainsRegisteredBodyKey(metadata);
  if (bodyPath) {
    throw new Error(
      `runtime artifact metadata manifest violation at ${bodyPath}; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
    );
  }
  if (contract.storagePolicy === "payload_required") {
    const metadataRecord = record(metadata);
    if (metadataRecord.artifactKind !== "runtime_job_artifact_payload_manifest") {
      throw new Error(
        `runtime artifact contract requires payload manifest metadata; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
      );
    }
  }
}

export function findRuntimeArtifactLegacyBody(
  artifact: RuntimeJobArtifact,
): { body: JsonValue; bodyKey: string } | null {
  const contract = getRuntimeArtifactContract(artifact.artifactType);
  if (!contract?.legacyHydration.allowed) {
    return null;
  }
  const metadata = record(artifact.metadata);
  for (const key of contract.legacyHydration.bodyKeys) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      return { body: metadata[key], bodyKey: key };
    }
  }
  if (
    metadata.artifactKind === artifact.artifactType ||
    metadata.packetKind ||
    metadata.schemaVersion
  ) {
    return { body: artifact.metadata, bodyKey: "metadata" };
  }
  return null;
}
