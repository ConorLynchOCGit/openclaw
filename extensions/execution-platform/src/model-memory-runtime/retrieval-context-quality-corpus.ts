import type { CanonicalContextPackKind } from "./context-pack-registry.ts";

export type RetrievalContextQualityCase = {
  evalCaseId: string;
  corpusVersion: "model-memory.retrieval-context-quality.v1";
  workflowSurface:
    | "ordinary_chat"
    | "followup_recall"
    | "agent_team.coding"
    | "single_agent.web_research"
    | "workflow.docs_skills"
    | "agent_team.qa_test"
    | "agent_team.architecture"
    | "work_queue.readback"
    | "closeout.proactivity";
  promptHash: string;
  boundedPromptSummary: string;
  expectedRelevantRefs: string[];
  expectedSuppressedRefs: string[];
  expectedContextPackKinds: CanonicalContextPackKind[];
  baselineExpectedWeakness: string;
  expectedImprovement: string;
  rawPromptStored: false;
};

export const RETRIEVAL_CONTEXT_QUALITY_CORPUS: RetrievalContextQualityCase[] = [
  {
    evalCaseId: "retrieval-coding-memory-aware-workflow",
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    workflowSurface: "agent_team.coding",
    promptHash: "sha256:retrieval-coding-memory-aware-workflow",
    boundedPromptSummary:
      "Coding workflow should retrieve runtime truth, closeout capsule, skill context, and project architecture memory before editing.",
    expectedRelevantRefs: [
      "memory://project/runtime-truth",
      "closeout-capsule://model-first-closeout",
      "skill://openclaw-bridge-safety",
    ],
    expectedSuppressedRefs: ["memory://stale/legacy-context-flood"],
    expectedContextPackKinds: [
      "retrieval_pack",
      "workflow_runtime_state_pack",
      "closeout_capsule_pack",
      "skill_context_pack",
    ],
    baselineExpectedWeakness:
      "Coding output may miss runtime truth and closeout evidence requirements.",
    expectedImprovement:
      "Coding output references runtime evidence, no raw storage, and model-authored closeout expectations.",
    rawPromptStored: false,
  },
  {
    evalCaseId: "retrieval-research-current-docs-handoff",
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    workflowSurface: "single_agent.web_research",
    promptHash: "sha256:retrieval-research-current-docs-handoff",
    boundedPromptSummary:
      "Research workflow should receive source/citation policy and bounded handoff context without coding authority.",
    expectedRelevantRefs: [
      "memory://policy/bounded-citations",
      "runtime-job://handoff/read-only-scope",
    ],
    expectedSuppressedRefs: ["memory://authority/coding-parent-write-scope"],
    expectedContextPackKinds: ["retrieval_pack", "workflow_runtime_state_pack"],
    baselineExpectedWeakness: "Research output may omit citation bounds or authority isolation.",
    expectedImprovement:
      "Research output uses bounded citations and preserves read-only handoff scope.",
    rawPromptStored: false,
  },
  {
    evalCaseId: "retrieval-docs-skills-memory-context",
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    workflowSurface: "workflow.docs_skills",
    promptHash: "sha256:retrieval-docs-skills-memory-context",
    boundedPromptSummary:
      "Docs/skills workflow should retrieve current model-first closeout and skill quality policy.",
    expectedRelevantRefs: ["memory://policy/model-first-closeout", "skill://model-memory-quality"],
    expectedSuppressedRefs: ["memory://stale/deterministic-closeout-primary"],
    expectedContextPackKinds: ["retrieval_pack", "stable_memory_pack", "skill_context_pack"],
    baselineExpectedWeakness: "Docs may preserve stale deterministic closeout wording.",
    expectedImprovement: "Docs update reflects model-first closeout and bounded opportunity seeds.",
    rawPromptStored: false,
  },
  {
    evalCaseId: "retrieval-qa-architecture-review",
    corpusVersion: "model-memory.retrieval-context-quality.v1",
    workflowSurface: "agent_team.architecture",
    promptHash: "sha256:retrieval-qa-architecture-review",
    boundedPromptSummary:
      "Architecture/QA review should retrieve context-pack registry and compatibility shutdown policy.",
    expectedRelevantRefs: [
      "memory://architecture/context-pack-registry",
      "memory://policy/compatibility-shutdown-after-quality",
    ],
    expectedSuppressedRefs: ["memory://stale/remove-runtime-wrapper-before-quality"],
    expectedContextPackKinds: ["projection_pack", "retrieval_pack", "workflow_runtime_state_pack"],
    baselineExpectedWeakness: "Review may conflate wiring proof with quality proof.",
    expectedImprovement:
      "Review distinguishes production wiring, quality benchmark, and shutdown gates.",
    rawPromptStored: false,
  },
];
