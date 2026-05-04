import type { JsonValue } from "../runtime-job-repository.ts";
import {
  VALIDATION_LANE_IDS,
  type ValidationLaneDefinition,
  type ValidationLaneEvidence,
  type ValidationLaneId,
} from "./types.ts";

const DEFAULT_VALIDATION_LANES: Record<ValidationLaneId, ValidationLaneDefinition> = {
  build: {
    laneId: "build",
    description: "Build and type-generation proof lane metadata.",
    commandDescriptor: "turbo may orchestrate build commands outside runtime truth",
    turboMayOrchestrate: true,
    turboRuntimeTruth: false,
  },
  test: {
    laneId: "test",
    description: "Focused and sharded test proof lane metadata.",
    commandDescriptor: "turbo may orchestrate test shards outside runtime truth",
    turboMayOrchestrate: true,
    turboRuntimeTruth: false,
  },
  lint: {
    laneId: "lint",
    description: "Lint and formatting proof lane metadata.",
    commandDescriptor: "turbo may orchestrate lint checks outside runtime truth",
    turboMayOrchestrate: true,
    turboRuntimeTruth: false,
  },
  eval: {
    laneId: "eval",
    description: "Deterministic eval proof lane metadata.",
    commandDescriptor: "turbo may orchestrate eval shards outside runtime truth",
    turboMayOrchestrate: true,
    turboRuntimeTruth: false,
  },
  proof: {
    laneId: "proof",
    description: "Operator proof bundle lane metadata.",
    commandDescriptor: "turbo may orchestrate proof bundles outside runtime truth",
    turboMayOrchestrate: true,
    turboRuntimeTruth: false,
  },
};

export function createValidationLaneDefinitions(
  overrides: Partial<Record<ValidationLaneId, Partial<ValidationLaneDefinition>>> = {},
): ValidationLaneDefinition[] {
  return VALIDATION_LANE_IDS.map((laneId) => ({
    ...DEFAULT_VALIDATION_LANES[laneId],
    ...overrides[laneId],
    laneId,
    turboRuntimeTruth: false,
  }));
}

export function listValidationLaneDefinitions(): ValidationLaneDefinition[] {
  return createValidationLaneDefinitions();
}

export function createValidationLaneEvidence(input: {
  laneId: ValidationLaneId;
  outcome: ValidationLaneEvidence["outcome"];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  artifactRefs?: string[];
  metadata?: JsonValue;
}): ValidationLaneEvidence {
  const lane = DEFAULT_VALIDATION_LANES[input.laneId];
  return {
    laneId: input.laneId,
    outcome: input.outcome,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    summary: input.summary,
    artifactRefs: input.artifactRefs ?? [],
    turboMayOrchestrate: lane.turboMayOrchestrate,
    turboRuntimeTruth: false,
    metadata: input.metadata,
  };
}
