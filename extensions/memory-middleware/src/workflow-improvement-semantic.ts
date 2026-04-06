import { createHash } from "node:crypto";

export const WORKFLOW_IMPROVEMENT_LESSON_KEYS = [
  "vitest_wrapper_required",
  "scripts_committer_required",
  "git_stash_unsafe",
] as const;

export const WORKFLOW_IMPROVEMENT_TOOL_KEYS = ["vitest", "scripts_committer", "git_stash"] as const;

export type WorkflowImprovementLessonKey = (typeof WORKFLOW_IMPROVEMENT_LESSON_KEYS)[number];
export type WorkflowImprovementToolKey = (typeof WORKFLOW_IMPROVEMENT_TOOL_KEYS)[number];
export type WorkflowImprovementSemanticConfidence = "high" | "medium";

export type WorkflowImprovementCanonicalMatch = {
  captureClass: "workflow_tool_gotcha";
  candidateKind: "improvement";
  reasonCode: "workflow_tool_gotcha_statement";
  template: "workflow_tool_gotcha";
  lessonKey: WorkflowImprovementLessonKey;
  toolKey: WorkflowImprovementToolKey;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
};

export type WorkflowImprovementSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: WorkflowImprovementSemanticConfidence;
      evidence: string[];
      match: WorkflowImprovementCanonicalMatch;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

type WorkflowImprovementSpec = {
  toolKey: WorkflowImprovementToolKey;
  subject: string;
  value: string;
  content: string;
};

const WORKFLOW_IMPROVEMENT_SPECS: Record<WorkflowImprovementLessonKey, WorkflowImprovementSpec> = {
  vitest_wrapper_required: {
    toolKey: "vitest",
    subject: "test runner wrapper",
    value: "use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest",
    content:
      "Workflow improvement: use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest so the repo test wrapper stays active.",
  },
  scripts_committer_required: {
    toolKey: "scripts_committer",
    subject: "scoped commit workflow",
    value: 'use scripts/committer "<msg>" <file...> instead of manual git add / git commit',
    content:
      'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
  },
  git_stash_unsafe: {
    toolKey: "git_stash",
    subject: "multi-agent git state safety",
    value: "do not use git stash during multi-agent repo work",
    content:
      "Workflow improvement: do not use git stash during multi-agent repo work because it can disturb concurrent work.",
  },
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function normalizeSemanticText(value: string): string {
  return normalizeLower(value)
    .replace(/[’']/g, "")
    .replace(/\bpnpm\s+test\s+--\b/g, "pnpm test")
    .replace(/\braw\s+vitest\b/g, "vitest")
    .replace(/\bscripts\s*\/\s*committer\b/g, "scripts/committer")
    .replace(/\bgit\s+add\s*\/\s*git\s+commit\b/g, "git add git commit")
    .replace(/[^a-z0-9\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWorkflowImprovementKey(params: {
  lessonKey: WorkflowImprovementLessonKey;
  normalizedValue: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-v1",
        "workflow_tool_gotcha",
        params.lessonKey,
        params.normalizedValue,
      ].join("|"),
    )
    .digest("hex");
}

function buildWorkflowImprovementSubjectKey(params: {
  lessonKey: WorkflowImprovementLessonKey;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "workflow-improvement-subject-v1",
        "workflow_tool_gotcha",
        params.lessonKey,
      ].join("|"),
    )
    .digest("hex");
}

function createMatch(lessonKey: WorkflowImprovementLessonKey): WorkflowImprovementCanonicalMatch {
  const spec = WORKFLOW_IMPROVEMENT_SPECS[lessonKey];
  const normalizedSubject = normalizeLower(spec.subject);
  const normalizedValue = normalizeLower(spec.value);
  return {
    captureClass: "workflow_tool_gotcha",
    candidateKind: "improvement",
    reasonCode: "workflow_tool_gotcha_statement",
    template: "workflow_tool_gotcha",
    lessonKey,
    toolKey: spec.toolKey,
    subject: spec.subject,
    value: spec.value,
    normalizedSubject,
    normalizedValue,
    content: spec.content,
    subjectKey: buildWorkflowImprovementSubjectKey({ lessonKey }),
    key: buildWorkflowImprovementKey({
      lessonKey,
      normalizedValue,
    }),
  };
}

function detectVitestLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    (/\buse pnpm test\b/.test(normalized) &&
      /\b(?:instead of|not)\b/.test(normalized) &&
      /\bvitest\b/.test(normalized)) ||
    (/\b(?:do not|dont|avoid|never)\b/.test(normalized) &&
      /\bvitest\b/.test(normalized) &&
      /\bpnpm test\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_vitest", "wrapper_command", "replacement_phrase"],
    };
  }

  if (
    /\bvitest\b/.test(normalized) &&
    (/\bwrapper\b/.test(normalized) ||
      /\bskips\b/.test(normalized) ||
      /\bbypasses\b/.test(normalized)) &&
    /\bpnpm test\b/.test(normalized)
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_vitest", "wrapper_reference", "pnpm_test_reference"],
    };
  }

  return null;
}

function detectScriptsCommitterLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    /\bscripts\/committer\b/.test(normalized) &&
    ((/\b(?:instead of|not)\b/.test(normalized) &&
      /\bgit add\b/.test(normalized) &&
      /\bgit commit\b/.test(normalized)) ||
      /\buse\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_scripts_committer", "commit_guidance", "replacement_phrase"],
    };
  }

  if (
    /\bscripts\/committer\b/.test(normalized) &&
    (/\bcommit\b/.test(normalized) ||
      /\bstaging\b/.test(normalized) ||
      /\bscoped\b/.test(normalized))
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_scripts_committer", "commit_context"],
    };
  }

  return null;
}

function detectGitStashLesson(normalized: string): {
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
} | null {
  if (
    /\bgit stash\b/.test(normalized) &&
    /\b(?:do not|dont|avoid|never)\b/.test(normalized) &&
    (/\bmulti agent\b/.test(normalized) ||
      /\bconcurrent\b/.test(normalized) ||
      /\bthis repo\b/.test(normalized) ||
      /\bthis repository\b/.test(normalized) ||
      /\bhere\b/.test(normalized))
  ) {
    return {
      confidence: "high",
      evidence: ["tool_git_stash", "avoidance_phrase", "repo_context"],
    };
  }

  if (
    /\bgit stash\b/.test(normalized) &&
    (/\brisky\b/.test(normalized) ||
      /\bunsafe\b/.test(normalized) ||
      /\bdangerous\b/.test(normalized) ||
      /\bmulti agent\b/.test(normalized) ||
      /\bconcurrent\b/.test(normalized))
  ) {
    return {
      confidence: "medium",
      evidence: ["tool_git_stash", "risk_phrase"],
    };
  }

  return null;
}

export function isSupportedWorkflowImprovementLessonKey(
  value: string,
): value is WorkflowImprovementLessonKey {
  return WORKFLOW_IMPROVEMENT_LESSON_KEYS.includes(value as WorkflowImprovementLessonKey);
}

export function getWorkflowImprovementSpec(
  lessonKey: WorkflowImprovementLessonKey,
): WorkflowImprovementSpec {
  return WORKFLOW_IMPROVEMENT_SPECS[lessonKey];
}

export function detectWorkflowImprovementSemanticDecision(
  text: string,
): WorkflowImprovementSemanticCaptureDecision {
  const normalized = normalizeSemanticText(text);
  if (!normalized || normalized.length < 18 || normalized.length > 220) {
    return {
      action: "ignore",
      reason: "out_of_bounds",
      evidence: [],
    };
  }

  const vitest = detectVitestLesson(normalized);
  if (vitest) {
    return {
      action: "capture",
      confidence: vitest.confidence,
      evidence: vitest.evidence,
      match: createMatch("vitest_wrapper_required"),
    };
  }

  const scriptsCommitter = detectScriptsCommitterLesson(normalized);
  if (scriptsCommitter) {
    return {
      action: "capture",
      confidence: scriptsCommitter.confidence,
      evidence: scriptsCommitter.evidence,
      match: createMatch("scripts_committer_required"),
    };
  }

  const gitStash = detectGitStashLesson(normalized);
  if (gitStash) {
    return {
      action: "capture",
      confidence: gitStash.confidence,
      evidence: gitStash.evidence,
      match: createMatch("git_stash_unsafe"),
    };
  }

  return {
    action: "ignore",
    reason: "unsupported_or_ambiguous_workflow_signal",
    evidence: [],
  };
}
