export const REAL_WORKSPACE_NATIVE_WORKFLOW_PACKET = {
  id: "repo-test-wrapper",
  submissionKind: "improvement",
  content:
    "Use pnpm test -- <path-or-filter> [vitest args...] instead of raw vitest so the repo test wrapper stays active.",
  retrievalQuery: "should I use pnpm test or raw vitest here?",
  advisoryQuery: "should I use pnpm test or raw vitest here?",
  expectedToolKey: "vitest",
  expectedProvenance: "native_capture",
} as const;

export const REAL_WORKSPACE_SELF_IMPROVING_WORKFLOW_PACKET = {
  id: "repo-scoped-commits",
  kind: "improvement",
  content:
    'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
  retrievalQuery: "should I use scripts/committer instead of manual git add and git commit here?",
  advisoryQuery: "how should I make a scoped commit in this repo?",
  expectedToolKey: "scripts_committer",
  expectedProvenance: "self_improving_capture",
} as const;

export const REAL_WORKSPACE_PROJECT_RULE_PACKET = {
  id: "repo-docs-i18n-rule",
  submissionKind: "improvement",
  content:
    "For project OpenClaw docs, update English docs first and rerun docs i18n instead of editing docs/zh-CN directly.",
  retrievalQuery:
    "for localized docs should I edit docs/zh-CN directly or rerun docs i18n after updating English?",
} as const;

export const REAL_WORKSPACE_PROJECT_FACT_PACKET = {
  id: "repo-docs-url",
  submissionKind: "learning",
  content: "Project fact [openclaw]: documentation URL is https://docs.openclaw.ai/.",
  metadata: {
    category: "project_fact",
    source: "explicit_project_fact",
    autoCapture: {
      captureClass: "explicit_project_fact",
      template: "project_fact_named_scope",
      fieldKey: "documentation_url",
      subjectKey: "openclaw-documentation-url",
      key: "openclaw-documentation-url-docs-site",
      subject: "openclaw / documentation URL",
      value: "https://docs.openclaw.ai/",
      projectScope: "openclaw",
    },
  },
  retrievalQuery: "what is the openclaw documentation URL?",
} as const;

export const REAL_WORKSPACE_RESPONSE_STYLE_PACKET = {
  id: "user-high-level-by-default",
  submissionKind: "learning",
  content: "By default, keep explanations high level unless I ask for more detail.",
  metadata: {
    category: "user_requirement",
    source: "explicit_user_requirement",
    autoCapture: {
      captureClass: "explicit_requirement",
      template: "response_style_generalized_guidance",
      responseStyleFamily: "generalized_guidance",
      subjectKey: "rs-detail-high-level",
      key: "rs-detail-high-level-unless-asked",
      subject: "response detail level",
      normalizedSubject: "response detail level",
      value: "keep explanations high level unless I ask for more detail",
      normalizedValue: "keep explanations high level unless I ask for more detail",
    },
  },
  retrievalQuery: "response detail level high level unless asked for more detail",
} as const;
