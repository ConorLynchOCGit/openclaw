// Control UI controller manages run-insights readback state.
import type { GatewayBrowserClient } from "../gateway.ts";

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
    readable?: boolean;
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
  deployEvents?: RunInsightsDeployEvent[];
  sessions?: unknown[];
  tasks?: unknown[];
  pointers?: unknown;
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
