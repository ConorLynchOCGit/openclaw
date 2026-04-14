import type { ModelMemoryObject } from "../semantic-schema.ts";

export type AuditedProofCase = {
  id: string;
  sourceKind: "document" | "ordinary_turn";
  text: string;
  expectedAction: "capture" | "ignore";
  expectedObjects: ModelMemoryObject[];
  expectedWriteDecision?: "write" | "dedupe" | "supersede";
  expectedDuplicateOfCaseId?: string;
  expectedSupersededCaseId?: string;
};

function provenancePlaceholder(): ModelMemoryObject["provenance"] {
  return [{ sourceId: "window-placeholder", segmentIndex: 0, headingPath: [] }];
}

export const DOCUMENT_PROOF_CASES: AuditedProofCase[] = [
  {
    id: "doc-001-user-preferences",
    sourceKind: "document",
    text: "User profile for user-001:\n- Keep answers concise.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "user",
        kind: "preference",
        payload: {
          subject: "response style",
          instruction: "keep answers concise",
          operation: "prefer",
        },
        scope: { userScope: "user-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "doc-002-project-facts",
    sourceKind: "document",
    text: "Project notes for project-001:\n- Deployment region: region-001.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "doc-003-standing-rule",
    sourceKind: "document",
    text: "Operating rule for project-001:\n- Use gate-command-001 before landing.\n- Do not use manual-command-001 for that step.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "feedback",
        kind: "rule",
        payload: {
          subject: "landing gate",
          recommendedAction: "use gate-command-001 before landing",
          avoidAction: "use manual-command-001 for that step",
        },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "doc-004-procedure",
    sourceKind: "document",
    text: "Checklist procedure-001:\n1. Run check-001.\n2. Record artifact-001.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "feedback",
        kind: "procedure",
        payload: {
          title: "procedure-001",
          steps: ["run check-001", "record artifact-001"],
        },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "doc-005-reference",
    sourceKind: "document",
    text: "When working on task-001, start with resource-001 and then consult resource-002 if needed.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "reference",
        kind: "reference",
        payload: {
          task: "task-001",
          primaryResource: "resource-001",
          companionResources: ["resource-002"],
        },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "doc-006-ignore",
    sourceKind: "document",
    text: "Status chatter:\n- Thanks\n- Sounds good\n- Talk later",
    expectedAction: "ignore",
    expectedObjects: [],
  },
];

export const ORDINARY_TURN_PROOF_CASES: AuditedProofCase[] = [
  {
    id: "turn-001-explicit-preference",
    sourceKind: "ordinary_turn",
    text: "Please keep explanations high level by default.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "user",
        kind: "preference",
        payload: {
          subject: "response detail",
          instruction: "keep explanations high level",
          operation: "prefer",
        },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "turn-002-explicit-fact",
    sourceKind: "ordinary_turn",
    text: "For project-001, the deployment region is region-001.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "turn-003-explicit-rule",
    sourceKind: "ordinary_turn",
    text: "Before landing in project-001, use gate-command-001 and do not use manual-command-001 for that step.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "feedback",
        kind: "rule",
        payload: {
          subject: "landing gate",
          recommendedAction: "use gate-command-001 before landing",
          avoidAction: "use manual-command-001 for that step",
        },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "turn-004-explicit-procedure",
    sourceKind: "ordinary_turn",
    text: "Procedure-001 is: first run check-001, then record artifact-001.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "feedback",
        kind: "procedure",
        payload: { title: "procedure-001", steps: ["run check-001", "record artifact-001"] },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "turn-005-explicit-reference",
    sourceKind: "ordinary_turn",
    text: "For task-001, start with resource-001 and consult resource-002 if needed.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "reference",
        kind: "reference",
        payload: {
          task: "task-001",
          primaryResource: "resource-001",
          companionResources: ["resource-002"],
        },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "write",
  },
  {
    id: "turn-006-no-durable-memory",
    sourceKind: "ordinary_turn",
    text: "Thanks, that looks good for now.",
    expectedAction: "ignore",
    expectedObjects: [],
  },
  {
    id: "turn-007-duplicate",
    sourceKind: "ordinary_turn",
    text: "For project-001, the deployment region is region-001.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "dedupe",
    expectedDuplicateOfCaseId: "turn-002-explicit-fact",
  },
  {
    id: "turn-008-supersession",
    sourceKind: "ordinary_turn",
    text: "Correction for project-001: the deployment region is region-002.",
    expectedAction: "capture",
    expectedObjects: [
      {
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-002" },
        scope: { projectId: "project-001", projectScope: "project-001" },
        provenance: provenancePlaceholder(),
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
    ],
    expectedWriteDecision: "supersede",
    expectedSupersededCaseId: "turn-002-explicit-fact",
  },
];
