// Control UI view renders thin native run-insights readback.
import { html, nothing } from "lit";
import type {
  RunInsightsChildRun,
  RunInsightsDeployEvent,
  RunInsightsReport,
  RunInsightsSession,
  RunInsightsSignal,
  RunInsightsSkillRead,
  RunInsightsTask,
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

function renderMetric(label: string, value: string, detail?: string | null) {
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

function renderRunHeadline(report: RunInsightsReport | null) {
  if (!report) {
    return html`
      <section class="card">
        ${renderSectionHeader(
          "Run insights",
          "Thin readback from native sessions, tasks, child records, skill telemetry, and deploy receipts.",
        )}
        ${renderEmpty("No run insights report loaded. Refresh to request bounded native evidence.")}
      </section>
    `;
  }
  const summary = report.summary;
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: flex-end;">
        <div>
          ${renderSectionHeader(
            "Run insights",
            "Advisory readback only. Runtime truth remains in native OpenClaw/Codex evidence.",
          )}
        </div>
        ${report.schema ? html`<span class="pill">${report.schema}</span>` : nothing}
      </div>
      <div class="callout info" style="margin-top: 12px;">
        ${report.authority ?? "advisory_readback"}
      </div>
      <section class="grid" style="margin-top: 12px;">
        ${renderMetric(
          "Finality",
          report.finality?.finalAssistantTextPresent
            ? `${formatCount(report.finality.finalAssistantTextChars)} chars`
            : "not present",
          report.finality?.finalAssistantTextPointer,
        )}
        ${renderMetric(
          "Active work",
          report.activeWork?.phase ?? "unknown",
          `tool ${report.activeWork?.activeTool ?? "unknown"}; source ${
            report.activeWork?.source ?? "unknown"
          }`,
        )}
        ${renderMetric(
          "Sessions",
          formatCount(summary?.sessionsDisplayed),
          `${formatCount(summary?.recentSessionsConsidered)} considered`,
        )}
        ${renderMetric(
          "Tasks",
          formatCount(summary?.tasksDisplayed),
          `${formatCount(summary?.childRunsDisplayed)} child runs`,
        )}
        ${renderMetric("Skills", formatCount(summary?.skillReadsDisplayed))}
        ${renderMetric(
          "Background",
          report.filters?.includeBackground ? "included" : "hidden",
          report.filters?.includeBackground
            ? "deploy receipts visible"
            : "use include-background for deploy receipts",
        )}
      </section>
    </section>
  `;
}

function renderCosts(report: RunInsightsReport) {
  const costs = report.costs;
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Cost and timing",
        "Cached usage and deploy receipt durations when native evidence has them.",
      )}
      <section class="grid" style="margin-top: 12px;">
        ${renderMetric(
          "Session duration",
          costs?.sessionDurationMs ? `${costs.sessionDurationMs}ms` : "n/a",
        )}
        ${renderMetric("Session tokens", formatCount(costs?.sessionTokens))}
        ${renderMetric("Session cost", formatCost(costs?.sessionCostUsd))}
        ${renderMetric("Tool calls", formatCount(costs?.toolCalls))}
        ${renderMetric("Deploy receipts", formatCount(costs?.deployReceiptCount))}
        ${renderMetric(
          "Deploy duration",
          costs?.deployKnownDurationMs ? `${costs.deployKnownDurationMs}ms` : "n/a",
        )}
      </section>
      ${costs?.slowestDeployReceipt
        ? html`<div class="callout" style="margin-top: 12px;">
            Slowest deploy receipt: ${costs.slowestDeployReceipt.eventType}
            ${formatCount(costs.slowestDeployReceipt.durationMs)}ms
            ${renderPointer(costs.slowestDeployReceipt.pointer)}
          </div>`
        : nothing}
    </section>
  `;
}

function renderSignal(signal: RunInsightsSignal) {
  const tone = severityClass(signal.severity);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span class="pill pill--sm ${tone === "danger" ? "pill--danger" : ""}">
            ${signal.severity ?? "info"}
          </span>
          <span>${signal.code ?? "run_signal"}</span>
        </div>
        <div class="list-sub">${signal.message ?? "No summary provided."}</div>
      </div>
      ${renderPointer(signal.pointer)}
    </div>
  `;
}

function renderSignals(report: RunInsightsReport) {
  const signals = report.signals ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader("Signals", "Mechanical evidence signals only; no quality verdicts.")}
      ${signals.length
        ? html`<div class="list" style="margin-top: 12px;">${signals.map(renderSignal)}</div>`
        : renderEmpty("No scoped run signals found.")}
    </section>
  `;
}

function renderSession(session: RunInsightsSession) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${session.key ?? "session"}</span>
          ${session.status ? html`<span class="pill pill--sm">${session.status}</span>` : nothing}
        </div>
        <div class="list-sub">
          agent ${session.agentId ?? "unknown"}; runtime ${session.runtime ?? "unknown"}; model
          ${session.model ?? "unknown"}; age ${session.age ?? "unknown"}
        </div>
        <div class="list-sub">
          tokens ${formatCount(session.totalTokens)}; context ${formatCount(session.percentUsed)}%;
          tools ${formatCount(session.usage?.toolCalls)}; cost
          ${formatCost(session.usage?.totalCost)}
        </div>
      </div>
      ${renderPointer(session.pointer)}
    </div>
  `;
}

function renderSessions(report: RunInsightsReport) {
  const sessions = report.sessions ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader("Sessions", "Session rows plus finality and cached usage pointers.")}
      ${sessions.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${sessions.slice(0, 10).map(renderSession)}
          </div>`
        : renderEmpty("No matching sessions.")}
    </section>
  `;
}

function renderTask(task: RunInsightsTask) {
  const progress = task.activeProgress;
  const progressParts = [
    progress?.currentPhase ? `phase ${progress.currentPhase}` : null,
    progress?.toolName ? `tool ${progress.toolName}` : null,
    progress?.command ? `command ${progress.command}` : null,
    progress?.outputSummary ? `output ${progress.outputSummary}` : null,
  ].filter((part): part is string => Boolean(part));
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${task.label ?? task.taskId ?? "task"}</span>
          ${task.status ? html`<span class="pill pill--sm">${task.status}</span>` : nothing}
        </div>
        <div class="list-sub">
          ${task.runtime ?? "runtime n/a"}; delivery ${task.deliveryStatus ?? "n/a"}; elapsed
          ${task.elapsed ?? "unknown"}; children ${formatCount(task.childRunCount)}
        </div>
        ${task.latestEvent?.summary
          ? html`<div class="list-sub">${task.latestEvent.summary}</div>`
          : nothing}
        ${progressParts.length
          ? html`<div class="list-sub">${progressParts.join("; ")}</div>`
          : nothing}
      </div>
      ${renderPointer(task.pointer)}
    </div>
  `;
}

function renderTasks(report: RunInsightsReport) {
  const tasks = report.tasks ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader("Tasks", "Task receipts and active progress projections.")}
      ${tasks.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${tasks.slice(0, 10).map(renderTask)}
          </div>`
        : renderEmpty("No matching tasks.")}
    </section>
  `;
}

function renderChild(child: RunInsightsChildRun) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${child.childSessionKey ?? child.runId ?? "child run"}</span>
          ${child.status ? html`<span class="pill pill--sm">${child.status}</span>` : nothing}
          ${child.contentTruncated
            ? html`<span class="pill pill--sm pill--danger">truncated</span>`
            : nothing}
        </div>
        <div class="list-sub">
          agent ${child.agentId ?? "unknown"}; elapsed ${child.elapsed ?? "unknown"}; chars
          ${formatCount(child.contentChars)}
        </div>
        ${child.spawnReason ? html`<div class="list-sub">${child.spawnReason}</div>` : nothing}
        ${child.errorSummary ? html`<div class="list-sub">${child.errorSummary}</div>` : nothing}
      </div>
      ${renderPointer(child.pointer)}
    </div>
  `;
}

function renderChildren(report: RunInsightsReport) {
  const children = report.childRuns ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Child runs",
        "Normalized child evidence from existing task/session records.",
      )}
      ${children.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${children.slice(0, 10).map(renderChild)}
          </div>`
        : renderEmpty("No child runs in scoped readback.")}
    </section>
  `;
}

function renderSkillRead(skill: RunInsightsSkillRead) {
  const visible = (skill.visibleSkillNames ?? []).slice(0, 4).join(", ");
  const used = (skill.usedSkillNames ?? []).join(", ");
  const title = skill.skillName ?? skill.sessionKey ?? "session";
  const lines =
    skill.linesRead != null || skill.totalLines != null
      ? `; lines ${skill.linesRead ?? "unknown"}/${skill.totalLines ?? "unknown"}`
      : "";
  const bytes = skill.bytesRead != null ? `; bytes ${skill.bytesRead}` : "";
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${title}</span>
          <span class="pill pill--sm">${skill.readEvidence ?? "unknown"}</span>
        </div>
        <div class="list-sub">
          session ${skill.sessionKey ?? "unknown"}; status ${skill.readStatus ?? "unknown"}; visible
          ${formatCount(skill.visibleSkillCount)}${visible ? `: ${visible}` : ""}${used
            ? `; used ${used}`
            : ""}${lines}${bytes}
        </div>
      </div>
      ${renderPointer(skill.pointer)}
    </div>
  `;
}

function renderSkillReads(report: RunInsightsReport) {
  const skillReads = report.skillReads ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader("Skill reads", "Visible catalog and native skill.used evidence only.")}
      ${skillReads.length
        ? html`<div class="list" style="margin-top: 12px;">${skillReads.map(renderSkillRead)}</div>`
        : renderEmpty("No skill-read evidence in scoped readback.")}
    </section>
  `;
}

function renderDeploy(event: RunInsightsDeployEvent) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          <span>${event.eventType ?? "deploy.event"}</span>
          ${event.status ? html`<span class="pill pill--sm">${event.status}</span>` : nothing}
        </div>
        <div class="list-sub">
          duration ${event.duration ?? "unknown"}; commit
          ${event.sourceCommit ?? "unknown"}${event.imageDigest ? `; ${event.imageDigest}` : ""}
        </div>
        ${(event.artifactRefs ?? []).length
          ? html`<div class="list-sub mono">${event.artifactRefs?.slice(0, 2).join(", ")}</div>`
          : nothing}
      </div>
      ${renderPointer(event.pointer)}
    </div>
  `;
}

function renderDeploys(report: RunInsightsReport) {
  const events = report.deployEvents ?? [];
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Deploy receipts",
        "Background deploy/build/promote receipts are opt-in.",
      )}
      ${events.length
        ? html`<div class="list" style="margin-top: 12px;">
            ${events.slice(0, 8).map(renderDeploy)}
          </div>`
        : renderEmpty("Background deploy receipts hidden or unavailable.")}
    </section>
  `;
}

function pointerEntries(report: RunInsightsReport): Array<[string, string]> {
  return Object.entries(report.pointers ?? {})
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .slice(0, 12);
}

function renderPointers(report: RunInsightsReport) {
  const pointers = pointerEntries(report);
  return html`
    <section class="card">
      ${renderSectionHeader(
        "Pointers",
        "Native command and artifact pointers for deliberate inspection.",
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
        : renderEmpty("No explicit pointers in this bounded report.")}
      <details class="callout" style="margin-top: 12px;">
        <summary class="card-title">Raw report</summary>
        <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(report, null, 2)}</pre>
      </details>
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
            ${renderCosts(report)} ${renderSignals(report)} ${renderSessions(report)}
            ${renderTasks(report)} ${renderChildren(report)} ${renderSkillReads(report)}
            ${renderDeploys(report)} ${renderPointers(report)}
          `
        : nothing}
    </section>
  `;
}
