// Control UI controller manages run-insights readback state.
import type { GatewayBrowserClient } from "../gateway.ts";
import type { ReadbackProgressProjection } from "../types.ts";

export type RunInsightsAttentionItem = {
  severity?: string;
  code?: string;
  message?: string;
  source?: string;
  pointer?: string;
  evidence?: unknown;
};

export type RunInsightsDeployEvent = {
  eventId?: string;
  eventType?: string;
  status?: string | null;
  age?: string | null;
  imageDigest?: string | null;
  sourceCommit?: string | null;
  artifactRefs?: Array<{
    kind?: string | null;
    path?: string | null;
  }>;
  artifactSummary?: {
    path?: string | null;
    readable?: boolean;
    skippedReason?: string | null;
    duration?: string | null;
    durationMs?: number | null;
    failedCount?: number | null;
    slowestChecks?: Array<{
      id?: string;
      duration?: string | null;
      status?: string | null;
    }>;
  } | null;
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
  totalTokensFresh?: boolean;
  percentUsed?: number | null;
  age?: string | null;
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
  age?: string;
  elapsed?: string;
  latestEvent?: {
    kind?: string;
    summary?: string | null;
  } | null;
  activeProgress?: ReadbackProgressProjection | null;
  progressSummary?: string | null;
  attention?: {
    waitClass?: string | null;
    reason?: string | null;
    pointer?: string;
  };
  pointer?: string;
};

export type RunInsightsTimelineItem = {
  at?: number | null;
  age?: string;
  source?: string;
  label?: string;
  pointer?: string;
  evidence?: unknown;
};

export type RunInsightsChildSessionEvidence = {
  taskId?: string;
  childSessionKey?: string;
  status?: string;
  elapsed?: string;
  pointer?: string;
};

export type RunInsightsReport = {
  schema?: string;
  generatedAt?: string;
  authority?: string;
  advisory?: {
    missingEvidenceLanguage?: string;
  };
  filters?: {
    activeMinutes?: number | null;
    limit?: number | null;
    agent?: string | null;
    session?: string | null;
    task?: string | null;
  };
  deployEvidenceScope?: {
    scope?: string;
    filteredBy?: string[];
    limitApplied?: number;
    reason?: string;
  };
  summary?: {
    sessionCount?: number;
    recentSessionsConsidered?: number;
    sessionsDisplayed?: number;
    tasks?: {
      total?: number;
      active?: number;
      terminal?: number;
      failures?: number;
      recentDisplayed?: number;
      activeDisplayed?: number;
      childTasksDisplayed?: number;
      deliveryIssues?: number;
      byStatus?: Record<string, number>;
      byRuntime?: Record<string, number>;
    };
    deploy?: {
      recentDisplayed?: number;
      lastEventType?: string;
      lastPromotedImageDigest?: string;
      recentFailures?: number;
    };
  };
  attention?: {
    whyWorkMayFeelSlow?: RunInsightsAttentionItem[];
    validationAndPromotion?: RunInsightsAttentionItem[];
    evidencePointers?: string[];
  };
  performanceProfile?: {
    expensiveRunExplanation?: RunInsightsAttentionItem[];
    timeline?: RunInsightsTimelineItem[];
    childSessionEvidence?: RunInsightsChildSessionEvidence[];
    retryBuildProofCost?: {
      deployReceiptCount?: number;
      totalKnownDurationMs?: number;
      totalKnownDuration?: string;
      slowestReceipt?: {
        eventId?: string;
        eventType?: string;
        durationMs?: number;
        duration?: string;
        pointer?: string;
      } | null;
    };
    validationBuildBottlenecks?: RunInsightsAttentionItem[];
    advisoryInefficiencyFlags?: Array<{
      severity?: string;
      code?: string;
      message?: string;
      evidence?: unknown;
    }>;
  };
  diagnosticSummary?: {
    currentOrLastKnownPhase?: {
      label?: string;
      source?: string;
      pointer?: string | null;
      confidence?: string;
      evidenceQuality?: string;
      reason?: string;
    };
    timeSpent?: {
      knownSessionDurationMs?: number | null;
      activeTaskElapsedMs?: number | null;
      deployReceiptKnownDurationMs?: number | null;
      confidence?: string;
      evidenceQuality?: string;
    };
    childWork?: {
      displayedChildTasks?: number;
      activeChildTasks?: number;
      contribution?: string;
      confidence?: string;
      evidenceQuality?: string;
      pointer?: string | null;
    };
    parentWaitState?: {
      waitClass?: string | null;
      reason?: string;
      pointer?: string | null;
      confidence?: string;
      evidenceQuality?: string;
    };
    validationBuildPromotion?: {
      attentionItems?: number;
      bottlenecks?: number;
      deployReceipts?: number;
      artifactPointers?: string[];
      confidence?: string;
      evidenceQuality?: string;
    };
    evidenceQuality?: {
      evidenceBacked?: number;
      heuristic?: number;
      stale?: number;
      scoped?: number;
      unknown?: number;
      missingPointers?: string[];
    };
    operatorNextAction?: {
      label?: string;
      pointer?: string;
      reason?: string;
    };
  };
  deployEvents?: RunInsightsDeployEvent[];
  sessions?: RunInsightsSession[];
  tasks?: RunInsightsTask[];
  pointers?: Record<string, string>;
  signals?: unknown;
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
