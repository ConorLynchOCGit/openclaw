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
  "commitmentWorkPacket",
  "commitmentWorkPackets",
  "contextScoutExecutionPacket",
  "contextHandoffPacket",
  "contextBrokerRequest",
  "implementationContextPacket",
  "implementationTaskPacket",
  "codingResourcePacket",
  "nodeExecutionPacket",
  "nodeReadinessState",
  "runtimeGraphPatch",
  "schedulerSnapshot",
  "runtimeResult",
  "graphNodes",
  "graphEdges",
  "targetFileSnapshots",
  "fileSnapshots",
  "splitTasks",
  "taskPackets",
  "missionLedgerStabilityDiagnosticRun",
  "missionLedgerStabilityDiagnosticPair",
  "missionLedgerStabilityVerdict",
  "stagedMissionLedgerObjectiveConstraints",
  "stagedMissionLedgerObligationCandidateSet",
  "stagedMissionLedgerCompiledCandidateSet",
  "stagedMissionLedgerReviewPlan",
  "stagedMissionLedgerCanonicalCommitments",
  "stagedMissionLedgerAcceptance",
  "packetSemanticBrief",
  "packetFieldCompletion",
  "commitmentPacketFanoutDiagnostics",
  "fastModelNoContentDiagnostic",
  "failedPacketReplayResult",
]);

const BODY_ARTIFACT_CONTRACTS: RuntimeArtifactContract[] = [
  payloadContract({
    artifactType: "execution_platform.commitment_work_packet",
    contractId: "runtime-artifact.commitment-work-packet.v1",
    domain: "packet",
    bodySchemaRef: "CommitmentWorkPacketSchema",
    legacyBodyKeys: ["commitmentWorkPacket"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_work_packet.pre_review",
    contractId: "runtime-artifact.commitment-work-packet-pre-review.v1",
    domain: "packet",
    bodySchemaRef: "CommitmentWorkPacketSchema",
    legacyBodyKeys: ["commitmentWorkPacket"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_work_packet.post_review",
    contractId: "runtime-artifact.commitment-work-packet-post-review.v1",
    domain: "packet",
    bodySchemaRef: "CommitmentWorkPacketSchema",
    legacyBodyKeys: ["commitmentWorkPacket"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_work_packet.post_repair",
    contractId: "runtime-artifact.commitment-work-packet-post-repair.v1",
    domain: "packet",
    bodySchemaRef: "CommitmentWorkPacketSchema",
    legacyBodyKeys: ["commitmentWorkPacket"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_work_packet.replay",
    contractId: "runtime-artifact.commitment-work-packet-replay.v1",
    domain: "packet",
    bodySchemaRef: "CommitmentWorkPacketSchema",
    legacyBodyKeys: ["commitmentWorkPacket"],
  }),
  payloadContract({
    artifactType: "execution_platform.context_scout_execution_packet",
    contractId: "runtime-artifact.context-scout-execution-packet.v1",
    domain: "context",
    bodySchemaRef: "ContextScoutExecutionPacket",
    legacyBodyKeys: ["contextScoutExecutionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.context_handoff_packet",
    contractId: "runtime-artifact.context-handoff-packet.v1",
    domain: "context",
    bodySchemaRef: "ContextHandoffPacketSchema",
    legacyBodyKeys: ["contextHandoffPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.context_broker.request",
    contractId: "runtime-artifact.context-broker-request.v1",
    domain: "context",
    bodySchemaRef: "ContextBrokerRequestSchema",
    legacyBodyKeys: ["contextBrokerRequest", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_context_packet",
    contractId: "runtime-artifact.implementation-context-packet.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationContextPacket",
    legacyBodyKeys: ["implementationContextPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_resource_materialization_result",
    contractId: "runtime-artifact.implementation-resource-materialization-result.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationResourceMaterializationResult",
    legacyBodyKeys: [
      "implementationResourceMaterializationResult",
      "resourceMaterialization",
      "body",
    ],
  }),
  payloadContract({
    artifactType: "execution_platform.implementation_task_packet",
    contractId: "runtime-artifact.implementation-task-packet.v1",
    domain: "resource",
    bodySchemaRef: "ImplementationTaskPacketSchema",
    legacyBodyKeys: ["implementationTaskPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.coding_resource_packet",
    contractId: "runtime-artifact.coding-resource-packet.v1",
    domain: "resource",
    bodySchemaRef: "CodingResourcePacket",
    legacyBodyKeys: ["codingResourcePacket", "resourcePacket", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_execution_packet",
    contractId: "runtime-artifact.node-execution-packet.v1",
    domain: "worker",
    bodySchemaRef: "NodeExecutionPacket",
    legacyBodyKeys: ["nodeExecutionPacket", "packetBody", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.node_readiness_state",
    contractId: "runtime-artifact.node-readiness-state.v1",
    domain: "worker",
    bodySchemaRef: "NodeReadinessState",
    legacyBodyKeys: ["nodeReadinessState", "readinessState", "body"],
  }),
  payloadContract({
    artifactType: "execution.generic_orchestration_runtime_result",
    contractId: "runtime-artifact.generic-orchestration-runtime-result.v1",
    domain: "scheduler",
    bodySchemaRef: "GenericOrchestrationRuntimeResult",
    legacyBodyKeys: ["runtimeResult", "schedulerSnapshot", "body"],
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
    artifactType: "execution_platform.staged_mission_ledger.objective_constraints",
    contractId: "runtime-artifact.staged-mission-ledger-objective-constraints.v1",
    domain: "mission",
    bodySchemaRef: "StagedObjectiveConstraintsSchema",
    legacyBodyKeys: ["stagedMissionLedgerObjectiveConstraints", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.obligation_candidate_set",
    contractId: "runtime-artifact.staged-mission-ledger-obligation-candidate-set.v1",
    domain: "mission",
    bodySchemaRef: "ObligationCandidateSetSchema",
    legacyBodyKeys: ["stagedMissionLedgerObligationCandidateSet", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.compiled_candidate_set",
    contractId: "runtime-artifact.staged-mission-ledger-compiled-candidate-set.v1",
    domain: "mission",
    bodySchemaRef: "CompiledObligationCandidateSetSchema",
    legacyBodyKeys: ["stagedMissionLedgerCompiledCandidateSet", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.review_plan",
    contractId: "runtime-artifact.staged-mission-ledger-review-plan.v1",
    domain: "mission",
    bodySchemaRef: "ObligationReviewPlanSchema",
    legacyBodyKeys: ["stagedMissionLedgerReviewPlan", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.canonical_commitments",
    contractId: "runtime-artifact.staged-mission-ledger-canonical-commitments.v1",
    domain: "mission",
    bodySchemaRef: "CanonicalMissionCommitmentsSchema",
    legacyBodyKeys: ["stagedMissionLedgerCanonicalCommitments", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.acceptance",
    contractId: "runtime-artifact.staged-mission-ledger-acceptance.v1",
    domain: "mission",
    bodySchemaRef: "StagedMissionLedgerAcceptanceSchema",
    legacyBodyKeys: ["stagedMissionLedgerAcceptance", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.staged_mission_ledger.stage_repair_diagnostic",
    contractId: "runtime-artifact.staged-mission-ledger-stage-repair-diagnostic.v1",
    domain: "mission",
    bodySchemaRef: "StagedMissionLedgerStageRepairDiagnosticSchema",
    legacyBodyKeys: ["stagedMissionLedgerStageRepairDiagnostic", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_packet.semantic_brief",
    contractId: "runtime-artifact.commitment-packet-semantic-brief.v1",
    domain: "packet",
    bodySchemaRef: "PacketSemanticBriefSchema",
    legacyBodyKeys: ["packetSemanticBrief", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_packet.field_completion",
    contractId: "runtime-artifact.commitment-packet-field-completion.v1",
    domain: "packet",
    bodySchemaRef: "PacketFieldCompletionSchema",
    legacyBodyKeys: ["packetFieldCompletion", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_packet_fanout_diagnostics",
    contractId: "runtime-artifact.commitment-packet-fanout-diagnostics.v1",
    domain: "diagnostic",
    bodySchemaRef: "CommitmentPacketFanoutDiagnostics",
    legacyBodyKeys: ["commitmentPacketFanoutDiagnostics", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.fast_model.no_content_diagnostic",
    contractId: "runtime-artifact.fast-model-no-content-diagnostic.v1",
    domain: "diagnostic",
    bodySchemaRef: "FastModelNoContentDiagnosticSchema",
    legacyBodyKeys: ["fastModelNoContentDiagnostic", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.commitment_packet.failed_replay_result",
    contractId: "runtime-artifact.failed-packet-replay-result.v1",
    domain: "diagnostic",
    bodySchemaRef: "FailedPacketReplayResultSchema",
    legacyBodyKeys: ["failedPacketReplayResult", "body"],
  }),
  payloadContract({
    artifactType: "execution_platform.runtime_graph_patch",
    contractId: "runtime-artifact.runtime-graph-patch.v1",
    domain: "scheduler",
    bodySchemaRef: "RuntimeGraphPatch",
    legacyBodyKeys: ["runtimeGraphPatch", "graphPatch", "body"],
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
  if (contract.storagePolicy === "payload_required") {
    if (input.storageKind !== "runtime-artifact-payload") {
      throw new Error(
        `runtime artifact contract requires payload storage; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
      );
    }
    const metadataRecord = record(metadata);
    if (metadataRecord.artifactKind !== "runtime_job_artifact_payload_manifest") {
      throw new Error(
        `runtime artifact contract requires payload manifest metadata; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
      );
    }
  }
  if (contract.storagePolicy === "metadata_manifest_only") {
    const bodyPath = bodyContainsRegisteredBodyKey(metadata);
    if (bodyPath) {
      throw new Error(
        `runtime artifact metadata manifest violation at ${bodyPath}; artifactType=${input.artifactType}; contractId=${contract.contractId}`,
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
