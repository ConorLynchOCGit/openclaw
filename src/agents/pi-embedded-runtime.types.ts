import type { AgentRuntimeInvocationInputParams } from "./agent-runtime-invocation.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";

export type RunEmbeddedPiAgentFn = (
  params: AgentRuntimeInvocationInputParams,
) => Promise<EmbeddedPiRunResult>;

export type RunEmbeddedAgentFn = RunEmbeddedPiAgentFn;
