// Control UI view renders run-insights performance readback.
import { html, nothing } from "lit";
import type {
  RunInsightsAttentionItem,
  RunInsightsChildSessionEvidence,
  RunInsightsDeployEvent,
  RunInsightsReport,
  RunInsightsTask,
  RunInsightsTimelineItem,
} from "../controllers/run-insights.ts";

export type RunInsightsProps = {
  loading: boolean;
  error: string | null;
  report: RunInsightsReport | null;
  activeMinutes: number;
  onActiveMinutesChange: (next: number) => void;
  onRefresh: () => void;
};

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US").format(value)
    : "n/a";
}

function formatCost(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(4)}` : "n/a";
}

function formatDigest(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  const normalized = value.trim();
  if (normalized.length <= 24) {
    return normalized;
  }
  return `${normalized.slice(0, 18)}...${normalized.slice(-10)}`;
}

function severityClass(severity: string | null | undefined): string {
  switch ((severity ?? "").toLowerCase()) {
    case "danger":
    case "error":
      return "danger";
    case "warn":
    case "warning":
      return "warn";
    default:
      return "info";
  }
}

function renderMetric(label: string, value: string, detail?: string) {
  return html`
    <div
      class="list-item"
      style="align-items: flex-start; min-height: 76px; border: 1px solid var(--border);"
    >
      <div class="card-sub">${label}</div>
      <div class="card-title" style="margin-top: 6px;">${value}</div>
      ${detail ? html`<div class="muted" style="margin-top: 6px;">${detail}</div>` : nothing}
    </div>
  `;
}

function renderEmpty(message: string) {
  return html`<div class="callout info" style="margin-top: 12px;">${message}</div>`;
}

function renderPointer(pointer: string | null | undefined) {
  return pointer ? html`<div class="list-meta mono" title=${pointer}>${pointer}</div>` : nothing;
}

function renderSectionHeader(title: string, subtitle?: string) {
  return html`
    <div class="card-title">${title}</div>
    ${subtitle ? html`<div class="card-sub">${subtitle}</div>` : nothing}
  `;
}

function renderAttentionItem(item: RunInsightsAttentionItem) {
  const tone = severityClass(item.severity);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span
            class="pill pill--sm ${tone === "danger" ? "pill--danger" : ""}"
            title=${item.source ?? "run insight"}
          >
            ${item.severity ?? "info"}
          </span>
          <span>${item.code ?? "run_insight"}</span>
        </div>
        <div class="list-sub">${item.message ?? "No summary provided."}</div>
      </div>
      ${renderPointer(item.pointer)}
    </div>
  `;
}

function renderAttentionList(items: RunInsightsAttentionItem[] | undefined, emptyMessage: string) {
  if (!items || items.length === 0) {
    return renderEmpty(emptyMessage);
  }
  return html`<div class="list" style="margin-top: 12px;">${items.map(renderAttentionItem)}</div>`;
}

function renderSignalList(
  items:
    | Array<{
        severity?: string;
        code?: string;
        message?: string;
      }>
    | undefined,
  emptyMessage: string,
) {
  if (!items || items.length === 0) {
    return renderEmpty(emptyMessage);
  }
  return html`
    <div class="list" style="margin-top: 12px;">
      ${items.map((item) => {
        const tone = severityClass(item.severity);
        return html`
          <div class="list-item">
            <div class="list-main">
              <div class="list-title">
                <span class="pill pill--sm ${tone === "danger" ? "pill--danger" : ""}">
                  ${item.severity ?? "signal"}
                </span>
                <span>${item.code ?? "run_signal"}</span>
              </div>
              <div class="list-sub">${item.message ?? "No summary provided."}</div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

function renderBottleneckList(items: RunInsightsAttentionItem[] | undefined) {
  if (!items || items.length === 0) {
    return renderEmpty("No validation or build bottleneck evidence.");
  }
  return html`
    <div class="list" style="margin-top: 12px;">
      ${items.map(
        (item) => html`
          <div class="list-item">
            <div class="list-main">
              <div class="list-title">
                <span class="pill pill--sm">bottleneck</span>
                <span>${item.code ?? "validation_build_bottleneck"}</span>
              </div>
              <div class="list-sub">${item.message ?? "No summary provided."}</div>
            </div>
            ${renderPointer(item.pointer)}
          </div>
        `,
      )}
    </div>
  `;
}

function renderRunHeadline(report: RunInsightsReport | null) {
  const summary = report?.summary;
  const tasks = summary?.tasks;
  const deploy = summary?.deploy;
  const attentionCount =
    (report?.attention?.whyWorkMayFeelSlow?.length ?? 0) +
    (report?.attention?.validationAndPromotion?.length ?? 0);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-end;">
        <div>
          <div class="card-title">Run insights</div>
          <div class="card-sub">
            Advisory readback from native sessions, tasks, deploy receipts, and artifacts.
          </div>
        </div>
        ${report?.schema ? html`<span class="pill">${report.schema}</span>` : nothing}
      </div>

      ${report?.authority
        ? html`<div class="callout info" style="margin-top: 12px;">${report.authority}</div>`
        : renderEmpty("No run insights report loaded. Refresh to request bounded native evidence.")}
      ${report?.advisory?.missingEvidenceLanguage
        ? html`
            <div class="muted" style="margin-top: 10px;">
              Missing evidence: ${report.advisory.missingEvidenceLanguage}
            </div>
          `
        : nothing}

      <section class="grid" style="margin-top: 12px;">
        ${renderMetric(
          "Sessions",
          formatCount(summary?.sessionsDisplayed ?? summary?.recentSessionsConsidered),
          `${formatCount(summary?.recentSessionsConsidered)} considered`,
        )}
        ${renderMetric(
          "Tasks",
          formatCount(tasks?.total),
          `${formatCount(tasks?.active)} active, ${formatCount(tasks?.failures)} failed`,
        )}
        ${renderMetric(
          "Attention",
          formatCount(attentionCount),
          `${formatCount(tasks?.deliveryIssues)} delivery issues`,
        )}
        ${renderMetric(
          "Deploy",
          deploy?.lastEventType ?? "n/a",
          `${formatCount(deploy?.recentFailures)} recent failures`,
        )}
      </section>
    </section>
  `;
}

function renderCostProfile(report: RunInsightsReport) {
  const sessions = report.sessions ?? [];
  const usageSessions = sessions.filter((session) => session.usage);
  const totalCost = usageSessions.reduce(
    (sum, session) => sum + (session.usage?.totalCost ?? 0),
    0,
  );
  const totalTokens = usageSessions.reduce(
    (sum, session) => sum + (session.usage?.totalTokens ?? 0),
    0,
  );
  const messageCount = usageSessions.reduce(
    (sum, session) => sum + (session.usage?.messageCount ?? 0),
    0,
  );
  const toolCalls = usageSessions.reduce(
    (sum, session) => sum + (session.usage?.toolCalls ?? 0),
    0,
  );
  const errors = usageSessions.reduce((sum, session) => sum + (session.usage?.errors ?? 0), 0);
  const topTools = new Map<string, number>();
  for (const session of usageSessions) {
    for (const tool of session.usage?.topTools ?? []) {
      if (!tool.name) {
        continue;
      }
      topTools.set(tool.name, (topTools.get(tool.name) ?? 0) + (tool.count ?? 0));
    }
  }
  const tools = Array.from(topTools.entries())
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, 5);
  const explanation = report.performanceProfile?.expensiveRunExplanation ?? [];

  return html`
    <section class="card">
      ${renderSectionHeader(
        "Performance and cost profile",
        "Cached usage, token, tool, and error evidence when native session usage has it.",
      )}
      <section class="grid" style="margin-top: 12px;">
        ${renderMetric("Known cost", formatCost(usageSessions.length ? totalCost : null))}
        ${renderMetric("Known tokens", formatCount(usageSessions.length ? totalTokens : null))}
        ${renderMetric("Messages", formatCount(usageSessions.length ? messageCount : null))}
        ${renderMetric("Tool calls", formatCount(usageSessions.length ? toolCalls : null))}
        ${renderMetric("Usage errors", formatCount(usageSessions.length ? errors : null))}
        ${renderMetric(
          "Promoted image",
          formatDigest(report.summary?.deploy?.lastPromotedImageDigest),
        )}
      </section>

      ${tools.length
        ? html`
            <div class="list" style="margin-top: 12px;">
              ${tools.map(
                ([name, count]) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${name}</div>
                      <div class="list-sub">Top tool evidence from cached session usage.</div>
                    </div>
                    <div class="list-meta">${formatCount(count)}</div>
                  </div>
                `,
              )}
            </div>
          `
        : renderEmpty("No cached usage or top-tool evidence in this bounded report.")}
      ${explanation.length
        ? html`<div style="margin-top: 12px;">
            ${renderAttentionList(explanation, "No expensive-run explanation evidence.")}
          </div>`
        : nothing}
      <div style="margin-top: 12px;">
        <div class="card-sub">Advisory inefficiency flags</div>
        ${renderSignalList(
          report.performanceProfile?.advisoryInefficiencyFlags,
          "No advisory inefficiency flags in this bounded report.",
        )}
      </div>
    </section>
  `;
}

function renderAttentionPanel(report: RunInsightsReport) {
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Attention readback",
        "Existing advisory signals and validation/promotion attention from the report.",
      )}
      <div style="margin-top: 12px;">
        <div class="card-sub">Why work may feel slow</div>
        ${renderAttentionList(
          report.attention?.whyWorkMayFeelSlow,
          "No current slow-work attention evidence.",
        )}
      </div>
      <div style="margin-top: 12px;">
        <div class="card-sub">Validation and promotion</div>
        ${renderAttentionList(
          report.attention?.validationAndPromotion,
          "No validation or promotion attention evidence.",
        )}
      </div>
    </section>
  `;
}

function renderTimeline(timeline: RunInsightsTimelineItem[] | undefined) {
  const rows = [...(timeline ?? [])]
    .toSorted((left, right) => (right.at ?? -1) - (left.at ?? -1))
    .slice(0, 12);
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Timeline and phase readback",
        "Existing timeline entries only; this panel does not infer lifecycle status.",
      )}
      ${rows.length
        ? html`
            <div class="list" style="margin-top: 12px;">
              ${rows.map(
                (item) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">
                        <span>${item.label ?? "timeline entry"}</span>
                        ${item.source
                          ? html`<span class="pill pill--sm">${item.source}</span>`
                          : nothing}
                      </div>
                      <div class="list-sub">${item.age ?? "age unknown"}</div>
                    </div>
                    ${renderPointer(item.pointer)}
                  </div>
                `,
              )}
            </div>
          `
        : renderEmpty("No timeline evidence in this bounded report.")}
    </section>
  `;
}

function renderChildEvidence(rows: RunInsightsChildSessionEvidence[] | undefined) {
  if (!rows || rows.length === 0) {
    return renderEmpty("No child session evidence in this bounded report.");
  }
  return html`
    <div class="list" style="margin-top: 12px;">
      ${rows.map(
        (row) => html`
          <div class="list-item">
            <div class="list-main">
              <div class="list-title">
                <span>${row.childSessionKey ?? "child session"}</span>
                ${row.status ? html`<span class="pill pill--sm">${row.status}</span>` : nothing}
              </div>
              <div class="list-sub">
                task ${row.taskId ?? "n/a"}${row.elapsed ? `, elapsed ${row.elapsed}` : ""}
              </div>
            </div>
            ${renderPointer(row.pointer)}
          </div>
        `,
      )}
    </div>
  `;
}

function renderTask(task: RunInsightsTask) {
  const waitClass = task.attention?.waitClass;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${task.label ?? task.taskId ?? "task"}</span>
          ${task.status ? html`<span class="pill pill--sm">${task.status}</span>` : nothing}
          ${waitClass ? html`<span class="pill pill--sm">${waitClass}</span>` : nothing}
        </div>
        <div class="list-sub">
          ${task.runtime ?? "runtime n/a"}${task.deliveryStatus
            ? `, delivery ${task.deliveryStatus}`
            : ""}${task.elapsed ? `, elapsed ${task.elapsed}` : ""}
        </div>
        ${task.progressSummary
          ? html`<div class="list-sub">${task.progressSummary}</div>`
          : task.latestEvent?.summary
            ? html`<div class="list-sub">${task.latestEvent.summary}</div>`
            : nothing}
      </div>
      ${renderPointer(task.pointer)}
    </div>
  `;
}

function renderChildAndTaskEvidence(report: RunInsightsReport) {
  const tasks = report.tasks ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Child and task evidence",
        "Native task rows, child-session pointers, progress summaries, and delivery state.",
      )}
      ${renderChildEvidence(report.performanceProfile?.childSessionEvidence)}
      ${tasks.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${tasks.slice(0, 10).map(renderTask)}
          </div>`
        : renderEmpty("No task rows in this bounded report.")}
    </section>
  `;
}

function renderDeployEvent(event: RunInsightsDeployEvent) {
  const slowest = event.artifactSummary?.slowestChecks?.[0];
  const artifact = event.artifactSummary?.path ?? event.artifactRefs?.find((ref) => ref.path)?.path;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${event.eventType ?? "deploy.event"}</span>
          ${event.status ? html`<span class="pill pill--sm">${event.status}</span>` : nothing}
          ${event.artifactSummary?.failedCount
            ? html`<span class="pill pill--sm pill--danger">
                ${formatCount(event.artifactSummary.failedCount)} failed
              </span>`
            : nothing}
        </div>
        <div class="list-sub">
          duration
          ${event.artifactSummary?.duration ?? "unknown"}${slowest?.id
            ? `, slowest ${slowest.id}${slowest.duration ? ` ${slowest.duration}` : ""}`
            : ""}${event.imageDigest ? `, ${formatDigest(event.imageDigest)}` : ""}
        </div>
        ${artifact ? html`<div class="list-sub mono">${artifact}</div>` : nothing}
      </div>
      ${event.age ? html`<div class="list-meta">${event.age}</div>` : nothing}
    </div>
  `;
}

function renderValidationCost(report: RunInsightsReport) {
  const retry = report.performanceProfile?.retryBuildProofCost;
  const bottlenecks = report.performanceProfile?.validationBuildBottlenecks ?? [];
  const events = report.deployEvents ?? [];

  return html`
    <section class="card">
      ${renderSectionHeader(
        "Validation, build, and promote cost",
        "Deploy receipts, retry/build/proof duration, bottlenecks, failed counts, and artifacts.",
      )}
      <section class="grid" style="margin-top: 12px;">
        ${renderMetric("Deploy receipts", formatCount(retry?.deployReceiptCount))}
        ${renderMetric("Known duration", retry?.totalKnownDuration ?? "n/a")}
        ${renderMetric(
          "Slowest receipt",
          retry?.slowestReceipt?.eventType ?? "n/a",
          retry?.slowestReceipt?.duration,
        )}
        ${renderMetric(
          "Recent deploy failures",
          formatCount(report.summary?.deploy?.recentFailures),
        )}
      </section>
      ${retry?.slowestReceipt?.pointer
        ? html`<div class="callout" style="margin-top: 12px;">
            <span class="mono">${retry.slowestReceipt.pointer}</span>
          </div>`
        : nothing}
      ${bottlenecks.length
        ? html`<div style="margin-top: 12px;">${renderBottleneckList(bottlenecks)}</div>`
        : nothing}
      ${events.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${events.slice(0, 8).map(renderDeployEvent)}
          </div>`
        : renderEmpty("No deploy receipt rows in this bounded report.")}
    </section>
  `;
}

function pointerEntries(report: RunInsightsReport): Array<[string, string]> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(report.pointers ?? {})) {
    if (value) {
      entries.set(key, value);
    }
  }
  for (const pointer of report.attention?.evidencePointers ?? []) {
    entries.set(pointer, pointer);
  }
  return Array.from(entries.entries()).slice(0, 18);
}

function renderPointers(report: RunInsightsReport) {
  const pointers = pointerEntries(report);
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Pointers and debug fallback",
        "Artifact, proof, lifecycle-audit, task, session, and deploy pointers with bounded JSON secondary.",
      )}
      ${pointers.length
        ? html`
            <div class="list" style="margin-top: 12px;">
              ${pointers.map(
                ([label, pointer]) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${label}</div>
                      <div class="list-sub mono">${pointer}</div>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
        : renderEmpty("No explicit evidence pointers in this bounded report.")}
      <details class="callout" style="margin-top: 12px;">
        <summary class="card-title">Raw bounded report</summary>
        <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  `;
}

function renderControls(props: RunInsightsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-end;">
        <label class="field" style="min-width: 150px;">
          <span>Window</span>
          <select
            .value=${String(props.activeMinutes)}
            @change=${(event: Event) =>
              props.onActiveMinutesChange(Number((event.target as HTMLSelectElement).value))}
          >
            <option value="60">1 hour</option>
            <option value="180">3 hours</option>
            <option value="720">12 hours</option>
            <option value="1440">24 hours</option>
          </select>
        </label>
        <button class="btn primary" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      ${props.error
        ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
        : nothing}
    </section>
  `;
}

export function renderRunInsights(props: RunInsightsProps) {
  const report = props.report;

  return html`
    <section class="stack" aria-label="Run insights">
      ${renderControls(props)} ${renderRunHeadline(report)}
      ${report
        ? html`
            ${renderCostProfile(report)} ${renderAttentionPanel(report)}
            ${renderTimeline(report.performanceProfile?.timeline)}
            ${renderChildAndTaskEvidence(report)} ${renderValidationCost(report)}
            ${renderPointers(report)}
          `
        : nothing}
    </section>
  `;
}
