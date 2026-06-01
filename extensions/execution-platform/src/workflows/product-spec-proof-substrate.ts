export const PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE =
  "product_spec_runtime_boundary_replay" as const;

export const PRODUCT_SPEC_PROOF_RUN_MANIFEST_SCHEMA_VERSION =
  "execution-platform.product-spec-proof-run-manifest.v1" as const;

export const PRODUCT_SPEC_PROOF_CLEANLINESS_SCHEMA_VERSION =
  "execution-platform.product-spec-proof-cleanliness.v1" as const;

export const PRODUCT_SPEC_PROOF_FAMILY_SCHEMA_VERSION =
  "execution-platform.product-spec-proof-family.v1" as const;

export const PRODUCT_SPEC_CODING_SYSTEM_IMPLEMENTATION_PROOF_SCHEMA_VERSION =
  "execution-platform.product-spec-coding-system-implementation-proof.v1" as const;

export const PRODUCT_SPEC_PROOF_RUN_MANIFEST_MAX_BYTES = 16 * 1024;

export type ProductSpecProofSourceClassification =
  | "fresh_product_spec_runtime_boundary_replay"
  | "component_proof_supporting_evidence"
  | "stale_retired_topology_negative_fixture"
  | "historical_diagnostic_artifact"
  | "unsupported_or_unknown_source";

export type ProductSpecProofFamily =
  | "coding_executor_target_subject"
  | "product_spec_planning_executor"
  | "unknown";

export type ProductSpecTargetSubjectRef = {
  targetKind: string;
  targetRef: string;
  confidence: number | null;
};

export type ProductSpecProofFamilyGate = {
  artifactKind: "execution_platform.product_spec_proof_family_gate";
  schemaVersion: typeof PRODUCT_SPEC_PROOF_FAMILY_SCHEMA_VERSION;
  status: "passed" | "failed";
  proofFamily: ProductSpecProofFamily;
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  targetSubjectRefs: ProductSpecTargetSubjectRef[];
  requestedCapabilities: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ProductSpecProofRunManifest = {
  artifactKind: "execution_platform.product_spec_proof_run_manifest";
  schemaVersion: typeof PRODUCT_SPEC_PROOF_RUN_MANIFEST_SCHEMA_VERSION;
  proofRunId: string;
  createdAt: string;
  sourcePromptHash: string | null;
  workItemId: string | null;
  runtimeJobId: string | null;
  graphId: string | null;
  proofSourceKind: string | null;
  proofRunManifestRef: string;
  proofFamily: ProductSpecProofFamily;
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  targetSubjectRefs: ProductSpecTargetSubjectRef[];
  requestedCapabilities: string[];
  proofSourceClassification: ProductSpecProofSourceClassification;
  sourceTopologyStatus: "production_node_local_topology" | "stale_retired_topology" | "unknown";
  closurePredicateStatus: "admitted" | "blocked" | "unknown";
  proofClosureAllowed: boolean;
  boundaryCheckpointRefs: string[];
  replayResultRef: string | null;
  admissionGateRef: string | null;
  proofArtifactRef: string | null;
  proofArtifactRefs: string[];
  proofArtifactRefCount: number;
  latestRunStateRef: string | null;
  gatewaySubmitDiagnosticsRef: string | null;
  workerResultRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  evidenceClaimRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  manifestJsonByteCount: number;
};

export type ProductSpecProofCleanlinessGate = {
  artifactKind: "execution_platform.product_spec_proof_cleanliness_gate";
  schemaVersion: typeof PRODUCT_SPEC_PROOF_CLEANLINESS_SCHEMA_VERSION;
  status: "passed" | "failed";
  proofRunId: string | null;
  proofSourceClassification: ProductSpecProofSourceClassification;
  reasonCodes: string[];
  staleRuntimeJobId: boolean;
  staleGraphId: boolean;
  runScopedManifest: boolean;
  runScopedManifestMatchesProofRun: boolean;
  runScopedProofArtifacts: boolean;
  runScopedProofArtifactsMatchProofRun: boolean;
  closurePredicateAdmitted: boolean;
  proofClosureAllowed: boolean;
  retiredTopologyDetected: boolean;
  componentProofOnly: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ProductSpecCodingSystemImplementationProofGate = {
  artifactKind: "execution_platform.product_spec_coding_system_implementation_proof_gate";
  schemaVersion: typeof PRODUCT_SPEC_CODING_SYSTEM_IMPLEMENTATION_PROOF_SCHEMA_VERSION;
  status: "passed" | "failed";
  proofRunId: string | null;
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  proofFamily: ProductSpecProofFamily;
  requiredLifecycleGates: string[];
  observedLifecycleGates: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  workerResultRefs: string[];
  evidenceClaimRefs: string[];
  frameworkArtifactRefs: string[];
  reviewRefs: string[];
  closeoutRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

type ClassificationInput = {
  proofSourceKind?: unknown;
  proofRunId?: unknown;
  proofRunManifestRef?: unknown;
  proofFamily?: unknown;
  executorWorkflowId?: unknown;
  workflowId?: unknown;
  subjectWorkflowIds?: unknown;
  targetSubjectRefs?: unknown;
  requestedCapabilities?: unknown;
  runtimeJobId?: unknown;
  graphId?: unknown;
  sourceTopologyStatus?: unknown;
  closurePredicateStatus?: unknown;
  proofClosureAllowed?: unknown;
  beforeGraph?: unknown;
  afterGraph?: unknown;
  componentProofOnly?: unknown;
  historicalDiagnostic?: unknown;
};

type BuildManifestInput = {
  proofRunId: string;
  createdAt?: string | null;
  sourcePromptHash?: string | null;
  workItemId?: string | null;
  runtimeJobId?: string | null;
  graphId?: string | null;
  proofSourceKind?: string | null;
  proofRunManifestRef?: string | null;
  proofFamily?: ProductSpecProofFamily | null;
  executorWorkflowId?: string | null;
  subjectWorkflowIds?: string[] | null;
  targetSubjectRefs?: ProductSpecTargetSubjectRef[] | null;
  requestedCapabilities?: string[] | null;
  sourceTopologyStatus?: ProductSpecProofRunManifest["sourceTopologyStatus"] | null;
  closurePredicateStatus?: ProductSpecProofRunManifest["closurePredicateStatus"] | null;
  proofClosureAllowed?: boolean | null;
  boundaryCheckpointRefs?: string[] | null;
  replayResultRef?: string | null;
  admissionGateRef?: string | null;
  proofArtifactRef?: string | null;
  proofArtifactRefs?: string[] | null;
  latestRunStateRef?: string | null;
  gatewaySubmitDiagnosticsRef?: string | null;
  workerResultRefs?: string[] | null;
  changedFileRefs?: string[] | null;
  validationRefs?: string[] | null;
  evidenceClaimRefs?: string[] | null;
  reasonCodes?: string[] | null;
};

const KNOWN_STALE_RUNTIME_JOB_IDS = new Set(["product-spec-replay-mpl69vto"]);

const KNOWN_STALE_GRAPH_IDS = new Set([
  "team-run-native-exec-12fa6ecec70ecb9a-checkpoint-replay-mpl69vtn-runtime-work-graph",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function uniqueStrings(values: unknown, max = 40): string[] {
  return Array.isArray(values)
    ? [
        ...new Set(
          values
            .map((value) => stringValue(value))
            .filter((value): value is string => Boolean(value)),
        ),
      ].slice(0, max)
    : [];
}

function targetSubjectRefs(values: unknown, max = 20): ProductSpecTargetSubjectRef[] {
  return Array.isArray(values)
    ? values
        .map((value) => {
          const record = asRecord(value);
          const targetKind = stringValue(record.targetKind);
          const targetRef = stringValue(record.targetRef);
          if (!targetKind || !targetRef) {
            return null;
          }
          const confidence =
            typeof record.confidence === "number" && Number.isFinite(record.confidence)
              ? Math.max(0, Math.min(1, record.confidence))
              : null;
          return { targetKind, targetRef, confidence };
        })
        .filter((value): value is ProductSpecTargetSubjectRef => Boolean(value))
        .slice(0, max)
    : [];
}

function proofFamilyValue(value: unknown): ProductSpecProofFamily | null {
  return value === "coding_executor_target_subject" ||
    value === "product_spec_planning_executor" ||
    value === "unknown"
    ? value
    : null;
}

function hasProductSpecSubject(input: {
  subjectWorkflowIds: string[];
  targetSubjectRefs: ProductSpecTargetSubjectRef[];
}): boolean {
  return (
    input.subjectWorkflowIds.includes("agent_team.product_spec_planning") ||
    input.targetSubjectRefs.some(
      (ref) =>
        ref.targetRef === "workflow://agent_team.product_spec_planning" ||
        ref.targetRef === "agent_team.product_spec_planning",
    )
  );
}

const CODING_EXECUTOR_REQUIRED_CAPABILITIES = ["code_edit", "test"] as const;
const PLANNING_EXECUTOR_BLOCKED_CODING_CAPABILITIES = [
  "code_edit",
  "source_edit",
  "test",
  "docs_update",
  "review",
] as const;
const PLANNING_EXECUTOR_REQUIRED_CAPABILITIES = ["planning"] as const;

export function evaluateProductSpecProofFamily(input: ClassificationInput): ProductSpecProofFamilyGate {
  const executorWorkflowId = stringValue(input.executorWorkflowId) ?? stringValue(input.workflowId);
  const subjectWorkflowIds = uniqueStrings(input.subjectWorkflowIds, 20);
  const targetRefs = targetSubjectRefs(input.targetSubjectRefs, 20);
  const requestedCapabilities = uniqueStrings(input.requestedCapabilities, 20);
  const declaredFamily = proofFamilyValue(input.proofFamily);
  const productSpecSubject = hasProductSpecSubject({ subjectWorkflowIds, targetSubjectRefs: targetRefs });
  const codingExecutor = executorWorkflowId === "agent_team.coding";
  const productSpecExecutor = executorWorkflowId === "agent_team.product_spec_planning";
  const hasCodingCapabilities = CODING_EXECUTOR_REQUIRED_CAPABILITIES.some((capability) =>
    requestedCapabilities.includes(capability),
  );
  const hasPlanningCapabilities = PLANNING_EXECUTOR_REQUIRED_CAPABILITIES.some((capability) =>
    requestedCapabilities.includes(capability),
  );
  const planningHasBlockedCodingCapability = PLANNING_EXECUTOR_BLOCKED_CODING_CAPABILITIES.some(
    (capability) => requestedCapabilities.includes(capability),
  );
  const inferredFamily: ProductSpecProofFamily =
    codingExecutor && productSpecSubject && hasCodingCapabilities
      ? "coding_executor_target_subject"
      : productSpecExecutor && hasPlanningCapabilities && !planningHasBlockedCodingCapability
        ? "product_spec_planning_executor"
        : "unknown";
  const proofFamily = declaredFamily ?? inferredFamily;
  const reasonCodes = [
    executorWorkflowId ? null : "proof_family_executor_workflow_missing",
    declaredFamily && declaredFamily !== inferredFamily && inferredFamily !== "unknown"
      ? "proof_family_declared_inferred_mismatch"
      : null,
    proofFamily === "unknown" ? "proof_family_unknown" : null,
    proofFamily === "coding_executor_target_subject" && !codingExecutor
      ? "coding_executor_target_subject_executor_not_coding"
      : null,
    proofFamily === "coding_executor_target_subject" && !productSpecSubject
      ? "coding_executor_target_subject_product_spec_subject_missing"
      : null,
    proofFamily === "coding_executor_target_subject" && !hasCodingCapabilities
      ? "coding_executor_target_subject_coding_capability_missing"
      : null,
    proofFamily === "product_spec_planning_executor" && !productSpecExecutor
      ? "product_spec_planning_executor_not_product_spec"
      : null,
    proofFamily === "product_spec_planning_executor" && !hasPlanningCapabilities
      ? "product_spec_planning_executor_planning_capability_missing"
      : null,
    proofFamily === "product_spec_planning_executor" && planningHasBlockedCodingCapability
      ? "product_spec_planning_executor_exposes_coding_capability"
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    artifactKind: "execution_platform.product_spec_proof_family_gate",
    schemaVersion: PRODUCT_SPEC_PROOF_FAMILY_SCHEMA_VERSION,
    status: reasonCodes.length === 0 ? "passed" : "failed",
    proofFamily,
    executorWorkflowId,
    subjectWorkflowIds,
    targetSubjectRefs: targetRefs,
    requestedCapabilities,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function graphContainsRetiredTopology(value: unknown): boolean {
  const graph = asRecord(value);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const contextNodeIds = new Set<string>();
  let hasRetiredNode = false;
  for (const node of nodes) {
    const record = asRecord(node);
    const nodeKind = stringValue(record.nodeKind);
    const nodeId = stringValue(record.nodeId);
    if (nodeKind === "context_synthesis") {
      hasRetiredNode = true;
    }
    if (nodeId && (nodeKind === "resource_scout" || nodeKind === "web_research")) {
      contextNodeIds.add(nodeId);
      hasRetiredNode = true;
    }
  }
  const hasResourceFulfillmentFanout = edges.some((edge) => {
    const record = asRecord(edge);
    return (
      stringValue(record.edgeKind) === "context_supplies" &&
      contextNodeIds.has(stringValue(record.fromNodeId) ?? "")
    );
  });
  return hasRetiredNode || hasResourceFulfillmentFanout;
}

export function isProductSpecRunScopedArtifactRef(value: unknown): boolean {
  const ref = stringValue(value);
  return Boolean(
    ref &&
      (ref.startsWith(".artifacts/execution-platform/proof-runs/") ||
        ref.startsWith("artifact://execution-platform/proof-runs/")),
  );
}

export function productSpecProofRunIdFromArtifactRef(value: unknown): string | null {
  const ref = stringValue(value);
  if (!ref) {
    return null;
  }
  const match = ref.match(
    /(?:^\.artifacts\/execution-platform\/proof-runs\/|^artifact:\/\/execution-platform\/proof-runs\/)([^/]+)\//u,
  );
  return match?.[1] ?? null;
}

export function isProductSpecProofRunArtifactRefForRun(
  value: unknown,
  proofRunId: unknown,
): boolean {
  const expectedProofRunId = stringValue(proofRunId);
  return Boolean(
    expectedProofRunId &&
      isProductSpecRunScopedArtifactRef(value) &&
      productSpecProofRunIdFromArtifactRef(value) === expectedProofRunId,
  );
}

function defaultProofRunManifestRef(proofRunId: string): string {
  return `.artifacts/execution-platform/proof-runs/${proofRunId}/manifest.json`;
}

function manifestByteCount(manifest: ProductSpecProofRunManifest): number {
  return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`).length;
}

export function classifyProductSpecProofSource(
  input: ClassificationInput,
): ProductSpecProofSourceClassification {
  const runtimeJobId = stringValue(input.runtimeJobId);
  const graphId = stringValue(input.graphId);
  const proofSourceKind = stringValue(input.proofSourceKind);
  const proofRunId = stringValue(input.proofRunId);
  const sourceTopologyStatus = stringValue(input.sourceTopologyStatus);
  const closurePredicateStatus = stringValue(input.closurePredicateStatus);
  const familyGate = evaluateProductSpecProofFamily(input);
  const staleTopology =
    sourceTopologyStatus === "stale_retired_topology" ||
    graphContainsRetiredTopology(input.beforeGraph) ||
    graphContainsRetiredTopology(input.afterGraph) ||
    (runtimeJobId ? KNOWN_STALE_RUNTIME_JOB_IDS.has(runtimeJobId) : false) ||
    (graphId ? KNOWN_STALE_GRAPH_IDS.has(graphId) : false);
  if (staleTopology) {
    return "stale_retired_topology_negative_fixture";
  }
  if (boolValue(input.historicalDiagnostic)) {
    return "historical_diagnostic_artifact";
  }
  if (boolValue(input.componentProofOnly) || proofSourceKind?.includes("component")) {
    return "component_proof_supporting_evidence";
  }
  if (
    proofSourceKind === PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE &&
    proofRunId &&
    isProductSpecProofRunArtifactRefForRun(input.proofRunManifestRef, proofRunId) &&
    closurePredicateStatus === "admitted" &&
    boolValue(input.proofClosureAllowed) &&
    familyGate.status === "passed"
  ) {
    return "fresh_product_spec_runtime_boundary_replay";
  }
  return "unsupported_or_unknown_source";
}

export function evaluateProductSpecProofCleanliness(input: ClassificationInput & {
  proofArtifactRefs?: unknown;
}): ProductSpecProofCleanlinessGate {
  const proofRunId = stringValue(input.proofRunId);
  const runtimeJobId = stringValue(input.runtimeJobId);
  const graphId = stringValue(input.graphId);
  const classification = classifyProductSpecProofSource(input);
  const familyGate = evaluateProductSpecProofFamily(input);
  const runScopedManifest = isProductSpecRunScopedArtifactRef(input.proofRunManifestRef);
  const runScopedManifestMatchesProofRun = isProductSpecProofRunArtifactRefForRun(
    input.proofRunManifestRef,
    proofRunId,
  );
  const proofArtifactRefs = uniqueStrings(input.proofArtifactRefs, 80);
  const runScopedProofArtifacts =
    proofArtifactRefs.length > 0 && proofArtifactRefs.every(isProductSpecRunScopedArtifactRef);
  const runScopedProofArtifactsMatchProofRun =
    proofArtifactRefs.length > 0 &&
    proofArtifactRefs.every((ref) => isProductSpecProofRunArtifactRefForRun(ref, proofRunId));
  const closurePredicateAdmitted = stringValue(input.closurePredicateStatus) === "admitted";
  const proofClosureAllowed = boolValue(input.proofClosureAllowed);
  const staleRuntimeJobId = runtimeJobId ? KNOWN_STALE_RUNTIME_JOB_IDS.has(runtimeJobId) : false;
  const staleGraphId = graphId ? KNOWN_STALE_GRAPH_IDS.has(graphId) : false;
  const retiredTopologyDetected =
    classification === "stale_retired_topology_negative_fixture" ||
    graphContainsRetiredTopology(input.beforeGraph) ||
    graphContainsRetiredTopology(input.afterGraph);
  const componentProofOnly = classification === "component_proof_supporting_evidence";
  const reasonCodes = [
    proofRunId ? null : "proof_run_id_missing",
    runScopedManifest ? null : "proof_run_manifest_not_run_scoped",
    runScopedManifestMatchesProofRun ? null : "proof_run_manifest_ref_mismatch",
    runScopedProofArtifacts ? null : "proof_artifacts_not_run_scoped",
    runScopedProofArtifactsMatchProofRun ? null : "proof_artifacts_not_in_proof_run_scope",
    closurePredicateAdmitted ? null : "proof_closure_predicate_not_admitted",
    proofClosureAllowed ? null : "proof_closure_not_allowed",
    staleRuntimeJobId ? "stale_runtime_job_id_not_closure_evidence" : null,
    staleGraphId ? "stale_graph_id_not_closure_evidence" : null,
    retiredTopologyDetected ? "retired_topology_not_closure_evidence" : null,
    componentProofOnly ? "component_proof_not_product_spec_closure_evidence" : null,
    familyGate.status === "passed" ? null : "proof_family_gate_not_passed",
    ...familyGate.reasonCodes,
    classification === "fresh_product_spec_runtime_boundary_replay"
      ? null
      : `proof_source_classification_not_fresh:${classification}`,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    artifactKind: "execution_platform.product_spec_proof_cleanliness_gate",
    schemaVersion: PRODUCT_SPEC_PROOF_CLEANLINESS_SCHEMA_VERSION,
    status: reasonCodes.length === 0 ? "passed" : "failed",
    proofRunId,
    proofSourceClassification: classification,
    reasonCodes,
    staleRuntimeJobId,
    staleGraphId,
    runScopedManifest,
    runScopedManifestMatchesProofRun,
    runScopedProofArtifacts,
    runScopedProofArtifactsMatchProofRun,
    closurePredicateAdmitted,
    proofClosureAllowed,
    retiredTopologyDetected,
    componentProofOnly,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

const PRODUCT_SPEC_CODING_IMPLEMENTATION_REQUIRED_LIFECYCLE_GATES = [
  "proof_family_gate",
  "worker_context_request",
  "resource_demand",
  "resource_ledger",
  "domain_resource_selection",
  "domain_action_gate",
  "worker_action",
  "post_action_validation",
  "evidence_claim",
  "review",
  "closeout",
] as const;

export function evaluateProductSpecCodingSystemImplementationProof(input: ClassificationInput & {
  proofArtifactRefs?: unknown;
  observedLifecycleGates?: unknown;
  changedFileRefs?: unknown;
  validationRefs?: unknown;
  workerResultRefs?: unknown;
  evidenceClaimRefs?: unknown;
  frameworkArtifactRefs?: unknown;
  reviewRefs?: unknown;
  closeoutRefs?: unknown;
}): ProductSpecCodingSystemImplementationProofGate {
  const familyGate = evaluateProductSpecProofFamily(input);
  const cleanliness = evaluateProductSpecProofCleanliness(input);
  const observedLifecycleGates = uniqueStrings(input.observedLifecycleGates, 80);
  const changedFileRefs = uniqueStrings(input.changedFileRefs, 80);
  const validationRefs = uniqueStrings(input.validationRefs, 80);
  const workerResultRefs = uniqueStrings(input.workerResultRefs, 80);
  const evidenceClaimRefs = uniqueStrings(input.evidenceClaimRefs, 80);
  const frameworkArtifactRefs = uniqueStrings(input.frameworkArtifactRefs, 80);
  const reviewRefs = uniqueStrings(input.reviewRefs, 40);
  const closeoutRefs = uniqueStrings(input.closeoutRefs, 40);
  const missingLifecycleGates =
    PRODUCT_SPEC_CODING_IMPLEMENTATION_REQUIRED_LIFECYCLE_GATES.filter(
      (gate) => !observedLifecycleGates.includes(gate),
    );
  const reasonCodes = [
    familyGate.status === "passed" ? null : "coding_system_product_spec_family_gate_failed",
    familyGate.proofFamily === "coding_executor_target_subject"
      ? null
      : "coding_system_product_spec_family_not_coding_executor_target_subject",
    cleanliness.status === "passed" ? null : "coding_system_product_spec_cleanliness_failed",
    ...cleanliness.reasonCodes.map((reason) => `cleanliness:${reason}`),
    missingLifecycleGates.length === 0
      ? null
      : `coding_system_product_spec_lifecycle_gates_missing:${missingLifecycleGates.join("|")}`,
    changedFileRefs.length > 0 ? null : "coding_system_product_spec_changed_file_refs_missing",
    validationRefs.length > 0 ? null : "coding_system_product_spec_validation_refs_missing",
    workerResultRefs.length > 0 ? null : "coding_system_product_spec_worker_result_refs_missing",
    evidenceClaimRefs.length > 0 ? null : "coding_system_product_spec_evidence_claim_refs_missing",
    frameworkArtifactRefs.some((ref) => ref.startsWith("planning-framework-contract://"))
      ? null
      : "coding_system_product_spec_framework_contract_ref_missing",
    frameworkArtifactRefs.some((ref) => ref.startsWith("domain-action-gate://"))
      ? null
      : "coding_system_product_spec_domain_action_gate_ref_missing",
    reviewRefs.length > 0 ? null : "coding_system_product_spec_review_ref_missing",
    closeoutRefs.length > 0 ? null : "coding_system_product_spec_closeout_ref_missing",
  ].filter((reason): reason is string => Boolean(reason));
  return {
    artifactKind: "execution_platform.product_spec_coding_system_implementation_proof_gate",
    schemaVersion: PRODUCT_SPEC_CODING_SYSTEM_IMPLEMENTATION_PROOF_SCHEMA_VERSION,
    status: reasonCodes.length === 0 ? "passed" : "failed",
    proofRunId: stringValue(input.proofRunId),
    executorWorkflowId: familyGate.executorWorkflowId,
    subjectWorkflowIds: familyGate.subjectWorkflowIds,
    proofFamily: familyGate.proofFamily,
    requiredLifecycleGates: [...PRODUCT_SPEC_CODING_IMPLEMENTATION_REQUIRED_LIFECYCLE_GATES],
    observedLifecycleGates,
    changedFileRefs,
    validationRefs,
    workerResultRefs,
    evidenceClaimRefs,
    frameworkArtifactRefs,
    reviewRefs,
    closeoutRefs,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function buildProductSpecProofRunManifest(
  input: BuildManifestInput,
): ProductSpecProofRunManifest {
  const proofRunManifestRef = input.proofRunManifestRef ?? defaultProofRunManifestRef(input.proofRunId);
  const familyGate = evaluateProductSpecProofFamily({
    proofFamily: input.proofFamily ?? undefined,
    executorWorkflowId: input.executorWorkflowId,
    subjectWorkflowIds: input.subjectWorkflowIds,
    targetSubjectRefs: input.targetSubjectRefs,
    requestedCapabilities: input.requestedCapabilities,
  });
  const proofArtifactRefs = uniqueStrings(
    [
      input.replayResultRef,
      input.admissionGateRef,
      input.proofArtifactRef,
      input.latestRunStateRef,
      input.gatewaySubmitDiagnosticsRef,
      ...(input.proofArtifactRefs ?? []),
    ],
    80,
  );
  const classification = classifyProductSpecProofSource({
    proofSourceKind: input.proofSourceKind,
    proofRunId: input.proofRunId,
    proofRunManifestRef,
    proofFamily: familyGate.proofFamily,
    executorWorkflowId: familyGate.executorWorkflowId,
    subjectWorkflowIds: familyGate.subjectWorkflowIds,
    targetSubjectRefs: familyGate.targetSubjectRefs,
    requestedCapabilities: familyGate.requestedCapabilities,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    sourceTopologyStatus: input.sourceTopologyStatus ?? "unknown",
    closurePredicateStatus: input.closurePredicateStatus ?? "unknown",
    proofClosureAllowed: input.proofClosureAllowed === true,
  });
  const manifest: ProductSpecProofRunManifest = {
    artifactKind: "execution_platform.product_spec_proof_run_manifest",
    schemaVersion: PRODUCT_SPEC_PROOF_RUN_MANIFEST_SCHEMA_VERSION,
    proofRunId: input.proofRunId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sourcePromptHash: input.sourcePromptHash ?? null,
    workItemId: input.workItemId ?? null,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId ?? null,
    proofSourceKind: input.proofSourceKind ?? null,
    proofRunManifestRef,
    proofFamily: familyGate.proofFamily,
    executorWorkflowId: familyGate.executorWorkflowId,
    subjectWorkflowIds: familyGate.subjectWorkflowIds,
    targetSubjectRefs: familyGate.targetSubjectRefs,
    requestedCapabilities: familyGate.requestedCapabilities,
    proofSourceClassification: classification,
    sourceTopologyStatus: input.sourceTopologyStatus ?? "unknown",
    closurePredicateStatus: input.closurePredicateStatus ?? "unknown",
    proofClosureAllowed: input.proofClosureAllowed === true,
    boundaryCheckpointRefs: uniqueStrings(input.boundaryCheckpointRefs, 40),
    replayResultRef: input.replayResultRef ?? null,
    admissionGateRef: input.admissionGateRef ?? null,
    proofArtifactRef: input.proofArtifactRef ?? null,
    proofArtifactRefs,
    proofArtifactRefCount: proofArtifactRefs.length,
    latestRunStateRef: input.latestRunStateRef ?? null,
    gatewaySubmitDiagnosticsRef: input.gatewaySubmitDiagnosticsRef ?? null,
    workerResultRefs: uniqueStrings(input.workerResultRefs, 40),
    changedFileRefs: uniqueStrings(input.changedFileRefs, 40),
    validationRefs: uniqueStrings(input.validationRefs, 40),
    evidenceClaimRefs: uniqueStrings(input.evidenceClaimRefs, 40),
    reasonCodes: uniqueStrings(input.reasonCodes, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    manifestJsonByteCount: 0,
	  };
	  manifest.manifestJsonByteCount = manifestByteCount(manifest);
	  return manifest;
	}

export function assertProductSpecProofRunManifestBounds(
  manifest: ProductSpecProofRunManifest,
  maxBytes = PRODUCT_SPEC_PROOF_RUN_MANIFEST_MAX_BYTES,
): { byteCount: number; reasonCodes: string[] } {
  const byteCount = manifestByteCount(manifest);
  const proofArtifactRefs = uniqueStrings(manifest.proofArtifactRefs, 80);
  const reasonCodes = [
    manifest.artifactKind === "execution_platform.product_spec_proof_run_manifest"
      ? null
      : "manifest_artifact_kind_invalid",
    byteCount <= maxBytes ? null : "manifest_json_byte_count_overflow",
    isProductSpecProofRunArtifactRefForRun(manifest.proofRunManifestRef, manifest.proofRunId)
      ? null
      : "manifest_ref_not_in_proof_run_scope",
    proofArtifactRefs.length > 0 ? null : "manifest_proof_artifact_refs_missing",
    manifest.proofFamily === "unknown" ? "manifest_proof_family_unknown" : null,
    manifest.executorWorkflowId ? null : "manifest_executor_workflow_missing",
    proofArtifactRefs.every((ref) => isProductSpecProofRunArtifactRefForRun(ref, manifest.proofRunId))
      ? null
      : "manifest_proof_artifact_ref_scope_invalid",
    manifest.rawPromptStored === false ? null : "manifest_raw_prompt_flag_invalid",
    manifest.rawResponseStored === false ? null : "manifest_raw_response_flag_invalid",
    manifest.rawProviderLogStored === false ? null : "manifest_raw_provider_log_flag_invalid",
    manifest.rawToolLogStored === false ? null : "manifest_raw_tool_log_flag_invalid",
    manifest.rawCommandLogStored === false ? null : "manifest_raw_command_log_flag_invalid",
    manifest.rawDbRowsStored === false ? null : "manifest_raw_db_rows_flag_invalid",
    manifest.secretsStored === false ? null : "manifest_secrets_flag_invalid",
  ].filter((reason): reason is string => Boolean(reason));
  if (reasonCodes.length > 0) {
    throw new Error(`product_spec_proof_run_manifest_invalid:${reasonCodes.join(",")}`);
  }
  return { byteCount, reasonCodes };
}
