import { html, nothing } from "lit";

export type BusinessOpsProposalDecision = {
  outcome: "approve" | "revise" | "reject" | "defer";
  flowId: string;
  flowRevision: number;
  proposalId: string;
  proposalRef: string;
  proposalDigest: string;
  targetRef: string;
  targetDigest: string;
  passageFeedback?: string;
};

export type BusinessOpsProposalPresentation = {
  schema: "openclaw.business-ops.proposal-presentation.v1";
  authority: "presentation_only";
  status: "current" | "superseded_or_stale";
  flow: { id: string; revision: number };
  proposal: { id: string; ref: string; digest: string };
  target: {
    ref: string;
    digest: string;
    anchor: string;
    currentPassage: string;
    proposedPassage: string;
  };
  evidenceBasis: string[];
  affectedSurfaces: string[];
  reviewerVerdict: string | null;
  unresolvedConsequences: string[];
  allowedOutcomes: Array<BusinessOpsProposalDecision["outcome"]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }
  return value;
}

export function parseBusinessOpsProposalPresentation(
  value: string | undefined,
): BusinessOpsProposalPresentation | null {
  if (!value?.trim().startsWith("{")) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schema !== "openclaw.business-ops.proposal-presentation.v1") {
    return null;
  }
  const flow = isRecord(parsed.flow) ? parsed.flow : null;
  const proposal = isRecord(parsed.proposal) ? parsed.proposal : null;
  const target = isRecord(parsed.target) ? parsed.target : null;
  const evidenceBasis = stringArray(parsed.evidenceBasis);
  const affectedSurfaces = stringArray(parsed.affectedSurfaces);
  const unresolvedConsequences = stringArray(parsed.unresolvedConsequences);
  const allowedOutcomes = stringArray(parsed.allowedOutcomes);
  if (
    parsed.authority !== "presentation_only" ||
    (parsed.status !== "current" && parsed.status !== "superseded_or_stale") ||
    typeof flow?.id !== "string" ||
    !Number.isInteger(flow.revision) ||
    typeof proposal?.id !== "string" ||
    typeof proposal.ref !== "string" ||
    typeof proposal.digest !== "string" ||
    typeof target?.ref !== "string" ||
    typeof target.digest !== "string" ||
    typeof target.anchor !== "string" ||
    typeof target.currentPassage !== "string" ||
    typeof target.proposedPassage !== "string" ||
    !evidenceBasis ||
    !affectedSurfaces ||
    !unresolvedConsequences ||
    !allowedOutcomes ||
    !allowedOutcomes.every((outcome) => ["approve", "revise", "reject", "defer"].includes(outcome))
  ) {
    return null;
  }
  return parsed as unknown as BusinessOpsProposalPresentation;
}

export function buildBusinessOpsProposalDecisionMessage(
  decision: BusinessOpsProposalDecision,
): string {
  const lines = [
    `Business Ops proposal decision: ${decision.outcome}`,
    `TaskFlow: ${decision.flowId}@${decision.flowRevision}`,
    `Proposal: ${decision.proposalId}`,
    `Proposal ref: ${decision.proposalRef}`,
    `Proposal digest: ${decision.proposalDigest}`,
    `Target: ${decision.targetRef}`,
    `Target baseline digest: ${decision.targetDigest}`,
  ];
  if (decision.passageFeedback?.trim()) {
    lines.push("Passage feedback:", decision.passageFeedback.trim());
  }
  return lines.join("\n");
}

export function renderBusinessOpsProposalCard(
  presentation: BusinessOpsProposalPresentation,
  onDecision?: (decision: BusinessOpsProposalDecision) => void,
) {
  const actionable = presentation.status === "current" && Boolean(onDecision);
  const dispatch = (outcome: BusinessOpsProposalDecision["outcome"], event: Event) => {
    if (!actionable || !presentation.allowedOutcomes.includes(outcome)) {
      return;
    }
    const root = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      ".business-ops-proposal",
    );
    const passageFeedback = root
      ?.querySelector<HTMLTextAreaElement>("textarea[name='passage-feedback']")
      ?.value.trim();
    onDecision?.({
      outcome,
      flowId: presentation.flow.id,
      flowRevision: presentation.flow.revision,
      proposalId: presentation.proposal.id,
      proposalRef: presentation.proposal.ref,
      proposalDigest: presentation.proposal.digest,
      targetRef: presentation.target.ref,
      targetDigest: presentation.target.digest,
      ...(passageFeedback ? { passageFeedback } : {}),
    });
  };

  return html`
    <section class="business-ops-proposal" aria-label="Business Ops proposal review">
      <header class="business-ops-proposal__header">
        <div>
          <div class="business-ops-proposal__eyebrow">Business Ops proposal</div>
          <strong>${presentation.proposal.id}</strong>
        </div>
        <span
          class="business-ops-proposal__status ${presentation.status === "current"
            ? "is-current"
            : "is-stale"}"
        >
          ${presentation.status === "current" ? "Current" : "Superseded or stale"}
        </span>
      </header>

      <dl class="business-ops-proposal__meta">
        <div>
          <dt>Target</dt>
          <dd>${presentation.target.ref}</dd>
        </div>
        <div>
          <dt>TaskFlow</dt>
          <dd>${presentation.flow.id}@${presentation.flow.revision}</dd>
        </div>
        <div>
          <dt>Anchor</dt>
          <dd>${presentation.target.anchor}</dd>
        </div>
      </dl>

      <div class="business-ops-proposal__passages">
        <div>
          <h4>Current</h4>
          <div class="business-ops-proposal__passage">${presentation.target.currentPassage}</div>
        </div>
        <div>
          <h4>Proposed</h4>
          <div class="business-ops-proposal__passage">${presentation.target.proposedPassage}</div>
        </div>
      </div>

      ${presentation.reviewerVerdict
        ? html`<div class="business-ops-proposal__section">
            <h4>Reviewer verdict</h4>
            <p>${presentation.reviewerVerdict}</p>
          </div>`
        : nothing}
      ${presentation.evidenceBasis.length
        ? html`<div class="business-ops-proposal__section">
            <h4>Evidence basis</h4>
            <ul>
              ${presentation.evidenceBasis.map((item) => html`<li>${item}</li>`)}
            </ul>
          </div>`
        : nothing}
      ${presentation.affectedSurfaces.length
        ? html`<div class="business-ops-proposal__section">
            <h4>Affected surfaces</h4>
            <ul>
              ${presentation.affectedSurfaces.map((item) => html`<li>${item}</li>`)}
            </ul>
          </div>`
        : nothing}
      ${presentation.unresolvedConsequences.length
        ? html`<div class="business-ops-proposal__section">
            <h4>Unresolved consequences</h4>
            <ul>
              ${presentation.unresolvedConsequences.map((item) => html`<li>${item}</li>`)}
            </ul>
          </div>`
        : nothing}
      ${presentation.status === "current"
        ? html`<label class="business-ops-proposal__feedback">
              <span>Passage feedback</span>
              <textarea
                name="passage-feedback"
                rows="3"
                placeholder="Optional exact feedback for revise, reject, or defer"
              ></textarea>
            </label>
            <div class="business-ops-proposal__actions">
              ${presentation.allowedOutcomes.map(
                (outcome) => html`<button
                  class="btn btn--sm ${outcome === "approve" ? "primary" : ""}"
                  type="button"
                  ?disabled=${!actionable}
                  @click=${(event: Event) => dispatch(outcome, event)}
                >
                  ${outcome[0]?.toUpperCase()}${outcome.slice(1)}
                </button>`,
              )}
            </div>`
        : html`<p class="business-ops-proposal__stale-note">
            This historical proposal cannot submit a decision. Review the latest TaskFlow-bound
            proposal.
          </p>`}
    </section>
  `;
}
