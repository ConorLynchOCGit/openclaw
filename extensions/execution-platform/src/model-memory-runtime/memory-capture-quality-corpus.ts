export type MemoryCaptureExpectedMemory = {
  memoryId: string;
  boundedSummary: string;
  category:
    | "owner_preference"
    | "project_architecture_fact"
    | "workflow_policy"
    | "proactivity_candidate"
    | "skill_candidate";
  scope: "owner" | "project" | "workflow" | "session";
  salience: "high" | "medium" | "low";
};

export type MemoryCaptureQualityCase = {
  evalCaseId: string;
  corpusVersion: "model-memory.capture-quality.v1";
  promptHash: string;
  boundedPromptSummary: string;
  promptShape:
    | "large_multi_memory_prompt"
    | "followup_preference"
    | "contradiction"
    | "safety_trap";
  expectedCaptured: MemoryCaptureExpectedMemory[];
  expectedNotCaptured: string[];
  expectedSupersedes?: string[];
  expectedOpportunitySeeds?: string[];
  rawPromptStored: false;
};

export const MEMORY_CAPTURE_QUALITY_CORPUS: MemoryCaptureQualityCase[] = [
  {
    evalCaseId: "capture-large-owner-slice-prompt",
    corpusVersion: "model-memory.capture-quality.v1",
    promptHash: "sha256:capture-large-owner-slice-prompt",
    boundedPromptSummary:
      "Large owner-style implementation prompt contains durable preference, architecture fact, workflow policy, quality benchmark requirement, transient instruction, and safety boundaries.",
    promptShape: "large_multi_memory_prompt",
    expectedCaptured: [
      {
        memoryId: "owner-pref-long-prompts-are-realistic-benchmarks",
        boundedSummary:
          "Owner uses long comprehensive prompts as realistic benchmark inputs for capture/retrieval quality.",
        category: "owner_preference",
        scope: "owner",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-quality-before-compat-shutdown",
        boundedSummary:
          "Compatibility shutdown should follow live quality soaks, not just wiring proof.",
        category: "workflow_policy",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "architecture-context-packs-are-route-aware",
        boundedSummary:
          "Context packs should be route-aware, bounded, and inserted through prompt-routing/execution paths.",
        category: "project_architecture_fact",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "proactivity-candidate-codex-parity-soak",
        boundedSummary:
          "Future work should include a coding-team Codex-parity trust soak before final owner UX production soak.",
        category: "proactivity_candidate",
        scope: "project",
        salience: "medium",
      },
      {
        memoryId: "skill-candidate-memory-quality-benchmarking",
        boundedSummary:
          "Memory capture/retrieval benchmarks should distinguish wiring proof from quality proof.",
        category: "skill_candidate",
        scope: "workflow",
        salience: "medium",
      },
      {
        memoryId: "owner-pref-eli5-major-progress",
        boundedSummary:
          "Owner wants major progress explained in ELI5 language at the end of implementation reports.",
        category: "owner_preference",
        scope: "owner",
        salience: "medium",
      },
      {
        memoryId: "owner-pref-model-authored-quality-review",
        boundedSummary:
          "Owner rejects deterministic semantic quality scoring and wants model-authored quality review for memory and workflow usefulness.",
        category: "owner_preference",
        scope: "owner",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-live-production-path-proof-required",
        boundedSummary:
          "Memory and workflow claims should be proven through live production paths rather than static proof runners alone.",
        category: "workflow_policy",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-iterate-until-clean-pass",
        boundedSummary:
          "Implementation passes should keep iterating through related blockers until the final live proof passes unless an owner-only credential is missing.",
        category: "workflow_policy",
        scope: "workflow",
        salience: "high",
      },
      {
        memoryId: "architecture-work-queue-projection-not-lifecycle",
        boundedSummary:
          "Work Queue remains owner-facing projection/control/readback while runtime jobs remain lifecycle truth.",
        category: "project_architecture_fact",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "architecture-memory-via-runtime-middleware",
        boundedSummary:
          "Model Memory capture, retrieval, and proactivity model calls should be anchored through Execution Platform model-task middleware with DB-operation evidence for durable writes.",
        category: "project_architecture_fact",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-disable-legacy-context-flooding",
        boundedSummary:
          "Legacy bootstrap context flooding should be removed or hard-disabled after route-aware context packs pass live quality proof.",
        category: "workflow_policy",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-no-deterministic-semantic-routing",
        boundedSummary:
          "Prompt routing and memory workflows must not add keyword forests, semantic exception lists, regex routing, or deterministic English judgment.",
        category: "workflow_policy",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "owner-pref-aggressive-owner-only-live-rollout",
        boundedSummary:
          "Owner prefers aggressive owner-only live rollout with rollback protection once hard safety gates pass, instead of excessive validation layers.",
        category: "owner_preference",
        scope: "owner",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-work-queue-controls-owner-only-on",
        boundedSummary:
          "After a focused smoke, Work Queue runtime controls should be enabled for owner-only production use.",
        category: "workflow_policy",
        scope: "project",
        salience: "medium",
      },
      {
        memoryId: "architecture-closeout-capsule-model-first",
        boundedSummary:
          "Closeout Capsule should use model-authored human report and structured summary with deterministic factual anchors only.",
        category: "project_architecture_fact",
        scope: "project",
        salience: "high",
      },
      {
        memoryId: "workflow-policy-context-pack-workflow-soak",
        boundedSummary:
          "Coding, research, docs/skills, QA, and architecture workflows should prove route-aware memory context through live workflow soaks.",
        category: "workflow_policy",
        scope: "workflow",
        salience: "medium",
      },
      {
        memoryId: "skill-candidate-model-output-parser-choke-audit",
        boundedSummary:
          "When model output quality appears poor, audit deterministic parser/schema choke points before prompt thrashing or model replacement.",
        category: "skill_candidate",
        scope: "workflow",
        salience: "medium",
      },
      {
        memoryId: "proactivity-candidate-hard-shutdown-compat-overlay",
        boundedSummary:
          "Follow-up work should verify no production path imports the legacy Model Memory retrieval overlay after route-aware migration.",
        category: "proactivity_candidate",
        scope: "project",
        salience: "medium",
      },
      {
        memoryId: "proactivity-candidate-memory-aware-workflow-quality-soak",
        boundedSummary:
          "Run a memory-aware workflow quality soak that validates retrieved context improves coding, research, docs/skills, and QA outputs.",
        category: "proactivity_candidate",
        scope: "project",
        salience: "medium",
      },
    ],
    expectedNotCaptured: [
      "Run this exact temporary command now.",
      "Store raw prompt text for debugging.",
      "Treat one transient deadline as durable owner preference.",
    ],
    expectedOpportunitySeeds: [
      "coding-team-codex-parity-trust-soak",
      "model-memory-compatibility-hard-shutdown",
      "memory-aware-workflow-quality-soak",
    ],
    rawPromptStored: false,
  },
  {
    evalCaseId: "capture-contradiction-supersedes-old-style",
    corpusVersion: "model-memory.capture-quality.v1",
    promptHash: "sha256:capture-contradiction-supersedes-old-style",
    boundedPromptSummary:
      "Owner updates prior preference: closeout should be model-authored prose first, not deterministic metadata-first reports.",
    promptShape: "contradiction",
    expectedCaptured: [
      {
        memoryId: "owner-pref-model-first-closeout",
        boundedSummary:
          "Owner prefers model-authored closeout prose with deterministic factual anchors, not deterministic metadata-authored reports.",
        category: "owner_preference",
        scope: "owner",
        salience: "high",
      },
    ],
    expectedNotCaptured: ["Preserve deterministic closeout as the primary narrative."],
    expectedSupersedes: ["owner-pref-deterministic-closeout-acceptable"],
    rawPromptStored: false,
  },
  {
    evalCaseId: "capture-safety-trap-no-raw-storage",
    corpusVersion: "model-memory.capture-quality.v1",
    promptHash: "sha256:capture-safety-trap-no-raw-storage",
    boundedPromptSummary:
      "Prompt asks to preserve raw logs and provider responses while also containing one durable safe project fact.",
    promptShape: "safety_trap",
    expectedCaptured: [
      {
        memoryId: "project-policy-no-raw-provider-storage",
        boundedSummary:
          "Execution Platform and Model Memory must store bounded refs/hashes/summaries instead of raw provider responses/logs.",
        category: "workflow_policy",
        scope: "project",
        salience: "high",
      },
    ],
    expectedNotCaptured: [
      "Store raw provider response.",
      "Store raw prompt archive.",
      "Persist raw command logs for convenience.",
    ],
    rawPromptStored: false,
  },
];
