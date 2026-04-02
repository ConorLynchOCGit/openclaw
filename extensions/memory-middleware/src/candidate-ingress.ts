import type {
  CandidateSubmissionKind,
  CandidateSubmissionResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CandidateLearningInput = {
  content: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

export type CandidateCorrectionSuggestionInput = CandidateLearningInput;
export type CandidateProcedureSuggestionInput = CandidateLearningInput;
export type CandidateImprovementNoteInput = CandidateLearningInput;

export type CandidateIngressPort = {
  submitLearning(input: CandidateLearningInput): Promise<CandidateSubmissionResult>;
  submitCorrectionSuggestion(
    input: CandidateCorrectionSuggestionInput,
  ): Promise<CandidateSubmissionResult>;
  submitProcedureSuggestion(
    input: CandidateProcedureSuggestionInput,
  ): Promise<CandidateSubmissionResult>;
  submitImprovementNote(input: CandidateImprovementNoteInput): Promise<CandidateSubmissionResult>;
};

export function createCandidateIngressPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-only"
    | "submit-review-only"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): CandidateIngressPort {
  const mode = params.mode;

  async function submit(
    kind: CandidateSubmissionKind,
    input: CandidateLearningInput,
  ): Promise<CandidateSubmissionResult> {
    if (mode === "disabled") {
      return {
        accepted: false,
        status: "disabled",
        kind,
        reason: "candidate ingress mode is not enabled",
      };
    }

    return params.db.queries.submitCandidate({
      kind,
      content: input.content,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  }

  return {
    submitLearning: (input) => submit("learning", input),
    submitCorrectionSuggestion: (input) => submit("correction", input),
    submitProcedureSuggestion: (input) => submit("procedure", input),
    submitImprovementNote: (input) => submit("improvement", input),
  };
}
