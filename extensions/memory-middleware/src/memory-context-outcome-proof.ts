import type { PluginLogger } from "../api.js";
import type { CandidateLearningInput } from "./candidate-ingress.js";
import type { LearnedGuidanceAdvisoryPlanningResult } from "./learned-guidance-advisory-planning.js";
import type { MemoryContextOutcomeObservation } from "./memory-context-outcome-model.js";
import { createMemoryContextOutcomeTracker } from "./memory-context-outcome-tracker.js";
import type { CompiledMemoryPromptContext } from "./memory-context-pack-model.js";
import type {
  MemorySoakMemoryContextOutcomeEvent,
  MemorySoakTelemetryPort,
} from "./memory-soak-telemetry.js";

export type MemoryContextOutcomeProofPort = {
  recordPromptAttachment(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
    agentId?: string;
    compiled: CompiledMemoryPromptContext;
  }): Promise<void>;
  recordLlmOutput(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
  }): Promise<void>;
  recordCandidateSubmission(params: {
    kind: "learning" | "correction" | "procedure" | "improvement";
    input: CandidateLearningInput;
    accepted: boolean;
  }): Promise<void>;
  recordGuidancePlan(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
    result: LearnedGuidanceAdvisoryPlanningResult;
  }): Promise<void>;
};

export function createMemoryContextOutcomeProofPort(params?: {
  telemetry?: MemorySoakTelemetryPort;
  logger?: PluginLogger;
}): MemoryContextOutcomeProofPort {
  const tracker = createMemoryContextOutcomeTracker();

  async function recordOutcome(event: MemoryContextOutcomeObservation) {
    try {
      await params?.telemetry?.record({
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        category: "application",
        action: "memory_context_outcome",
        source: "memory_context_outcome_tracker",
        ...event,
      } satisfies MemorySoakMemoryContextOutcomeEvent);
    } catch (error) {
      params?.logger?.warn?.(
        `memory context outcome telemetry failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    async recordPromptAttachment(input) {
      for (const observation of tracker.recordPromptAttachment(input)) {
        await recordOutcome(observation);
      }
    },

    async recordLlmOutput(input) {
      for (const observation of tracker.recordLlmOutput(input)) {
        await recordOutcome(observation);
      }
    },

    async recordCandidateSubmission(input) {
      for (const observation of tracker.recordCandidateSubmission(input)) {
        await recordOutcome(observation);
      }
    },

    async recordGuidancePlan(input) {
      for (const observation of tracker.recordGuidancePlan(input)) {
        await recordOutcome(observation);
      }
    },
  };
}
