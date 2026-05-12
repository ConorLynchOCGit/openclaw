import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type RoutingTelemetryOutcome =
  | "accepted"
  | "clarification_required"
  | "approval_required"
  | "blocked"
  | "needs_review"
  | "chat_status_plan_only"
  | "compile_failed";

export type RoutingCorrectionSignal = {
  correctionId: string;
  priorRouteDecisionId: string;
  correctionCategory:
    | "false_allow"
    | "false_block"
    | "wrong_workflow"
    | "wrong_target"
    | "over_execution"
    | "under_execution"
    | "other";
  boundedSummary: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RoutingTelemetryRecord = {
  artifactKind: "intent_front_door_routing_telemetry_record";
  routeDecisionId: string;
  promptHash: string;
  promptSummary: string;
  route: string | null;
  workflowId: string | null;
  jobType: string | null;
  responseMode: string | null;
  executeNow: boolean | null;
  confidence: number | null;
  modelCandidateRef: string | null;
  routerConfigVersion: string | null;
  routerSchemaVersion: string | null;
  workflowRegistryVersion: string | null;
  authoritySnapshotVersion: string | null;
  authSessionVersion: string | null;
  conversationContextVersion: string | null;
  validatorOutcome: string | null;
  escalationOutcome: string | null;
  clarificationOutcome: string | null;
  actionSemanticsOutcome: string | null;
  compilerOutcome: string | null;
  outcome: RoutingTelemetryOutcome;
  correctionSignal: RoutingCorrectionSignal | null;
  reasonCodes: string[];
  artifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RoutingTelemetryWriteResult = {
  artifactKind: "intent_front_door_routing_telemetry_write_result";
  routeDecisionId: string;
  stored: boolean;
  duplicate: boolean;
  sink: "noop" | "memory" | "runtime_artifact";
  artifactRef: string | null;
  reasonCodes: string[];
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export interface RoutingTelemetryStore {
  write(record: RoutingTelemetryRecord): Promise<RoutingTelemetryWriteResult>;
}

function boundedString(value: string, maxLength: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function boundedStringArray(values: string[], maxItems: number, maxLength: number): string[] {
  return values
    .map((value) => boundedString(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function assertNoRawStorage(record: RoutingTelemetryRecord): void {
  if (record.rawPromptStored || record.rawResponseStored || record.rawProviderLogStored) {
    throw new Error("routing telemetry cannot store raw prompt, response, or provider logs");
  }
  if (record.correctionSignal?.rawPromptStored || record.correctionSignal?.rawResponseStored) {
    throw new Error("routing correction telemetry cannot store raw prompt or response");
  }
}

export function createRoutingTelemetryRecord(
  input: RoutingTelemetryRecord,
): RoutingTelemetryRecord {
  assertNoRawStorage(input);
  return {
    ...input,
    promptSummary: boundedString(input.promptSummary, 600),
    correctionSignal: input.correctionSignal
      ? {
          ...input.correctionSignal,
          boundedSummary: boundedString(input.correctionSignal.boundedSummary, 600),
          rawPromptStored: false,
          rawResponseStored: false,
        }
      : null,
    reasonCodes: boundedStringArray(input.reasonCodes, 40, 120),
    artifactRefs: boundedStringArray(input.artifactRefs, 40, 240),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export class NoopRoutingTelemetryStore implements RoutingTelemetryStore {
  async write(record: RoutingTelemetryRecord): Promise<RoutingTelemetryWriteResult> {
    const bounded = createRoutingTelemetryRecord(record);
    return {
      artifactKind: "intent_front_door_routing_telemetry_write_result",
      routeDecisionId: bounded.routeDecisionId,
      stored: false,
      duplicate: false,
      sink: "noop",
      artifactRef: null,
      reasonCodes: ["routing_telemetry_noop_sink"],
      runtimeJobCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
}

export class InMemoryRoutingTelemetryStore implements RoutingTelemetryStore {
  private readonly records = new Map<string, RoutingTelemetryRecord>();

  async write(record: RoutingTelemetryRecord): Promise<RoutingTelemetryWriteResult> {
    const bounded = createRoutingTelemetryRecord(record);
    const duplicate = this.records.has(bounded.routeDecisionId);
    if (!duplicate) {
      this.records.set(bounded.routeDecisionId, bounded);
    }
    return {
      artifactKind: "intent_front_door_routing_telemetry_write_result",
      routeDecisionId: bounded.routeDecisionId,
      stored: true,
      duplicate,
      sink: "memory",
      artifactRef: `memory://routing-telemetry/${bounded.routeDecisionId}`,
      reasonCodes: duplicate
        ? ["routing_telemetry_duplicate_idempotent"]
        : ["routing_telemetry_recorded"],
      runtimeJobCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  read(routeDecisionId: string): RoutingTelemetryRecord | null {
    return this.records.get(routeDecisionId) ?? null;
  }

  list(): RoutingTelemetryRecord[] {
    return [...this.records.values()];
  }
}

export class RuntimeArtifactRoutingTelemetryStore implements RoutingTelemetryStore {
  private readonly writtenRouteDecisionIds = new Set<string>();

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly runtimeJobId: string,
  ) {}

  async write(record: RoutingTelemetryRecord): Promise<RoutingTelemetryWriteResult> {
    const bounded = createRoutingTelemetryRecord(record);
    const duplicate = this.writtenRouteDecisionIds.has(bounded.routeDecisionId);
    const artifactRef = `runtime-job://${this.runtimeJobId}/execution/front-door/routing-telemetry/${bounded.routeDecisionId}`;
    if (!duplicate) {
      await this.runtimeJobs.attachArtifact({
        jobId: this.runtimeJobId,
        artifactType: "execution.front_door.routing_telemetry",
        storageKind: "metadata",
        uri: artifactRef,
        contentType: "application/json",
        metadata: bounded as unknown as JsonValue,
      });
      this.writtenRouteDecisionIds.add(bounded.routeDecisionId);
    }
    return {
      artifactKind: "intent_front_door_routing_telemetry_write_result",
      routeDecisionId: bounded.routeDecisionId,
      stored: true,
      duplicate,
      sink: "runtime_artifact",
      artifactRef,
      reasonCodes: duplicate
        ? ["routing_telemetry_duplicate_idempotent"]
        : ["routing_telemetry_runtime_artifact_recorded"],
      runtimeJobCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
}
