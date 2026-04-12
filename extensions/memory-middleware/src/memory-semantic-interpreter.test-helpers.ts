import type {
  MemorySemanticInterpretationDecision,
  MemorySemanticInterpretationInput,
  MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";

export function createScriptedMemorySemanticInterpreter(
  decide: (input: MemorySemanticInterpretationInput) => MemorySemanticInterpretationDecision,
): MemorySemanticInterpreterPort {
  return {
    async interpretBlock(input) {
      return {
        decision: decide(input),
        modelId: "test/scripted-memory-semantic",
        promptVersion: "test-memory-semantic-v1",
      };
    },
  };
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function normalizeSingleLine(value: string): string {
  return normalizeText(value).replace(/\n+/g, " ").trim();
}

function canonicalProcedureText(title: string, steps: string[]): string {
  return `${title}:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

function cleanStep(step: string): string {
  return normalizeSingleLine(step)
    .replace(/[.!?]+$/g, "")
    .trim();
}

function parseSteps(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.match(/^(?:\d+[.)]|[-*])\s+(.+)$/)?.[1] ?? null)
    .filter((line): line is string => Boolean(line))
    .map(cleanStep)
    .filter((line) => line.length >= 3);
}

function readStructuredSteps(input: MemorySemanticInterpretationInput): string[] {
  if (input.block.structuredChildren.length >= 2) {
    return input.block.structuredChildren.map(cleanStep).filter((step) => step.length >= 3);
  }
  return parseSteps(input.block.blockText);
}

function isPolicyBundleHeading(headingPathLower: string[]): boolean {
  return headingPathLower.some(
    (entry) => entry.includes("change class rules") || entry.includes("docs or process only"),
  );
}

function countActionableProcedureSteps(steps: string[]): number {
  return steps.filter((step) =>
    /^(?:run|use|add|treat|trust|capture|freeze|confirm|rerun|commit|push|verify|iterate|include|save|fill|prefer|do not|don't|keep)\b/i.test(
      step,
    ),
  ).length;
}

export function createRuleBasedTestMemorySemanticInterpreter(): MemorySemanticInterpreterPort {
  return createScriptedMemorySemanticInterpreter((input) => {
    const text = normalizeText(input.block.blockText);
    const singleLine = normalizeSingleLine(text);
    const lower = singleLine.toLowerCase();
    const headingPathLower = input.block.headingPath.map((entry) => entry.toLowerCase());
    const projectScope = input.block.scope.projectScope?.trim();
    const structuredSteps = readStructuredSteps(input);

    if (!singleLine || /\bremember this later maybe\b/i.test(singleLine)) {
      return {
        action: "ignore",
        semanticClass: "ignore",
        confidence: "weak",
        rationale: ["test helper ignored low-signal filler"],
      };
    }

    if (/\bplain english\b/i.test(singleLine)) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "Use plain English.",
        confidence: "strong",
        rationale: ["test helper mapped explicit plain-English preference"],
      };
    }

    if (/\bavoid jargon\b/i.test(singleLine)) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "Use plain English.",
        confidence: "strong",
        rationale: ["test helper mapped avoid-jargon preference to plain-English guidance"],
      };
    }

    if (
      /\b(?:keep it short|shorter replies|keep replies short|keep responses concise)\b/i.test(
        singleLine,
      )
    ) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "Keep responses concise.",
        confidence: "strong",
        rationale: ["test helper mapped concise response preference"],
      };
    }

    if (/\bbullet points?\b/i.test(singleLine)) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "Use bullet points when listing items.",
        confidence: "strong",
        rationale: ["test helper mapped bullet preference"],
      };
    }

    if (/\bdirect answer first\b/i.test(lower)) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "For response opening, use the direct answer first.",
        confidence: "medium",
        rationale: ["test helper mapped generalized response-opening preference"],
      };
    }

    if (
      /\brepo-root relative paths\b/i.test(singleLine) ||
      /\brepo relative paths\b/i.test(singleLine)
    ) {
      return {
        action: "candidate",
        semanticClass: "stable_user_preference",
        captureCategoryHint: "response_style",
        candidateText: "For file references, use repo-root relative paths.",
        confidence: "strong",
        rationale: ["test helper mapped durable file-reference preference"],
      };
    }

    if (projectScope && /^\s*(?:default branch|the default branch)\s+is\s+/i.test(singleLine)) {
      const value = singleLine
        .replace(/^\s*(?:default branch|the default branch)\s+is\s+/i, "")
        .replace(/[.!?]+$/g, "")
        .trim();
      return {
        action: "candidate",
        semanticClass: "recurring_project_or_workflow_fact",
        captureCategoryHint: "project_fact",
        candidateText: `For project ${projectScope}, default branch is ${value}.`,
        confidence: "strong",
        rationale: ["test helper mapped implicit-scope default branch fact"],
      };
    }

    if (projectScope && /^\s*(?:staging branch|the staging branch)\s+is\s+/i.test(singleLine)) {
      const value = singleLine
        .replace(/^\s*(?:staging branch|the staging branch)\s+is\s+/i, "")
        .replace(/[.!?]+$/g, "")
        .trim();
      return {
        action: "candidate",
        semanticClass: "recurring_project_or_workflow_fact",
        captureCategoryHint: "project_fact",
        candidateText: `For project ${projectScope}, staging branch is ${value}.`,
        confidence: "strong",
        rationale: ["test helper mapped implicit-scope staging branch fact"],
      };
    }

    if (/^for project .+?, .+ is .+/i.test(singleLine)) {
      return {
        action: "candidate",
        semanticClass: "recurring_project_or_workflow_fact",
        captureCategoryHint: "project_fact",
        candidateText: singleLine.replace(/[.!?]+$/g, "") + ".",
        confidence: "strong",
        rationale: ["test helper preserved explicit project fact"],
      };
    }

    if (
      projectScope &&
      headingPathLower.some((entry) => entry.includes("docs")) &&
      /\bupdate the english docs first\b/i.test(lower) &&
      /\bdocs i18n\b/i.test(lower)
    ) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "project_rule",
        candidateText: `For project ${projectScope}, use update the English docs first and rerun docs i18n for docs localization changes instead of edit docs/zh-CN directly.`,
        confidence: "strong",
        rationale: ["test helper mapped docs localization project rule"],
      };
    }

    const scopedDocsRuleMatch = singleLine.match(
      /^For ([a-z0-9][a-z0-9 /_-]{1,80}?) docs, update (?:the )?English docs first and rerun docs i18n instead of editing docs\/zh-CN directly[.]?$/i,
    );
    if (scopedDocsRuleMatch) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "project_rule",
        candidateText: `For project ${scopedDocsRuleMatch[1]}, use update the English docs first and rerun docs i18n for docs localization changes instead of edit docs/zh-CN directly.`,
        confidence: "strong",
        rationale: ["test helper mapped scoped docs localization project rule"],
      };
    }

    if (/we(?:'re| are)\s+missing\b/i.test(lower) && projectScope) {
      const missingMatch = singleLine.match(
        /we(?:'re| are)\s+missing\s+(.+?)\s+for\s+(.+?)(?:\s+because\s+(.+))?[.]?$/i,
      );
      if (missingMatch) {
        return {
          action: "candidate",
          semanticClass: "durable_operator_correction",
          captureCategoryHint: "unmet_need",
          candidateText: `For project ${projectScope}, we need ${missingMatch[1]} for ${missingMatch[2]}${missingMatch[3] ? ` because ${missingMatch[3]}` : ""}.`,
          confidence: "strong",
          rationale: ["test helper mapped unmet need"],
        };
      }
    }

    if (
      input.block.listKind !== "none" &&
      structuredSteps.length >= 2 &&
      (headingPathLower.some(
        (entry) =>
          entry.includes("checklist") ||
          entry.includes("phase order") ||
          entry.includes("quick start"),
      ) ||
        countActionableProcedureSteps(structuredSteps) >= 2) &&
      !isPolicyBundleHeading(headingPathLower)
    ) {
      return {
        action: "candidate",
        semanticClass: "reusable_procedure",
        captureCategoryHint: "recurring_procedure",
        candidateText: canonicalProcedureText(
          input.block.headingPath.at(-1) ?? "Recurring procedure",
          structuredSteps,
        ),
        confidence: "strong",
        rationale: ["test helper mapped procedure-like titled list block"],
      };
    }

    if (
      /\bpnpm test\b/i.test(singleLine) &&
      /\braw vitest\b/i.test(singleLine) &&
      (/\binstead of\b/i.test(singleLine) ||
        /\bwrapper\b/i.test(singleLine) ||
        /\buse pnpm test\b/i.test(singleLine))
    ) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText:
          "For targeted tests, use pnpm test -- <path> instead of raw vitest because the wrapper preserves repo test configuration.",
        confidence: "strong",
        rationale: ["test helper mapped pnpm-test wrapper guidance"],
      };
    }

    if (
      /scripts\/committer/i.test(singleLine) &&
      (/\bgit add\b/i.test(singleLine) ||
        /\bgit commit\b/i.test(singleLine) ||
        /\bscoped commits?\b/i.test(singleLine))
    ) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText:
          'For scoped commits, use scripts/committer "<msg>" <file...> instead of manual git add / git commit because staging stays scoped.',
        confidence: "strong",
        rationale: ["test helper mapped scripts/committer workflow guidance"],
      };
    }

    if (
      /\bpnpm check:fast\b/i.test(singleLine) &&
      (/\bpnpm build\b/i.test(singleLine) || /\bpnpm test\b/i.test(singleLine)) &&
      (headingPathLower.some((entry) => entry.includes("docs or process only")) ||
        /helper paths that detect docs or changelog-only changes/i.test(singleLine))
    ) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText:
          "For docs-only work, use pnpm check:fast instead of full pnpm check or pnpm build.",
        confidence: "strong",
        rationale: ["test helper mapped docs-only validation tier guidance"],
      };
    }

    if (lower.includes("/readyz") && lower.includes("/healthz")) {
      if (input.block.listKind !== "none") {
        if (structuredSteps.length >= 2) {
          return {
            action: "candidate",
            semanticClass: "reusable_procedure",
            captureCategoryHint: "recurring_procedure",
            candidateText: canonicalProcedureText(
              input.block.headingPath.at(-1) ?? "Readiness checklist",
              structuredSteps,
            ),
            confidence: "strong",
            rationale: ["test helper mapped readiness checklist procedure"],
          };
        }
      }
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText: "For rollout readiness, trust /readyz; /healthz is only liveness.",
        confidence: "strong",
        rationale: ["test helper mapped readiness routing guidance"],
      };
    }

    if (
      (lower.includes("/readyz") || lower.includes("/healthz")) &&
      headingPathLower.some((entry) => entry.includes("checklist") || entry.includes("readiness"))
    ) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText: "For rollout readiness, trust /readyz; /healthz is only liveness.",
        confidence: "strong",
        rationale: ["test helper mapped single-step readiness guidance"],
      };
    }

    if (
      (headingPathLower.some((entry) => entry.includes("checklist")) ||
        headingPathLower.some((entry) => entry.includes("phase order")) ||
        countActionableProcedureSteps(structuredSteps) >= 2) &&
      structuredSteps.length >= 2
    ) {
      return {
        action: "candidate",
        semanticClass: "reusable_procedure",
        captureCategoryHint: "recurring_procedure",
        candidateText: canonicalProcedureText(
          input.block.headingPath.at(-1) ?? "Recurring checklist",
          structuredSteps,
        ),
        confidence: headingPathLower.some((entry) => entry.includes("phase order"))
          ? "medium"
          : "strong",
        rationale: ["test helper mapped structured procedure block"],
      };
    }

    if (/use it with .*testing.*release policy/i.test(lower)) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "reference_routing",
        candidateText: "For slice landing workflow, use Testing and Release Policy together.",
        confidence: "strong",
        rationale: ["test helper mapped companion-doc routing guidance"],
      };
    }

    if (/repo-wide order of operations/i.test(lower) && /slice landing workflow/i.test(lower)) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "reference_routing",
        candidateText:
          "For the repo-wide order of operations around validation, isolated proof, production proof, commit, push, and closeout, use Slice Landing Workflow.",
        confidence: "strong",
        rationale: ["test helper mapped validation-order doc routing guidance"],
      };
    }

    if (/landing tiers/i.test(lower) && /feature, integration, or production bar/i.test(lower)) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "reference_routing",
        candidateText:
          "For the repo's default feature, integration, or production bar, use Landing Gate Tiers.",
        confidence: "strong",
        rationale: ["test helper mapped landing-tier routing guidance"],
      };
    }

    if (/landing gate tiers/i.test(lower) && /timing artifacts/i.test(lower)) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "reference_routing",
        candidateText:
          "For current timing artifacts and the lighter-weight landing model, use Landing Gate Tiers.",
        confidence: "strong",
        rationale: ["test helper mapped landing-model doc routing guidance"],
      };
    }

    if (/pnpm runtime:proof:fast/i.test(singleLine)) {
      return {
        action: "candidate",
        semanticClass: "durable_operator_correction",
        captureCategoryHint: "workflow_improvement",
        candidateText:
          "For non-production runtime proof, use pnpm runtime:proof:fast instead of ad hoc proof entrypoints because it owns gateway restart and /readyz proof semantics.",
        confidence: "strong",
        rationale: ["test helper mapped runtime proof workflow guidance"],
      };
    }

    if (/does not replace existing hard gates/i.test(lower)) {
      return {
        action: "ignore",
        semanticClass: "ignore",
        confidence: "weak",
        rationale: ["test helper ignored explanatory prose"],
      };
    }

    return {
      action: "ignore",
      semanticClass: "ignore",
      confidence: "weak",
      rationale: ["test helper found no durable memory candidate"],
    };
  });
}
