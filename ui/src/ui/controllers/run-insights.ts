// Control UI controller manages thin run-insights readback state.
import type { GatewayBrowserClient } from "../gateway.ts";
import type { ReadbackProgressProjection } from "../types.ts";

export type RunInsightsSignal = {
  severity?: string;
  code?: string;
  message?: string;
  pointer?: string;
  evidence?: unknown;
};

export type RunInsightsFinality = {
  status?: string | null;
  finalAssistantTextPresent?: boolean;
  finalAssistantTextChars?: number | null;
  finalAssistantTextDigest?: string | null;
  finalAssistantTextPointer?: string | null;
  mismatch?: unknown;
};

export type RunInsightsActiveWork = {
  phase?: string | null;
  childRole?: string | null;
  childSessionKey?: string | null;
  activeTool?: string | null;
  waitReason?: string | null;
  source?: string | null;
};

export type RunInsightsSessionUsage = {
  cacheStatus?: string;
  totalCost?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
  duration?: string | null;
  messageCount?: number | null;
  toolCalls?: number | null;
  uniqueTools?: number | null;
  topTools?: Array<{
    name?: string;
    count?: number;
  }>;
  errors?: number | null;
};

export type RunInsightsSession = {
  key?: string;
  agentId?: string | null;
  runtime?: string | null;
  model?: string | null;
  totalTokens?: number | null;
  percentUsed?: number | null;
  age?: string | null;
  status?: string | null;
  finality?: RunInsightsFinality;
  activeWork?: RunInsightsActiveWork;
  usage?: RunInsightsSessionUsage | null;
  pointer?: string;
};

export type RunInsightsTask = {
  taskId?: string;
  runtime?: string;
  status?: string;
  deliveryStatus?: string;
  taskKind?: string | null;
  agentId?: string | null;
  label?: string | null;
  childSessionKey?: string | null;
  elapsed?: string;
  latestEvent?: {
    kind?: string;
    summary?: string | null;
  } | null;
  activeProgress?: ReadbackProgressProjection | null;
  finality?: RunInsightsFinality;
  activeWork?: RunInsightsActiveWork;
  childRunCount?: number;
  pointer?: string;
};

export type RunInsightsChildRun = {
  parentTaskId?: string;
  runId?: string;
  childSessionKey?: string;
  agentId?: string | null;
  status?: string | null;
  deliveryStatus?: string | null;
  contentChars?: number | null;
  contentDigest?: string | null;
  contentTruncated?: boolean | null;
  elapsed?: string;
  spawnReason?: string | null;
  terminalSummary?: string | null;
  errorSummary?: string | null;
  provenanceMismatch?: string | null;
  pointer?: string;
};

export type RunInsightsSkillRead = {
  sessionKey?: string;
  agentId?: string | null;
  skillName?: string | null;
  catalogVisible?: boolean;
  visibleSkillCount?: number | null;
  visibleSkillNames?: string[];
  promptChars?: number | null;
  promptHash?: string | null;
  readEvidence?: "skill_used" | "catalog_only" | string;
  readStatus?: "full" | "partial" | "failed" | "visible_only" | "unknown" | string;
  linesRead?: number | null;
  totalLines?: number | null;
  bytesRead?: number | null;
  usedSkillNames?: string[];
  pointer?: string;
};

export type RunInsightsDeployEvent = {
  eventId?: string | null;
  eventType?: string;
  status?: string | null;
  duration?: string | null;
  durationMs?: number | null;
  imageDigest?: string | null;
  sourceCommit?: string | null;
  artifactRefs?: string[];
  pointer?: string;
};

export type RunInsightsReport = {
  schema?: string;
  generatedAt?: string;
  authority?: string;
  filters?: {
    activeMinutes?: number | null;
    limit?: number | null;
    agent?: string | null;
    session?: string | null;
    task?: string | null;
    includeBackground?: boolean;
  };
  summary?: {
    sessionCount?: number;
    recentSessionsConsidered?: number;
    sessionsDisplayed?: number;
    taskCount?: number;
    tasksDisplayed?: number;
    childRunsDisplayed?: number;
    skillReadsDisplayed?: number;
    backgroundSignalsIncluded?: boolean;
  };
  finality?: RunInsightsFinality;
  activeWork?: RunInsightsActiveWork;
  sessions?: RunInsightsSession[];
  tasks?: RunInsightsTask[];
  childRuns?: RunInsightsChildRun[];
  skillReads?: RunInsightsSkillRead[];
  deployEvents?: RunInsightsDeployEvent[];
  costs?: {
    sessionDurationMs?: number | null;
    sessionTokens?: number | null;
    sessionCostUsd?: number | null;
    toolCalls?: number | null;
    deployReceiptCount?: number;
    deployKnownDurationMs?: number;
    slowestDeployReceipt?: {
      eventId?: string | null;
      eventType?: string;
      durationMs?: number;
      pointer?: string;
    } | null;
  };
  signals?: RunInsightsSignal[];
  pointers?: Record<string, string>;
};

export type RunInsightsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  runInsightsLoading: boolean;
  runInsightsReport: RunInsightsReport | null;
  runInsightsError: string | null;
  runInsightsActiveMinutes: number;
};

export async function loadRunInsights(state: RunInsightsState, opts?: { quiet?: boolean }) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.runInsightsLoading) {
    return;
  }
  state.runInsightsLoading = true;
  if (!opts?.quiet) {
    state.runInsightsError = null;
  }
  try {
    const report = await state.client.request("run.insights", {
      activeMinutes: state.runInsightsActiveMinutes,
      limit: 10,
    });
    state.runInsightsReport = report as RunInsightsReport;
    state.runInsightsError = null;
  } catch (err) {
    state.runInsightsError = String(err);
  } finally {
    state.runInsightsLoading = false;
  }
}
