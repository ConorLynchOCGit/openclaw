import {
  buildCanonicalReadbackGate,
  type CanonicalReadbackGate,
} from "./canonical-readback-gate.ts";

const RETIRED_CHECKPOINT_GATES = new Set([
  "resource_fulfillment",
  "after_context",
  "after-context",
  "after_context_synthesis",
  "after-context-synthesis",
  "context_synthesis",
  "resource_scout",
  "parallel_resource_scout",
  "after_parallel_context",
  "after-parallel-context",
]);

const DEFAULT_MANIFEST_MAX_BYTES = 24_000;

type TopologyGateLike = {
  failed?: boolean;
  reasonCodes?: unknown;
  evidence?: unknown;
};

export type ProofHarnessCanonicalGateProjection = {
  artifactKind: "execution_platform.proof_harness_canonical_gate_projection";
  schemaVersion: "execution-platform.proof-harness-canonical-gate.v1";
  gate: CanonicalReadbackGate;
  firstOpenGate: CanonicalReadbackGate["gateKind"];
  staleCheckpointGateRejected: boolean;
  topologyGateRejected: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ProofHarnessManifestBounds = {
  artifactKind: "execution_platform.proof_harness_manifest_bounds";
  schemaVersion: "execution-platform.proof-harness-manifest-bounds.v1";
  status: "passed" | "failed";
  name: string;
  byteCount: number;
  maxBytes: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bounded(value: unknown, max = 700): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function boundedStrings(value: unknown, max = 40): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => bounded(item, 500))
            .filter((item): item is string => Boolean(item)),
        ),
      ].slice(0, max)
    : [];
}

function withGateOverride(
  gate: CanonicalReadbackGate,
  overrides: Partial<CanonicalReadbackGate>,
): CanonicalReadbackGate {
  return {
    ...gate,
    ...overrides,
    reasonCodes: [
      ...new Set([...(overrides.reasonCodes ?? []), ...gate.reasonCodes]),
    ].slice(0, 60),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function projectProofHarnessCanonicalGate(input: {
  graphId?: string | null;
  latestProgress?: Record<string, unknown> | null;
  checkpointKind?: string | null;
  topologyGate?: TopologyGateLike | null;
  terminalStatus?: string | null;
  adapterTerminalStatus?: string | null;
}): ProofHarnessCanonicalGateProjection {
  const latestProgress = input.latestProgress ?? {};
  const checkpointKind = bounded(input.checkpointKind, 220);
  const schedulerFrontier = asRecord(latestProgress.schedulerFrontierState);
  const parallelFrontier = asRecord(latestProgress.parallelFrontier);
  const rootCause = asRecord(latestProgress.frontierRootCauseArtifact);
  const noProgress = asRecord(latestProgress.noProgressSignature);
  const schedulerModelCallEnvelope = asRecord(latestProgress.schedulerModelCallEnvelope);
  const baseGate = buildCanonicalReadbackGate({
    graphId: input.graphId,
    progress: latestProgress,
    schedulerFrontier,
    parallelFrontier,
    rootCause,
    noProgress,
    schedulerModelCallEnvelope,
    terminalStatus: input.terminalStatus,
    adapterTerminalStatus: input.adapterTerminalStatus,
  });
  const topologyGateRejected = input.topologyGate?.failed === true;
  const staleCheckpointGateRejected = Boolean(
    checkpointKind && RETIRED_CHECKPOINT_GATES.has(checkpointKind),
  );
  const topologyReasonCodes = topologyGateRejected
    ? [
        "proof_harness_topology_gate_rejected",
        ...boundedStrings(input.topologyGate?.reasonCodes, 20),
      ]
    : [];
  const staleReasonCodes = staleCheckpointGateRejected
    ? [`stale_${checkpointKind?.replace(/-/gu, "_")}_proof_gate_rejected`]
    : [];
  const gate = topologyGateRejected
    ? withGateOverride(baseGate, {
        gateKind: "graph_compile_invalid",
        gateStatus: "blocked",
        confidence: "canonical",
        sourceKind: "scheduler_frontier",
        blockerCode: "architecture_transition_topology_invalid",
        blockerSummary:
          "Retired graph-level resource scout/context supply/context synthesis topology cannot satisfy the proof harness.",
        nextLegalTransition: "compile_work_intent_graph",
        reasonCodes: topologyReasonCodes,
      })
    : staleCheckpointGateRejected && baseGate.sourceKind === "missing"
      ? withGateOverride(baseGate, {
          gateKind: "missing_runtime_state",
          gateStatus: "blocked",
          confidence: "derived",
          sourceKind: "missing",
          blockerCode: "stale_checkpoint_gate_rejected",
          blockerSummary:
            "Checkpoint label is retired and no canonical node-local state was available.",
          staleCheckpointKind: checkpointKind,
          reasonCodes: staleReasonCodes,
        })
      : withGateOverride(baseGate, {
          reasonCodes: staleReasonCodes,
        });

  return {
    artifactKind: "execution_platform.proof_harness_canonical_gate_projection",
    schemaVersion: "execution-platform.proof-harness-canonical-gate.v1",
    gate,
    firstOpenGate: gate.gateKind,
    staleCheckpointGateRejected,
    topologyGateRejected,
    reasonCodes: [
      ...new Set([
        ...topologyReasonCodes,
        ...staleReasonCodes,
        ...gate.reasonCodes,
      ]),
    ].slice(0, 60),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function evaluateProofHarnessManifestBounds(input: {
  name: string;
  value: unknown;
  maxBytes?: number;
}): ProofHarnessManifestBounds {
  const serialized = JSON.stringify(input.value);
  const byteCount = Buffer.byteLength(serialized, "utf8");
  const maxBytes = input.maxBytes ?? DEFAULT_MANIFEST_MAX_BYTES;
  const passed = byteCount <= maxBytes;
  return {
    artifactKind: "execution_platform.proof_harness_manifest_bounds",
    schemaVersion: "execution-platform.proof-harness-manifest-bounds.v1",
    status: passed ? "passed" : "failed",
    name: input.name,
    byteCount,
    maxBytes,
    reasonCodes: passed
      ? ["proof_harness_manifest_bounds_ok"]
      : ["proof_harness_manifest_overflow", "manifest_payload_body_must_be_payload_backed"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function assertProofHarnessManifestBounds(input: {
  name: string;
  value: unknown;
  maxBytes?: number;
}): ProofHarnessManifestBounds {
  const result = evaluateProofHarnessManifestBounds(input);
  if (result.status === "failed") {
    throw new Error(
      `proof_harness_manifest_overflow:${result.name}:${result.byteCount}:${result.maxBytes}`,
    );
  }
  return result;
}
