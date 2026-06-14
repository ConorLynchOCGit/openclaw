import type {
  OpenClawAcceptedAgentRun,
  OpenClawRuntimeEnvelope,
  RuntimeGeneration,
} from "./openclaw-agent-runtime-contracts.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import type { NativeTaskRunChildTask } from "./session-runtime/native-task-types.js";
import type {
  StartExecutionSessionToolInput,
  StartExecutionSessionToolResult,
} from "./tools/start-execution-session-tool.js";
import type {
  WorkQueueExecutionEligibilityToolInput,
  WorkQueueExecutionEligibilityToolResult,
} from "./tools/work-queue-execution-eligibility-tool.js";

export type AgentTurnExecutionClass =
  | "foreground_interactive"
  | "native_runtime_job"
  | "subagent_child";

export type AgentTurnRuntimeEvent = {
  phase: "executor_entered" | "agent_core_starting" | "agent_core_completed" | "agent_core_failed";
  executionClass: AgentTurnExecutionClass;
  schedulerClass: "agent_runtime";
  requestShape: "openclaw.agent-run-request.v1";
  elapsedMs: number;
  sessionId: string;
  sessionKey: string | null;
  agentId: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutationAllowed: false;
  errorName?: string;
  errorMessage?: string;
};

export type AgentTurnEnvelopePolicy = {
  kind: OpenClawRuntimeEnvelope;
  runtimeJobId: string;
  executionClass: AgentTurnExecutionClass;
  nativeRuntimeTools?: AnyAgentTool[];
  nativeExecutionSession?: {
    enabled: boolean;
    startExecutionSession: (
      input: StartExecutionSessionToolInput,
    ) => Promise<StartExecutionSessionToolResult>;
    readWorkQueueEligibility?: (
      input: WorkQueueExecutionEligibilityToolInput,
    ) => Promise<WorkQueueExecutionEligibilityToolResult>;
  };
  nodeAgentNativeTaskMode?: {
    enabled: boolean;
    allowedAgentIds: readonly string[];
    mutationToolName?: string;
    parentToolNames?: readonly string[];
    parentVisibleResultMaxChars?: number;
    runChildTask?: NativeTaskRunChildTask;
  };
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
  onRuntimeEvent?: (event: AgentTurnRuntimeEvent) => void | Promise<void>;
};

export type AgentTurn = {
  generation: RuntimeGeneration;
  acceptedRun: OpenClawAcceptedAgentRun;
  envelope: AgentTurnEnvelopePolicy;
  abortSignal?: AbortSignal;
};

export function agentTurnProfile(turn: AgentTurn) {
  const profile = turn.generation.profiles.get(turn.acceptedRun.agentId);
  if (!profile) {
    throw new Error(
      `runtime generation ${turn.generation.id} has no agent profile ${turn.acceptedRun.agentId}`,
    );
  }
  return profile;
}
