import type {
  ActiveWorkObservation,
  BackgroundHealthObservation,
  ChildRunObservation,
  EvidenceObservation,
  FinalityObservation,
  HandoffObservation,
  ReadbackEvidenceView,
  SkillUseObservation,
} from "./evidence-schema.js";

function observationsOfType<T extends EvidenceObservation["type"]>(
  view: ReadbackEvidenceView,
  type: T,
): Extract<EvidenceObservation, { type: T }>[] {
  return view.observations.filter(
    (observation): observation is Extract<EvidenceObservation, { type: T }> =>
      observation.type === type,
  );
}

export function selectFinality(view: ReadbackEvidenceView): FinalityObservation | null {
  return observationsOfType(view, "finality")[0] ?? null;
}

export function selectActiveWork(view: ReadbackEvidenceView): ActiveWorkObservation | null {
  return observationsOfType(view, "active_work")[0] ?? null;
}

export function selectHandoffs(view: ReadbackEvidenceView): HandoffObservation[] {
  return observationsOfType(view, "handoff");
}

export function selectChildRuns(view: ReadbackEvidenceView): ChildRunObservation[] {
  return observationsOfType(view, "child_run");
}

export function selectSkillUse(view: ReadbackEvidenceView): SkillUseObservation[] {
  return observationsOfType(view, "skill_use");
}

export function selectBackgroundHealth(view: ReadbackEvidenceView): BackgroundHealthObservation[] {
  return observationsOfType(view, "background_health");
}

export function selectScopedRunInsights(
  view: ReadbackEvidenceView,
  opts: { includeBackground?: boolean } = {},
): EvidenceObservation[] {
  if (opts.includeBackground) {
    return view.observations;
  }
  return view.observations.filter((observation) => observation.subject.kind !== "global");
}

export function selectChatExpectFinal(view: ReadbackEvidenceView): Record<string, unknown> {
  const finality = selectFinality(view);
  if (!finality) {
    return {
      subject: view.subject,
      finalAssistantTextPresent: false,
      mismatches: view.mismatches,
    };
  }
  return {
    subject: view.subject,
    status: finality.state,
    finalAssistantTextPresent: finality.payload.finalAssistantTextPresent,
    finalAssistantText: finality.payload.finalAssistantText,
    finalAssistantTextChars: finality.payload.finalAssistantTextChars ?? null,
    finalAssistantTextDigest: finality.payload.finalAssistantTextDigest ?? null,
    finalAssistantTextRef: finality.payload.finalAssistantTextRef ?? null,
    resultPresent: finality.payload.resultPresent,
    resultRef: finality.payload.resultRef ?? null,
    provenance: finality.provenance,
    mismatches: view.mismatches,
  };
}

export function selectSessionShow(view: ReadbackEvidenceView): Record<string, unknown> {
  return {
    subject: view.subject,
    finality: selectFinality(view),
    activeWork: selectActiveWork(view),
    handoffs: selectHandoffs(view),
    childRuns: selectChildRuns(view),
    skillUse: selectSkillUse(view),
    mismatches: view.mismatches,
  };
}

export function selectTaskShow(view: ReadbackEvidenceView): Record<string, unknown> {
  return selectSessionShow(view);
}
