// Control UI view renders run-insights performance readback.
import { html, nothing } from "lit";
import type { RunInsightsAttentionItem, RunInsightsReport } from "../controllers/run-insights.ts";

export type RunInsightsProps = {
  loading: boolean;
  error: string | null;
  report: RunInsightsReport | null;
  activeMinutes: number;
  onActiveMinutesChange: (next: number) => void;
  onRefresh: () => void;
};

function formatCount(value: number | null | undefined): string {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function formatDigest(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  const normalized = value.trim();
  if (normalized.length <= 24) {
    return normalized;
  }
  return `${normalized.slice(0, 18)}…${normalized.slice(-10)}`;
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
    <div class="card">
      <div class="card-sub">${label}</div>
      <div class="card-title" style="margin-top: 6px;">${value}</div>
      ${detail ? html`<div class="muted" style="margin-top: 6px;">${detail}</div>` : nothing}
    </div>
  `;
}

function renderAttentionItem(item: RunInsightsAttentionItem) {
  const tone = severityClass(item.severity);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span class="pill pill--sm ${tone === "danger" ? "pill--danger" : ""}">
            ${item.severity ?? "info"}
          </span>
          <span>${item.code ?? "run_insight"}</span>
        </div>
        <div class="list-sub">${item.message ?? "No summary provided."}</div>
      </div>
      ${item.pointer
        ? html`<div class="list-meta mono" title=${item.pointer}>${item.pointer}</div>`
        : nothing}
    </div>
  `;
}

function renderAttentionGroup(title: string, items: RunInsightsAttentionItem[] | undefined) {
  if (!items || items.length === 0) {
    return nothing;
  }
  return html`
    <section class="card">
      <div class="card-title">${title}</div>
      <div class="list" style="margin-top: 12px;">${items.map(renderAttentionItem)}</div>
    </section>
  `;
}

function renderPointerList(pointers: string[] | undefined) {
  if (!pointers || pointers.length === 0) {
    return nothing;
  }
  return html`
    <section class="card">
      <div class="card-title">Evidence pointers</div>
      <div class="list" style="margin-top: 12px;">
        ${pointers.slice(0, 16).map(
          (pointer) => html`
            <div class="list-item">
              <div class="list-main">
                <div class="list-title mono">${pointer}</div>
              </div>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

export function renderRunInsights(props: RunInsightsProps) {
  const report = props.report;
  const summary = report?.summary;
  const tasks = summary?.tasks;
  const deploy = summary?.deploy;
  const attention = report?.attention;

  return html`
    <section class="stack" aria-label="Run insights">
      <div class="card">
        <div class="row" style="justify-content: space-between; align-items: flex-end;">
          <div>
            <div class="card-title">Run insights</div>
            <div class="card-sub">
              Advisory readback from native sessions, tasks, deploy receipts, and artifacts.
            </div>
          </div>
          <div class="row">
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
              ${props.loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        ${props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing}
        ${report?.authority
          ? html`<div class="callout info" style="margin-top: 12px;">${report.authority}</div>`
          : nothing}
      </div>

      <section class="grid">
        ${renderMetric("Sessions considered", formatCount(summary?.recentSessionsConsidered))}
        ${renderMetric(
          "Tasks",
          formatCount(tasks?.total),
          `${formatCount(tasks?.active)} active, ${formatCount(tasks?.failures)} failed`,
        )}
        ${renderMetric(
          "Deploy",
          deploy?.lastEventType ?? "n/a",
          `${formatCount(deploy?.recentFailures)} recent failures`,
        )}
        ${renderMetric("Promoted image", formatDigest(deploy?.lastPromotedImageDigest))}
      </section>

      ${renderAttentionGroup("Why work may feel slow", attention?.whyWorkMayFeelSlow)}
      ${renderAttentionGroup("Validation and promotion", attention?.validationAndPromotion)}
      ${renderPointerList(attention?.evidencePointers)}
      ${report
        ? html`
            <details class="card">
              <summary class="card-title">Raw bounded report</summary>
              <pre class="code-block" style="margin-top: 12px;">
${JSON.stringify(report, null, 2)}</pre
              >
            </details>
          `
        : html`<div class="card muted">No run insights loaded yet.</div>`}
    </section>
  `;
}
