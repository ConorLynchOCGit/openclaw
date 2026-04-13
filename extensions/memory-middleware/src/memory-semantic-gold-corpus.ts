import type { DocumentMemoryIngestionCategory } from "./document-memory-ingestion-types.js";
import type {
  MemoryCanonicalClass,
  MemorySemanticCorrectionObject,
  MemorySemanticPreferenceObject,
  MemorySemanticObjectKind,
  MemorySemanticProcedureObject,
  MemorySemanticProjectFactObject,
} from "./memory-semantic-interpretation.js";
import type {
  MemorySourceEnvelope,
  NormalizedTranscriptContextEntry,
} from "./memory-source-normalization.js";

export type MemorySemanticGoldExpectedObject = {
  id: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: MemorySemanticObjectKind;
  category?: DocumentMemoryIngestionCategory;
  correctionKind?: MemorySemanticCorrectionObject["correctionKind"];
  preferenceProfile?: MemorySemanticPreferenceObject["preferenceProfile"];
  workflowProfile?: MemorySemanticCorrectionObject["workflowProfile"];
  procedureKey?: MemorySemanticProcedureObject["procedureKey"];
  factFieldKey?: MemorySemanticProjectFactObject["factFieldKey"];
  subjectIncludes?: string[];
  instructionIncludes?: string[];
  valueIncludes?: string[];
  recommendedActionIncludes?: string[];
  avoidActionIncludes?: string[];
  neededCapabilityIncludes?: string[];
  rationaleTextIncludes?: string[];
  taskIncludes?: string[];
  primaryResourceIncludes?: string[];
  companionResourceIncludes?: string[];
  procedure?: {
    titleIncludes?: string[];
    stepIncludes?: string[];
    exactStepCount?: number;
  };
  projectScope?: string;
  guidancePattern?: string;
  forbidEvidencePrefixes?: string[];
  requireEvidencePrefixes?: string[];
  headingPath?: string[];
  lineStart?: number;
  allowedLineStarts?: number[];
  duplicateCountAtLeast?: number;
};

export type MemorySemanticGoldForbiddenObject = {
  reason: string;
  canonicalClass?: MemoryCanonicalClass;
  kind?: MemorySemanticObjectKind;
  category?: DocumentMemoryIngestionCategory;
  subjectIncludes?: string[];
  instructionIncludes?: string[];
  valueIncludes?: string[];
  taskIncludes?: string[];
  primaryResourceIncludes?: string[];
  recommendedActionIncludes?: string[];
  avoidActionIncludes?: string[];
};

export type MemorySemanticGoldCase = {
  id: string;
  title: string;
  lane: "document_ingestion" | "ordinary_turn_capture";
  source: MemorySourceEnvelope;
  content?: string;
  text?: string;
  projectScope?: string;
  workflowScope?: string;
  parentContext?: NormalizedTranscriptContextEntry[];
  expected: {
    exactCount?: number;
    minCount?: number;
    maxCount?: number;
    classCounts?: Partial<Record<MemoryCanonicalClass, number>>;
    classMinimums?: Partial<Record<MemoryCanonicalClass, number>>;
    categoryCounts?: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    categoryMinimums?: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    requiredObjects: MemorySemanticGoldExpectedObject[];
    forbiddenObjects: MemorySemanticGoldForbiddenObject[];
    notes: string[];
  };
};

export const MEMORY_SEMANTIC_GOLD_CORPUS: MemorySemanticGoldCase[] = [
  {
    id: "identity_response_defaults",
    title: "Identity defaults with one omission",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:identity-defaults",
      path: "benchmarks/identity-defaults.md",
      sourceClass: "identity",
    },
    content: [
      "# User profile",
      "",
      "## Response defaults",
      "plain english please",
      "plz keep it short",
      "",
      "## File references",
      "When referencing files in chat, use repo-root relative paths.",
      "",
      "## Noise",
      "remember this later maybe",
    ].join("\n"),
    expected: {
      exactCount: 3,
      categoryCounts: { response_style: 3 },
      requiredObjects: [
        {
          id: "plain_english",
          canonicalClass: "user",
          kind: "preference",
          category: "response_style",
          preferenceProfile: "plain_english",
          instructionIncludes: ["plain english"],
          lineStart: 4,
        },
        {
          id: "concise",
          canonicalClass: "user",
          kind: "preference",
          category: "response_style",
          preferenceProfile: "concise",
          instructionIncludes: ["short"],
          lineStart: 5,
        },
        {
          id: "repo_relative",
          canonicalClass: "user",
          kind: "preference",
          category: "response_style",
          instructionIncludes: ["repo-root relative paths"],
          lineStart: 8,
        },
      ],
      forbiddenObjects: [
        {
          reason: "low-signal filler should stay out",
          instructionIncludes: ["remember this later maybe"],
        },
      ],
      notes: ["Identity capture should keep durable defaults and omit filler."],
    },
  },
  {
    id: "project_operating_implicit_scope",
    title: "Project operating doc with heading-carried project scope",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:project-operating",
      path: "benchmarks/project-operating-implicit-scope.md",
      projectId: "atlas-forge",
      sourceClass: "project_operating",
    },
    content: [
      "# Atlas Forge Operating Notes",
      "",
      "## Branches",
      "Default branch is atlas-main.",
      "Staging branch is atlas-staging.",
      "",
      "## Docs",
      "Update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
    ].join("\n"),
    projectScope: "atlas forge",
    expected: {
      exactCount: 3,
      categoryCounts: { project_fact: 2, project_rule: 1 },
      requiredObjects: [
        {
          id: "default_branch",
          canonicalClass: "project",
          kind: "project_fact",
          category: "project_fact",
          subjectIncludes: ["default branch"],
          valueIncludes: ["atlas-main"],
          projectScope: "atlas forge",
          lineStart: 4,
        },
        {
          id: "staging_branch",
          canonicalClass: "project",
          kind: "project_fact",
          category: "project_fact",
          subjectIncludes: ["staging branch"],
          valueIncludes: ["atlas-staging"],
          projectScope: "atlas forge",
          lineStart: 5,
        },
        {
          id: "docs_rule",
          canonicalClass: "feedback",
          kind: "correction",
          category: "project_rule",
          correctionKind: "project_rule",
          subjectIncludes: ["docs"],
          recommendedActionIncludes: ["english docs first"],
          projectScope: "atlas forge",
          lineStart: 8,
        },
      ],
      forbiddenObjects: [],
      notes: [
        "Scope should come from the document envelope and headings, not repeated inline restatement.",
      ],
    },
  },
  {
    id: "workflow_runbook_procedure_and_rule",
    title: "Runbook with a reusable procedure and a durable readiness rule",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:workflow-runbook",
      path: "benchmarks/workflow-runbook.md",
      projectId: "atlas-forge",
      sourceClass: "workflow_runbook",
    },
    content: [
      "# Atlas Forge Rollout Runbook",
      "",
      "## Rollback Verification Checklist",
      "1. Confirm the rollback version.",
      "2. Verify the key health checks.",
      "",
      "## Readiness",
      "Trust /readyz for rollout readiness here; /healthz is only liveness.",
    ].join("\n"),
    expected: {
      exactCount: 2,
      categoryCounts: { recurring_procedure: 1, workflow_improvement: 1 },
      requiredObjects: [
        {
          id: "rollback_checklist",
          canonicalClass: "feedback",
          kind: "procedure",
          category: "recurring_procedure",
          procedure: {
            titleIncludes: ["rollback verification checklist"],
            stepIncludes: ["rollback version", "key health checks"],
            exactStepCount: 2,
          },
          forbidEvidencePrefixes: ["deterministic_"],
          lineStart: 4,
        },
        {
          id: "readiness_rule",
          canonicalClass: "feedback",
          kind: "correction",
          category: "workflow_improvement",
          correctionKind: "workflow_guidance",
          subjectIncludes: ["rollout readiness"],
          recommendedActionIncludes: ["/readyz"],
          avoidActionIncludes: ["/healthz"],
          lineStart: 8,
        },
      ],
      forbiddenObjects: [],
      notes: [
        "A titled checklist should become one reusable procedure, not fragmented line memories.",
      ],
    },
  },
  {
    id: "turn_preference_correction",
    title: "Reply-form preference correction with no explicit future-memory phrasing",
    lane: "ordinary_turn_capture",
    source: {
      kind: "transcript",
      sourceId: "gold:turn-preference",
      sessionKey: "gold-session-preference",
      sourceClass: "turn_capture",
    },
    text: "No, use plain English, not jargon.",
    parentContext: [
      {
        role: "assistant",
        text: "Here is a jargon-heavy explanation of the runtime invariants.",
      },
    ],
    expected: {
      exactCount: 1,
      categoryCounts: { response_style: 1 },
      requiredObjects: [
        {
          id: "plain_english_preference",
          canonicalClass: "user",
          kind: "correction",
          category: "response_style",
          correctionKind: "response_preference",
          subjectIncludes: ["response language"],
          recommendedActionIncludes: ["plain english"],
        },
      ],
      forbiddenObjects: [],
      notes: [
        "Reply-form preference corrections should still capture as stable response-style guidance.",
      ],
    },
  },
  {
    id: "turn_project_fact_implicit_scope",
    title: "Turn-level project fact correction with scope only in parent context",
    lane: "ordinary_turn_capture",
    source: {
      kind: "transcript",
      sourceId: "gold:turn-project-fact",
      sessionKey: "gold-session-project-fact",
      sourceClass: "turn_capture",
    },
    text: "Default branch is atlas-main.",
    parentContext: [
      {
        role: "system",
        text: "For project atlas forge, branch settings are under review.",
      },
    ],
    expected: {
      exactCount: 1,
      categoryCounts: { project_fact: 1 },
      requiredObjects: [
        {
          id: "project_fact_branch",
          canonicalClass: "project",
          kind: "project_fact",
          category: "project_fact",
          subjectIncludes: ["default branch"],
          valueIncludes: ["atlas-main"],
          projectScope: "atlas forge",
        },
      ],
      forbiddenObjects: [],
      notes: [
        "Turn capture should recover project scope from parent context without normalization pre-typing it.",
      ],
    },
  },
  {
    id: "real_slice_workflow_doc",
    title: "Real live workflow doc with procedure, routing, and workflow guidance",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:real-slice-workflow",
      path: "docs/help/slice-workflow.md",
      sourceClass: "workflow_runbook",
    },
    content: [
      "# Slice workflow",
      "",
      "Use it with Testing and the existing release policy in Release Policy.",
      "Use the concrete landing tiers in Landing Gate Tiers when you want the repo's default feature, integration, or production bar.",
      "",
      "## Default phase order",
      "1. Implementation loop",
      "2. Pre-proof gate",
      "3. Isolated proof, when required",
      "4. Pre-production gate, when required",
      "5. Production proof, when required",
      "6. Finalize docs and closeout evidence",
      "7. Pre-landing gate",
      "8. Commit and push",
      "9. Post-push verification",
      "",
      "## Readiness",
      "Trust /readyz as the actual readiness gate; /healthz is shallow liveness only.",
    ].join("\n"),
    expected: {
      minCount: 4,
      categoryMinimums: {
        recurring_procedure: 1,
        workflow_improvement: 1,
        reference_routing: 2,
      },
      requiredObjects: [
        {
          id: "companion_docs",
          canonicalClass: "reference",
          kind: "routing",
          category: "reference_routing",
          primaryResourceIncludes: ["testing"],
          companionResourceIncludes: ["release policy"],
        },
        {
          id: "default_phase_order",
          canonicalClass: "feedback",
          kind: "procedure",
          category: "recurring_procedure",
          procedure: {
            titleIncludes: ["default phase order"],
            stepIncludes: ["implementation loop", "pre-proof gate", "post-push verification"],
          },
        },
        {
          id: "readyz_rule",
          canonicalClass: "feedback",
          kind: "correction",
          category: "workflow_improvement",
          correctionKind: "workflow_guidance",
          recommendedActionIncludes: ["/readyz"],
          avoidActionIncludes: ["/healthz"],
        },
      ],
      forbiddenObjects: [
        {
          reason: "generic explanatory prose should not dominate the capture set",
          taskIncludes: ["does not replace existing hard gates"],
        },
      ],
      notes: [
        "This uses an audited excerpt from a real live document so the benchmark stays reviewable and operationally tractable while still proving generalization beyond synthetic fixtures.",
      ],
    },
  },
  {
    id: "duplicate_paraphrase_docs_rule",
    title: "Duplicate paraphrases collapse to one project rule winner",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:duplicate-docs-rule",
      path: "benchmarks/duplicate-docs-rule.md",
      projectId: "atlas-forge",
      sourceClass: "project_operating",
    },
    content: [
      "# Atlas Forge Docs Workflow",
      "",
      "Update the English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
      "Do not edit docs/zh-CN directly; update English first, then rerun docs i18n.",
    ].join("\n"),
    projectScope: "atlas forge",
    expected: {
      exactCount: 1,
      categoryCounts: { project_rule: 1 },
      requiredObjects: [
        {
          id: "deduped_docs_rule",
          canonicalClass: "feedback",
          kind: "correction",
          category: "project_rule",
          correctionKind: "project_rule",
          subjectIncludes: ["docs"],
          recommendedActionIncludes: ["english docs first"],
          projectScope: "atlas forge",
          duplicateCountAtLeast: 1,
        },
      ],
      forbiddenObjects: [],
      notes: ["Paraphrase duplicates should collapse into one winner with duplicate evidence."],
    },
  },
  {
    id: "mixed_signal_routing_doc",
    title: "Mixed-signal doc keeps routing guidance and omits filler",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:mixed-signal-routing",
      path: "benchmarks/mixed-signal-routing.md",
      sourceClass: "reference",
    },
    content: [
      "# Rollout notes",
      "",
      "Use this doc with Testing and Release Policy when deciding the validation bar.",
      "I wrote this after coffee and may rewrite it later.",
      "Use Landing Gate Tiers when you need the repo's default feature, integration, or production bar.",
    ].join("\n"),
    expected: {
      exactCount: 2,
      categoryCounts: { reference_routing: 2 },
      requiredObjects: [
        {
          id: "testing_release_policy_routing",
          canonicalClass: "reference",
          kind: "routing",
          category: "reference_routing",
          taskIncludes: ["validation bar"],
          primaryResourceIncludes: ["testing"],
          companionResourceIncludes: ["release policy"],
        },
        {
          id: "landing_gate_tiers_routing",
          canonicalClass: "reference",
          kind: "routing",
          category: "reference_routing",
          primaryResourceIncludes: ["landing gate tiers"],
        },
      ],
      forbiddenObjects: [
        {
          reason: "narrative filler should stay out",
          taskIncludes: ["after coffee"],
        },
      ],
      notes: ["Routing guidance should survive mixed-signal docs while filler stays out."],
    },
  },
  {
    id: "turn_docs_rule_contextual_correction",
    title: "Reply-form correction inherits docs workflow scope from context",
    lane: "ordinary_turn_capture",
    source: {
      kind: "transcript",
      sourceId: "gold:turn-docs-correction",
      sessionKey: "gold-session-docs-correction",
      sourceClass: "turn_capture",
    },
    text: "No, not in zh-CN directly.",
    parentContext: [
      {
        role: "system",
        text: "For project atlas forge docs workflow, update the English docs first, then rerun docs i18n.",
      },
    ],
    expected: {
      exactCount: 1,
      categoryCounts: { project_rule: 1 },
      requiredObjects: [
        {
          id: "docs_correction_scope",
          canonicalClass: "feedback",
          kind: "correction",
          category: "project_rule",
          correctionKind: "project_rule",
          subjectIncludes: ["docs"],
          avoidActionIncludes: ["zh-cn"],
          recommendedActionIncludes: ["docs i18n"],
          projectScope: "atlas forge",
        },
      ],
      forbiddenObjects: [],
      notes: [
        "A terse correction should still recover project and workflow scope from parent context.",
      ],
    },
  },
  {
    id: "response_style_model_owned_validation",
    title: "Response-style benchmark detects validator semantic reconstruction",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:model-owned-response-style",
      path: "benchmarks/model-owned-response-style.md",
      sourceClass: "identity",
    },
    content: ["# Defaults", "", "Use plain English.", "Keep responses concise."].join("\n"),
    expected: {
      exactCount: 2,
      categoryCounts: { response_style: 2 },
      requiredObjects: [
        {
          id: "response_language_plain_english",
          kind: "preference",
          category: "response_style",
          subjectIncludes: ["response language"],
          instructionIncludes: ["plain english"],
          forbidEvidencePrefixes: ["deterministic_"],
        },
        {
          id: "response_style_concise",
          kind: "preference",
          category: "response_style",
          subjectIncludes: ["response style"],
          instructionIncludes: ["concise"],
          forbidEvidencePrefixes: ["deterministic_"],
        },
      ],
      forbiddenObjects: [],
      notes: [
        "These cases should fail until the validator stops reconstructing response-style meaning from regex templates.",
      ],
    },
  },
  {
    id: "procedure_model_owned_validation",
    title: "Procedure benchmark detects validator-owned procedure reconstruction",
    lane: "document_ingestion",
    source: {
      kind: "document",
      sourceId: "gold:model-owned-procedure",
      path: "benchmarks/model-owned-procedure.md",
      sourceClass: "workflow_runbook",
    },
    content: [
      "# Release Handoff",
      "",
      "## Finalize checklist",
      "1. Freeze the proof plan.",
      "2. Capture the rollback reference.",
      "3. Confirm the worktree still matches the proofed code.",
    ].join("\n"),
    expected: {
      exactCount: 1,
      categoryCounts: { recurring_procedure: 1 },
      requiredObjects: [
        {
          id: "finalize_procedure",
          kind: "procedure",
          category: "recurring_procedure",
          procedure: {
            titleIncludes: ["finalize checklist"],
            stepIncludes: ["proof plan", "rollback reference", "proofed code"],
            exactStepCount: 3,
          },
          forbidEvidencePrefixes: ["deterministic_"],
        },
      ],
      forbiddenObjects: [],
      notes: [
        "This case should fail until procedures are validated as model-owned structured outputs instead of being rebuilt by deterministic parsing.",
      ],
    },
  },
];
