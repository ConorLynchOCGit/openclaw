import { html, nothing, type TemplateResult } from "lit";
import type { WorkQueueFilter } from "../types.ts";
import type { WorkQueueObject } from "../work-queue.ts";

export type WorkQueueProps = {
  items: WorkQueueObject[];
  selectedObject: WorkQueueObject | null;
  filter: WorkQueueFilter;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  notifications: Array<{
    id: string;
    kind: "success" | "error";
    text: string;
    objectId?: string | null;
  }>;
  revisionDrafts: Record<string, string>;
  artifactBodies: Record<string, string>;
  onRefresh: () => Promise<unknown> | void;
  onSelectObject: (objectId: string | null) => void;
  onSetFilter: (filter: WorkQueueFilter) => void;
  onSetSearchQuery: (value: string) => void;
  onDismissNotification: (notificationId: string) => void;
  onUpdateRevisionDraft: (objectId: string, value: string) => void;
  onDraft: (object: WorkQueueObject) => Promise<unknown> | void;
  onFinalize: (objectId: string) => Promise<unknown> | void;
  onRequestRevision: (objectId: string) => Promise<unknown> | void;
  onRestore: (objectId: string) => Promise<unknown> | void;
  onMarkComplete: (objectId: string) => Promise<unknown> | void;
  onCopyCodexPrompt: (objectId: string) => Promise<unknown> | void;
  onDismiss: (queueItemId: string) => Promise<unknown> | void;
};

const FILTERS: Array<{ id: WorkQueueFilter; label: string }> = [
  { id: "active", label: "All active" },
  { id: "build_plans", label: "Build plans" },
  { id: "skills", label: "Skills" },
  { id: "tooling", label: "Tooling" },
  { id: "user_review", label: "User review" },
  { id: "ready_to_execute", label: "Ready to execute" },
  { id: "dismissed", label: "Dismissed" },
  { id: "diagnostics", label: "Diagnostics" },
];

const DEFAULT_VISIBLE_ITEMS = 10;

function groupLabelForFilter(filter: WorkQueueFilter, items: WorkQueueObject[]): string | null {
  switch (filter) {
    case "ready_to_execute":
      return "Ready to Execute";
    case "dismissed":
      return "Dismissed";
    case "diagnostics":
      return "Diagnostics";
    case "build_plans":
      return "Build Plans";
    case "skills":
      return "Skills";
    case "tooling":
      return "Tooling";
    case "user_review":
      return "User Review";
    default:
      return items.length > 0 ? null : "Active";
  }
}

function groupItems(
  filter: WorkQueueFilter,
  items: WorkQueueObject[],
): Array<{ label: string; items: WorkQueueObject[] }> {
  const singleLabel = groupLabelForFilter(filter, items);
  if (singleLabel) {
    return [{ label: singleLabel, items }];
  }
  const groups = new Map<string, WorkQueueObject[]>();
  for (const item of items) {
    const existing = groups.get(item.laneLabel) ?? [];
    existing.push(item);
    groups.set(item.laneLabel, existing);
  }
  return [...groups.entries()].map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

function renderNotifications(props: WorkQueueProps) {
  if (props.notifications.length === 0) {
    return nothing;
  }
  return html`
    <div class="work-queue-notifications" aria-live="polite">
      ${props.notifications.map(
        (notification) => html`
          <div class="work-queue-notification work-queue-notification--${notification.kind}">
            <div class="work-queue-notification__text">${notification.text}</div>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              @click=${() => props.onDismissNotification(notification.id)}
            >
              Dismiss
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function renderListItem(props: WorkQueueProps, item: WorkQueueObject) {
  const selected = props.selectedObject?.id === item.id;
  return html`
    <button
      type="button"
      class="work-queue-list-item ${selected ? "work-queue-list-item--selected" : ""}"
      @click=${() => props.onSelectObject(item.id)}
    >
      <div class="work-queue-list-item__top">
        <span class="work-queue-chip">${item.laneLabel}</span>
        <span class="work-queue-chip work-queue-chip--priority">${item.priorityBand}</span>
      </div>
      <div class="work-queue-list-item__title">${item.title}</div>
      <div class="work-queue-list-item__summary">${item.summary}</div>
      <div class="work-queue-list-item__meta">
        <span>${item.statusLabel}</span>
        <span>${item.objectClassLabel}</span>
      </div>
    </button>
  `;
}

function renderArtifactSection(props: WorkQueueProps, item: WorkQueueObject) {
  const artifact = item.artifact;
  const artifactBody = props.artifactBodies[item.id] ?? artifact.body;
  if (artifact.kind === "none") {
    return html`
      <section class="work-queue-detail-section">
        <h3>Draft artifact</h3>
        <p>No draft artifact exists yet.</p>
      </section>
    `;
  }
  return html`
    <section class="work-queue-detail-section">
      <div class="work-queue-detail-section__header">
        <h3>${artifact.kind === "skill" ? "Skill draft" : "Build plan"}</h3>
        <span class="work-queue-detail-section__meta">${artifact.versionLabel}</span>
      </div>
      ${artifact.path ? html`<div class="work-queue-detail-path">${artifact.path}</div>` : nothing}
      ${artifact.summary
        ? html`<p class="work-queue-detail-summary">${artifact.summary}</p>`
        : nothing}
      ${artifactBody
        ? html`<pre class="work-queue-artifact-body"><code>${artifactBody}</code></pre>`
        : html`<p class="work-queue-detail-summary">
            Full artifact text will load from the durable draft path.
          </p>`}
    </section>
  `;
}

function renderOpenQuestions(item: WorkQueueObject) {
  if (item.artifact.openQuestions.length === 0) {
    return nothing;
  }
  return html`
    <section class="work-queue-detail-section">
      <h3>Open questions</h3>
      <ul class="work-queue-question-list">
        ${item.artifact.openQuestions.map((question) => html`<li>${question}</li>`)}
      </ul>
    </section>
  `;
}

function renderFailureStatus(item: WorkQueueObject) {
  if (item.visibleStatus !== "failed") {
    return nothing;
  }
  return html`
    <section class="work-queue-detail-section work-queue-detail-section--failure">
      <h3>Action failed</h3>
      <p>
        This work item remains visible because the failure came from an item-level action. Review
        the bounded status below, then retry from this detail view when safe.
      </p>
      ${item.diagnostics.length > 0
        ? html`
            <ul class="work-queue-history-list">
              ${item.diagnostics.slice(0, 4).map((entry) => html`<li>${entry}</li>`)}
            </ul>
          `
        : nothing}
    </section>
  `;
}

function renderEvidence(item: WorkQueueObject) {
  return html`
    <details class="work-queue-detail-section">
      <summary>Evidence</summary>
      <div class="work-queue-evidence-grid">
        <div>
          <strong>Source refs</strong>
          <div>${item.sourceRefs.join(", ") || "None"}</div>
        </div>
        <div>
          <strong>Authority tiers</strong>
          <div>${item.authorityTiers.join(", ") || "None"}</div>
        </div>
        <div>
          <strong>Proof hashes</strong>
          <div>${item.proofHashes.slice(0, 4).join(", ") || "None"}</div>
        </div>
        ${item.evidenceSummary
          ? html`
              <div>
                <strong>Evidence summary</strong>
                <div>${item.evidenceSummary}</div>
              </div>
            `
          : nothing}
      </div>
    </details>
  `;
}

function renderHistory(item: WorkQueueObject) {
  return html`
    <details class="work-queue-detail-section">
      <summary>History</summary>
      <ul class="work-queue-history-list">
        <li>Current status: ${item.statusLabel}</li>
        <li>Last updated: ${item.queueItem.updatedAt}</li>
        ${item.queueItem.handoffMessageAnchor
          ? html`<li>Chat handoff anchor: ${item.queueItem.handoffMessageAnchor}</li>`
          : nothing}
        ${item.queueItem.resolvedByChatMessageId
          ? html`<li>Resolved by chat message: ${item.queueItem.resolvedByChatMessageId}</li>`
          : nothing}
      </ul>
    </details>
  `;
}

function renderActionBar(props: WorkQueueProps, item: WorkQueueObject) {
  const revisionValue = props.revisionDrafts[item.id] ?? "";
  return html`
    <section class="work-queue-detail-section">
      <div class="work-queue-actions">
        ${item.visibleStatus === "new"
          ? html`
              <button type="button" class="btn btn--primary" @click=${() => props.onDraft(item)}>
                ${item.lane === "skills" ? "Draft skill" : "Draft plan"}
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onDismiss(item.queueItemId)}
              >
                Dismiss
              </button>
            `
          : nothing}
        ${item.visibleStatus === "drafted" || item.visibleStatus === "needs_revision"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onFinalize(item.id)}
              >
                Finalize
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onDismiss(item.queueItemId)}
              >
                Dismiss
              </button>
            `
          : nothing}
        ${item.visibleStatus === "finalized"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onCopyCodexPrompt(item.id)}
              >
                Copy Codex prompt
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onMarkComplete(item.id)}
              >
                Mark complete
              </button>
            `
          : nothing}
        ${item.visibleStatus === "dismissed"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onRestore(item.id)}
              >
                Restore
              </button>
            `
          : nothing}
      </div>
      ${item.visibleStatus === "drafted" ||
      item.visibleStatus === "needs_revision" ||
      item.visibleStatus === "finalized"
        ? html`
            <div class="work-queue-revision-editor">
              <label for="work-queue-revision-input-${item.id}">Revision request</label>
              <textarea
                id="work-queue-revision-input-${item.id}"
                .value=${revisionValue}
                placeholder="Add the changes, questions, or constraints you want reflected in the next draft."
                @input=${(event: Event) =>
                  props.onUpdateRevisionDraft(item.id, (event.target as HTMLTextAreaElement).value)}
              ></textarea>
              <div class="work-queue-actions">
                <button
                  type="button"
                  class="btn btn--secondary"
                  @click=${() => props.onRequestRevision(item.id)}
                >
                  Request revision
                </button>
              </div>
            </div>
          `
        : nothing}
      ${item.visibleStatus === "finalized" && item.artifact.codexPrompt
        ? html`
            <section class="work-queue-detail-section">
              <div class="work-queue-detail-section__header">
                <h3>Codex-ready prompt</h3>
              </div>
              <pre class="work-queue-artifact-body"><code>${item.artifact.codexPrompt}</code></pre>
            </section>
          `
        : nothing}
    </section>
  `;
}

function renderDetail(props: WorkQueueProps) {
  const item = props.selectedObject;
  if (!item) {
    return html`
      <section class="work-queue-detail work-queue-detail--empty">
        <h2>Select a work item</h2>
        <p>Open a plan, skill, or review task to see the full artifact and next steps.</p>
      </section>
    `;
  }
  return html`
    <section class="work-queue-detail">
      <header class="work-queue-detail__header">
        <div class="work-queue-detail__eyebrow">${item.laneLabel} · ${item.objectClassLabel}</div>
        <h2>${item.title}</h2>
        <div class="work-queue-detail__meta">
          <span class="work-queue-chip">${item.statusLabel}</span>
          <span class="work-queue-chip work-queue-chip--priority">${item.priorityBand}</span>
        </div>
        <p class="work-queue-detail__summary">${item.summary}</p>
        <div class="work-queue-detail__next-step">
          <strong>Recommended next step</strong>
          <div>${item.recommendedNextStep}</div>
        </div>
      </header>
      ${renderFailureStatus(item)} ${renderArtifactSection(props, item)}
      ${renderOpenQuestions(item)} ${renderActionBar(props, item)} ${renderEvidence(item)}
      ${renderHistory(item)}
    </section>
  `;
}

export function renderWorkQueue(props: WorkQueueProps): TemplateResult {
  const visibleItems = props.items.slice(0, DEFAULT_VISIBLE_ITEMS);
  const overflowItems = props.items.slice(DEFAULT_VISIBLE_ITEMS);
  const visibleGroups = groupItems(props.filter, visibleItems);
  const overflowGroups = groupItems(props.filter, overflowItems);
  return html`
    <section class="work-queue-page" aria-label="Work Queue">
      ${renderNotifications(props)}
      <header class="work-queue-page__header">
        <div>
          <div class="page-title">Work Queue</div>
          <div class="page-sub">Review durable plans, skills, and manual execution handoffs.</div>
        </div>
        <div class="work-queue-page__controls">
          <input
            type="search"
            class="input"
            .value=${props.searchQuery}
            placeholder="Search active work"
            @input=${(event: Event) =>
              props.onSetSearchQuery((event.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn btn--secondary" @click=${() => props.onRefresh()}>
            ${props.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>
      <div class="work-queue-filters" aria-label="Work Queue filters">
        ${FILTERS.map(
          (filter) => html`
            <button
              type="button"
              class="work-queue-filter ${props.filter === filter.id
                ? "work-queue-filter--active"
                : ""}"
              @click=${() => props.onSetFilter(filter.id)}
            >
              ${filter.label}
            </button>
          `,
        )}
      </div>
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      <div class="work-queue-shell">
        <section class="work-queue-list" aria-label="Work items">
          ${props.items.length === 0
            ? html`<div class="work-queue-empty">No work items match the current filter.</div>`
            : html`
                ${visibleGroups.map(
                  (group) => html`
                    <section class="work-queue-list-group" aria-label=${group.label}>
                      <h3 class="work-queue-list-group__title">${group.label}</h3>
                      ${group.items.map((item) => renderListItem(props, item))}
                    </section>
                  `,
                )}
                ${overflowItems.length > 0
                  ? html`
                      <details class="work-queue-show-more">
                        <summary>Show more (${overflowItems.length})</summary>
                        ${overflowGroups.map(
                          (group) => html`
                            <section class="work-queue-list-group" aria-label=${group.label}>
                              <h3 class="work-queue-list-group__title">${group.label}</h3>
                              ${group.items.map((item) => renderListItem(props, item))}
                            </section>
                          `,
                        )}
                      </details>
                    `
                  : nothing}
              `}
        </section>
        ${renderDetail(props)}
      </div>
    </section>
  `;
}
