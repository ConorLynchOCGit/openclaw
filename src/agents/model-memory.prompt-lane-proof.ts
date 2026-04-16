import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionTurnProofPrompt } from "./model-memory.session-turn-proof.ts";
import {
  renderSessionTurnProofMarkdown,
  renderSessionTurnProofPromptsMarkdown,
  type SessionTurnProofReport,
} from "./model-memory.session-turn-proof.ts";

export const DURABLE_PROMPT_PROOF_PROMPTS: SessionTurnProofPrompt[] = [
  {
    id: "durable-001-high-level-and-blockers",
    order: 1,
    title: "High Level Responses And Exact Blockers",
    text: [
      "For work in the openclaw repo, keep explanations high level by default unless I ask for more detail.",
      "Use repo-root relative file references in reports.",
      "If a required gate fails, report the exact blocker and command instead of guessing.",
    ].join(" "),
    selectionReason:
      "Stable response-style and reporting preferences that should behave like durable user guidance.",
  },
  {
    id: "durable-002-landing-gates",
    order: 2,
    title: "Landing Gate Policy",
    text: [
      "When changing code on main in openclaw, run pnpm check before landing.",
      "If the touched surface affects build output or module boundaries, also run pnpm build.",
      "Do not claim a clean landing if required gates are red.",
    ].join(" "),
    selectionReason: "Persistent repo operating rules with clear durable procedural value.",
  },
  {
    id: "durable-003-nano-defaults",
    order: 3,
    title: "Nano Defaults For Model Memory",
    text: [
      "For model-memory work, use openrouter/openai/gpt-5.4-nano for both pass 1 and pass 2 by default.",
      "Do not use openrouter/auto as the default lane.",
      "Keep max words per window at 1500 and request timeout at 180000 unless explicitly changed and reported.",
    ].join(" "),
    selectionReason:
      "Concrete long-lived operating defaults for the active clean-room memory lane.",
  },
  {
    id: "durable-004-clean-room-boundary",
    order: 4,
    title: "Clean Room Boundary",
    text: [
      "Do not modify legacy extensions/memory-middleware while working on the clean-room model-memory system.",
      "Keep new memory work inside extensions/model-memory and src/agents/model-memory files unless there is a justified runtime boundary seam.",
    ].join(" "),
    selectionReason: "Stable project-scope boundary instruction that should persist across turns.",
  },
  {
    id: "durable-005-safe-worktree-policy",
    order: 5,
    title: "Preserve Unrelated Worktree Changes",
    text: [
      "Preserve unrelated worktree changes.",
      "Do not revert unrelated files.",
      "Do not use destructive git commands like git reset --hard or git checkout -- unless I explicitly ask.",
    ].join(" "),
    selectionReason: "Durable safety constraints for repository operations.",
  },
  {
    id: "durable-006-evidence-discipline",
    order: 6,
    title: "Evidence And Reporting Discipline",
    text: [
      "For model-memory proof runs, produce durable JSON and Markdown artifacts under docs/projects/model-memory/evidence.",
      "Do not hand-edit evidence artifacts.",
      "Report exact commands, counts, and blockers honestly.",
    ].join(" "),
    selectionReason:
      "Persistent procedural guidance about proof artifacts and honesty requirements.",
  },
  {
    id: "durable-007-shared-two-pass-rule",
    order: 7,
    title: "Shared Two Pass Requirement",
    text: [
      "Prompt-only ordinary-turn capture should reuse the same shared two-pass ingestion framework as document ingestion.",
      "Do not keep a separate degraded extraction path for prompts.",
    ].join(" "),
    selectionReason: "Architectural constraint for the active prompt-only ingestion lane.",
  },
  {
    id: "durable-008-active-only-runtime-reads",
    order: 8,
    title: "Active Only Runtime Reads",
    text: [
      "Default runtime reads in model-memory should surface active objects only.",
      "Do not leak provisional or conflict_hold objects into ordinary retrieval and context assembly by default.",
    ].join(" "),
    selectionReason: "Stable runtime policy that should produce durable rule-like memory.",
  },
  {
    id: "durable-009-operator-surface",
    order: 9,
    title: "Operator Surface Constraint",
    text: [
      "For document ingestion from OpenClaw, keep the operator surface explicit and constrained.",
      "Use operator or admin tool invocation rather than autonomous background ingestion by default.",
    ].join(" "),
    selectionReason:
      "Durable operator policy for the newly exposed document-ingestion tool surface.",
  },
  {
    id: "durable-010-doc-links",
    order: 10,
    title: "Full Docs URLs",
    text: [
      "When I ask for documentation links, return full https://docs.openclaw.ai URLs instead of root-relative paths.",
    ].join(" "),
    selectionReason:
      "Simple long-lived docs-formatting preference that should be easy to capture if the prompt lane is useful.",
  },
];

export type ManualUiPromptExpectation = {
  promptId: string;
  title: string;
  promptText: string;
  whyDurable: string;
  expectedMemoryKinds: string[];
  expectedOutcome: string;
  operatorChecks: string[];
};

export const MANUAL_UI_PROMPT_PACK: ManualUiPromptExpectation[] = [
  {
    promptId: "durable-001-high-level-and-blockers",
    title: "High Level Responses And Exact Blockers",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[0].text,
    whyDurable:
      "It expresses stable response and reporting preferences rather than a one-off task.",
    expectedMemoryKinds: ["preference", "rule"],
    expectedOutcome:
      "At least one active preference or rule about response detail and exact blocker reporting.",
    operatorChecks: [
      "Confirm the prompt turn completed instead of silently ignoring due to transport failure.",
      "Check recent captured claims for a preference about high-level explanations or a rule about exact blockers.",
      "Verify any resulting write is active and not leaking provisional state into default reads.",
    ],
  },
  {
    promptId: "durable-002-landing-gates",
    title: "Landing Gate Policy",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[1].text,
    whyDurable: "It is a persistent project operating rule with clear procedural semantics.",
    expectedMemoryKinds: ["rule", "procedure"],
    expectedOutcome:
      "One or more active rules about running pnpm check and pnpm build before landing.",
    operatorChecks: [
      "Look for active claims that mention pnpm check and landing discipline.",
      "Confirm the write path did not invent unrelated semantics from the same prompt.",
    ],
  },
  {
    promptId: "durable-003-nano-defaults",
    title: "Nano Defaults For Model Memory",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[2].text,
    whyDurable:
      "It contains stable operational defaults that should recur across many model-memory turns.",
    expectedMemoryKinds: ["rule", "fact"],
    expectedOutcome:
      "Active memory about nano/nano defaults and the explicit 1500-word and 180000-ms settings.",
    operatorChecks: [
      "Check whether the system captured the nano/nano default rather than ignoring the prompt.",
      "Confirm any captured rule stays within the clean-room policy and does not broaden into unrelated model policy.",
    ],
  },
  {
    promptId: "durable-004-clean-room-boundary",
    title: "Clean Room Boundary",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[3].text,
    whyDurable: "It defines a long-lived codebase boundary, not a transient task request.",
    expectedMemoryKinds: ["rule"],
    expectedOutcome:
      "An active rule keeping work in extensions/model-memory and src/agents/model-memory*.",
    operatorChecks: [
      "Check for a rule-like active object instead of many sibling duplicates.",
      "Verify the write path did not produce a memory that authorizes legacy memory-middleware edits.",
    ],
  },
  {
    promptId: "durable-005-safe-worktree-policy",
    title: "Preserve Unrelated Worktree Changes",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[4].text,
    whyDurable: "It is a persistent git-safety policy that should be useful beyond one turn.",
    expectedMemoryKinds: ["rule"],
    expectedOutcome:
      "An active rule about preserving unrelated worktree changes and avoiding destructive git commands.",
    operatorChecks: [
      "Inspect recent write decisions for an active rule rather than ignore.",
      "Check that the resulting memory is specific enough to be useful but not bloated into many near-duplicates.",
    ],
  },
  {
    promptId: "durable-008-active-only-runtime-reads",
    title: "Active Only Runtime Reads",
    promptText: DURABLE_PROMPT_PROOF_PROMPTS[7].text,
    whyDurable: "It states a stable runtime rule for the current architecture.",
    expectedMemoryKinds: ["rule"],
    expectedOutcome:
      "An active rule that provisional and conflict_hold objects should not appear in default retrieval or context assembly.",
    operatorChecks: [
      "Check for an active rule tied to runtime reads rather than a vague summary.",
      "Verify the memory stays object-native and does not collapse lifecycle terms incorrectly.",
    ],
  },
];

export type ManualUiDocumentIngestionSmoke = {
  toolName: string;
  sourcePath: string;
  runId: string;
  recordPath: string;
  invocation: {
    sources: string[];
    runId: string;
    recordPath: string;
    chunkSize: number;
    maxConcurrency: number;
    resume: boolean;
    modelId: string;
    candidateModelId: string;
    requestTimeoutMs: number;
    requestSeed: number;
    maxWordsPerWindow: number;
  };
  verificationStatus: "verified_via_tool_smoke" | "manual_only";
  expectedOperatorChecks: string[];
  observedStatus?: string;
  observedTotals?: {
    docsAttempted: number;
    docsCompleted: number;
    docsFailed: number;
    capturedClaimCount: number;
    ignoredWindowCount: number;
    rejectedWindowCount: number;
    writeDecisionCounts: Record<string, number>;
    rejectReasons: string[];
  };
  artifactJsonPath?: string;
  artifactMarkdownPath?: string;
  blocker?: string;
};

export async function writeCustomSessionTurnProofArtifacts(input: {
  repoRoot: string;
  prompts: SessionTurnProofPrompt[];
  report: SessionTurnProofReport;
  promptsBasename: string;
  reportBasename: string;
}): Promise<{
  promptsJsonPath: string;
  promptsMarkdownPath: string;
  reportJsonPath: string;
  reportMarkdownPath: string;
}> {
  const evidenceDir = path.join(input.repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });

  const promptsJsonPath = path.join(evidenceDir, `${input.promptsBasename}.json`);
  const promptsMarkdownPath = path.join(evidenceDir, `${input.promptsBasename}.md`);
  const reportJsonPath = path.join(evidenceDir, `${input.reportBasename}.json`);
  const reportMarkdownPath = path.join(evidenceDir, `${input.reportBasename}.md`);

  await writeFile(
    promptsJsonPath,
    `${JSON.stringify({ prompts: input.prompts }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    promptsMarkdownPath,
    `${renderSessionTurnProofPromptsMarkdown(input.prompts)}\n`,
    "utf8",
  );
  await writeFile(reportJsonPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
  await writeFile(reportMarkdownPath, `${renderSessionTurnProofMarkdown(input.report)}\n`, "utf8");

  return {
    promptsJsonPath,
    promptsMarkdownPath,
    reportJsonPath,
    reportMarkdownPath,
  };
}

function renderManualUiPromptPackMarkdown(input: {
  prompts: ManualUiPromptExpectation[];
  documentSmoke: ManualUiDocumentIngestionSmoke;
}): string {
  const lines: string[] = [];
  lines.push("# Manual UI Smoke Pack");
  lines.push("");
  lines.push("## Ordinary Turn Prompts");
  lines.push("");
  for (const prompt of input.prompts) {
    lines.push(`### ${prompt.title}`);
    lines.push("");
    lines.push(`- Prompt ID: ${prompt.promptId}`);
    lines.push(`- Why durable: ${prompt.whyDurable}`);
    lines.push(`- Expected memory kinds: ${prompt.expectedMemoryKinds.join(", ")}`);
    lines.push(`- Expected outcome: ${prompt.expectedOutcome}`);
    lines.push("- Operator checks:");
    for (const check of prompt.operatorChecks) {
      lines.push(`  - ${check}`);
    }
    lines.push("");
    lines.push("```text");
    lines.push(prompt.promptText);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Document Ingest UI Smoke");
  lines.push("");
  lines.push(`- Tool name: \`${input.documentSmoke.toolName}\``);
  lines.push(`- Source path: \`${input.documentSmoke.sourcePath}\``);
  lines.push(`- Verification status: \`${input.documentSmoke.verificationStatus}\``);
  lines.push(`- Run ID: \`${input.documentSmoke.runId}\``);
  lines.push(`- Record path: \`${input.documentSmoke.recordPath}\``);
  if (input.documentSmoke.observedStatus) {
    lines.push(`- Observed status: \`${input.documentSmoke.observedStatus}\``);
  }
  if (input.documentSmoke.observedTotals) {
    lines.push(`- Observed totals: \`${JSON.stringify(input.documentSmoke.observedTotals)}\``);
  }
  if (input.documentSmoke.artifactJsonPath) {
    lines.push(`- Smoke artifact JSON: \`${input.documentSmoke.artifactJsonPath}\``);
  }
  if (input.documentSmoke.artifactMarkdownPath) {
    lines.push(`- Smoke artifact Markdown: \`${input.documentSmoke.artifactMarkdownPath}\``);
  }
  if (input.documentSmoke.blocker) {
    lines.push(`- Blocker: ${input.documentSmoke.blocker}`);
  }
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(input.documentSmoke.invocation, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("- Expected operator checks:");
  for (const check of input.documentSmoke.expectedOperatorChecks) {
    lines.push(`  - ${check}`);
  }
  lines.push("");

  return lines.join("\n");
}

export async function writeManualUiSmokePackArtifacts(input: {
  repoRoot: string;
  prompts?: ManualUiPromptExpectation[];
  documentSmoke: ManualUiDocumentIngestionSmoke;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const prompts = input.prompts ?? MANUAL_UI_PROMPT_PACK;
  const evidenceDir = path.join(input.repoRoot, "docs/projects/model-memory/evidence");
  await mkdir(evidenceDir, { recursive: true });

  const jsonPath = path.join(evidenceDir, "manual-ui-smoke-pack.json");
  const markdownPath = path.join(evidenceDir, "manual-ui-smoke-pack.md");

  await writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        prompts,
        documentSmoke: input.documentSmoke,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    markdownPath,
    `${renderManualUiPromptPackMarkdown({
      prompts,
      documentSmoke: input.documentSmoke,
    })}\n`,
    "utf8",
  );

  return {
    jsonPath,
    markdownPath,
  };
}
