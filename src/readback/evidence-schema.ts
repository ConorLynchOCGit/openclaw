export type EvidenceSubject = {
  kind: "run" | "session" | "task" | "child" | "global";
  runId?: string;
  sessionKey?: string;
  taskId?: string;
  agentId?: string;
  childRunId?: string;
};

export type EvidenceRef = {
  kind:
    | "transcript"
    | "session"
    | "task"
    | "trajectory"
    | "skill"
    | "diagnostic"
    | "artifact"
    | "deploy"
    | "command"
    | "unknown";
  ref: string;
  label?: string;
};

export type ProvenanceRef = EvidenceRef & {
  source?: string;
  observedAt?: string;
  note?: string;
};

export type EvidenceState =
  | "active"
  | "succeeded"
  | "failed"
  | "partial"
  | "unavailable"
  | "unknown"
  | "superseded";

export type EvidenceObservationType =
  | "finality"
  | "active_work"
  | "handoff"
  | "child_run"
  | "skill_use"
  | "background_health";

export type EvidenceObservationBase = {
  type: EvidenceObservationType;
  subject: EvidenceSubject;
  state: EvidenceState;
  label?: string;
  preview?: string;
  primaryRef: EvidenceRef;
  provenance: ProvenanceRef[];
  observedAt?: string;
};

export type FinalityObservation = EvidenceObservationBase & {
  type: "finality";
  state: "active" | "succeeded" | "failed" | "unknown";
  payload: {
    finalAssistantTextPresent: boolean;
    finalAssistantText?: string;
    finalAssistantTextChars?: number;
    finalAssistantTextDigest?: string;
    finalAssistantTextRef?: EvidenceRef;
    resultPresent: boolean;
    resultRef?: EvidenceRef;
    ownerAgentId?: string;
    presenterAgentId?: string;
  };
};

export type ActiveWorkObservation = EvidenceObservationBase & {
  type: "active_work";
  state: "active" | "succeeded" | "failed" | "unavailable" | "unknown";
  payload: {
    phase:
      | "queued"
      | "running"
      | "waiting_on_child"
      | "synthesizing_after_child_work"
      | "reviewing"
      | "finalizing"
      | "succeeded"
      | "failed";
    activeAgentId?: string;
    activeChildRunId?: string;
    activeTool?: string;
    activeToolEvidence: "available" | "unavailable";
    waitReason?: string;
    resultPreview?: string;
  };
};

export type HandoffKind =
  | "domain_final"
  | "context_pack"
  | "review_packet"
  | "implementation_closeout"
  | "evidence_packet";

export type HandoffDelivery = "model_visible_full" | "linked" | "partial" | "failed" | "unknown";

export type HandoffFidelity = "verbatim" | "wrapped_verbatim" | "linked" | "unknown";

export type HandoffObservation = EvidenceObservationBase & {
  type: "handoff";
  state: "succeeded" | "failed" | "partial" | "unknown";
  payload: {
    kind: HandoffKind;
    ownerAgentId: string;
    presenterAgentId?: string;
    sourceTaskId?: string;
    sourceSessionKey?: string;
    contentChars?: number;
    contentDigest?: string;
    contentRef?: EvidenceRef;
    delivery: HandoffDelivery;
    fidelity: HandoffFidelity;
    wrapperChars?: number;
  };
};

export type SkillUseObservation = EvidenceObservationBase & {
  type: "skill_use";
  state: "succeeded" | "partial" | "failed" | "unavailable" | "unknown";
  payload: {
    agentId: string;
    skillName: string;
    skillPath: string;
    readStatus: "full" | "partial" | "failed" | "visible_only";
    linesRead?: number;
    totalLines?: number;
    bytesRead?: number;
    evidenceSource: "skill.used" | "ordinary_read" | "trajectory";
    skippedReason?: string;
  };
};

export type ChildRunObservation = EvidenceObservationBase & {
  type: "child_run";
  state: "active" | "succeeded" | "failed" | "partial" | "unknown";
  payload: {
    parentTaskId?: string;
    parentSessionKey?: string;
    ownerAgentId: string;
    childAgentId: string;
    childRole?: string;
    childSessionKey?: string;
    nativeTaskId?: string;
    mirrorTaskId?: string;
    phase: "queued" | "running" | "synthesizing" | "succeeded" | "failed";
    spawnedAt?: string;
    startedAt?: string;
    endedAt?: string;
    elapsedMs?: number;
    activeTool?: string;
    activeToolEvidence: "available" | "unavailable";
    waitReason?: string;
    spawnReason?: string;
    handoffKind?: HandoffKind;
    resultRef?: EvidenceRef;
    resultDigest?: string;
    delivery?: HandoffDelivery;
    mergeConfidence: "exact" | "ambiguous" | "none";
  };
};

export type BackgroundHealthObservation = EvidenceObservationBase & {
  type: "background_health";
  subject: EvidenceSubject & { kind: "global" };
  state: "active" | "succeeded" | "failed" | "superseded" | "unknown";
  payload: {
    code: string;
    severity: "info" | "warn" | "error";
    relatedToSubject: boolean;
    includeByDefault: false;
    resolutionState?: "unresolved" | "recovered" | "superseded_by_promotion" | "historical";
  };
};

export type EvidenceObservation =
  | FinalityObservation
  | ActiveWorkObservation
  | HandoffObservation
  | ChildRunObservation
  | SkillUseObservation
  | BackgroundHealthObservation;

export type EvidenceMismatch = {
  mismatchId: string;
  kind:
    | "status_conflict"
    | "finality_conflict"
    | "handoff_fidelity"
    | "child_merge_ambiguous"
    | "skill_claim_unproven"
    | "deploy_resolution_conflict";
  severity: "info" | "warn" | "error";
  label: string;
  preview?: string;
  observations: EvidenceRef[];
  provenance: ProvenanceRef[];
};

export type ReadbackEvidenceView = {
  subject: EvidenceSubject;
  observations: EvidenceObservation[];
  mismatches: EvidenceMismatch[];
  buildProvenance?: ProvenanceRef[];
};
