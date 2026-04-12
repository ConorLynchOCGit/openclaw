import type { DocumentMemoryIngestionCategory } from "./document-memory-ingestion-types.js";
import type {
  MemorySourceEnvelope,
  NormalizedTranscriptContextEntry,
} from "./memory-source-normalization.js";

export type MemorySemanticGoldExpectedCandidate = {
  id: string;
  category: DocumentMemoryIngestionCategory;
  statementIncludes: string[];
  headingPath?: string[];
  lineStart?: number;
  allowedLineStarts?: number[];
  duplicateCountAtLeast?: number;
};

export type MemorySemanticGoldForbiddenCandidate = {
  reason: string;
  statementIncludes: string[];
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
    categoryCounts?: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    categoryMinimums?: Partial<Record<DocumentMemoryIngestionCategory, number>>;
    requiredCandidates: MemorySemanticGoldExpectedCandidate[];
    forbiddenCandidates: MemorySemanticGoldForbiddenCandidate[];
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
      requiredCandidates: [
        {
          id: "plain_english",
          category: "response_style",
          statementIncludes: ["plain english"],
          lineStart: 4,
        },
        {
          id: "concise",
          category: "response_style",
          statementIncludes: ["concise"],
          lineStart: 5,
        },
        {
          id: "repo_relative",
          category: "response_style",
          statementIncludes: ["repo-root relative paths"],
          lineStart: 8,
        },
      ],
      forbiddenCandidates: [
        {
          reason: "low-signal filler should stay out",
          statementIncludes: ["remember this later maybe"],
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
      requiredCandidates: [
        {
          id: "default_branch",
          category: "project_fact",
          statementIncludes: ["atlas-main"],
          lineStart: 4,
        },
        {
          id: "staging_branch",
          category: "project_fact",
          statementIncludes: ["atlas-staging"],
          lineStart: 5,
        },
        {
          id: "docs_rule",
          category: "project_rule",
          statementIncludes: ["english docs first", "docs i18n"],
          lineStart: 8,
        },
      ],
      forbiddenCandidates: [],
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
      requiredCandidates: [
        {
          id: "rollback_checklist",
          category: "recurring_procedure",
          statementIncludes: ["rollback version", "key health checks"],
          lineStart: 4,
        },
        {
          id: "readiness_rule",
          category: "workflow_improvement",
          statementIncludes: ["/readyz", "/healthz"],
          lineStart: 8,
        },
      ],
      forbiddenCandidates: [],
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
      requiredCandidates: [
        {
          id: "plain_english_preference",
          category: "response_style",
          statementIncludes: ["plain english"],
        },
      ],
      forbiddenCandidates: [],
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
      requiredCandidates: [
        {
          id: "project_fact_branch",
          category: "project_fact",
          statementIncludes: ["atlas-main"],
        },
      ],
      forbiddenCandidates: [],
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
    expected: {
      minCount: 8,
      categoryMinimums: {
        recurring_procedure: 4,
        workflow_improvement: 2,
        reference_routing: 1,
      },
      requiredCandidates: [
        {
          id: "companion_docs",
          category: "reference_routing",
          statementIncludes: ["testing", "release policy"],
        },
        {
          id: "default_phase_order",
          category: "recurring_procedure",
          statementIncludes: ["implementation loop", "pre-proof gate", "post-push verification"],
        },
        {
          id: "readyz_rule",
          category: "workflow_improvement",
          statementIncludes: ["/readyz", "/healthz"],
        },
      ],
      forbiddenCandidates: [
        {
          reason: "generic explanatory prose should not dominate the capture set",
          statementIncludes: ["does not replace existing hard gates"],
        },
      ],
      notes: ["Real docs should prove the live benchmark is not limited to synthetic fixtures."],
    },
  },
];
