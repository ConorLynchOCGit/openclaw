import type {
  MemorySemanticCorrectionObject,
  MemorySemanticObject,
  MemorySemanticInterpretationDecision,
  MemorySemanticInterpretationInput,
  MemorySemanticInterpreterPort,
  MemorySemanticInterpretationResult,
  MemorySemanticPreferenceObject,
  MemorySemanticProcedureObject,
  MemorySemanticProjectFactObject,
  MemorySemanticRoutingObject,
} from "./memory-semantic-interpretation.js";

export function createScriptedMemorySemanticInterpreter(
  decide: (input: MemorySemanticInterpretationInput) => MemorySemanticInterpretationDecision,
): MemorySemanticInterpreterPort {
  return {
    async interpretSourceWindow(input) {
      return {
        decision: decide(input),
        modelId: "test/scripted-memory-semantic",
        promptVersion: "test-memory-semantic-v1",
      };
    },
  };
}

export type MemorySemanticReplayFixture = {
  sourceId?: string;
  headingPath?: string[];
  windowTextIncludes?: string[];
  result:
    | MemorySemanticInterpretationDecision
    | MemorySemanticInterpretationResult
    | ((
        input: MemorySemanticInterpretationInput,
      ) => MemorySemanticInterpretationDecision | MemorySemanticInterpretationResult);
  modelId?: string;
  promptVersion?: string;
};

export function createReplayMemorySemanticInterpreter(
  fixtures: MemorySemanticReplayFixture[],
): MemorySemanticInterpreterPort {
  return {
    async interpretSourceWindow(input) {
      const normalizedWindowText = normalizeText(input.window.windowText).toLowerCase();
      const fixture = fixtures.find((entry) => {
        if (entry.sourceId && entry.sourceId !== input.source.sourceId) {
          return false;
        }
        if (
          entry.headingPath &&
          entry.headingPath.join(" > ").toLowerCase() !==
            input.window.headingPath.join(" > ").toLowerCase()
        ) {
          return false;
        }
        if (
          entry.windowTextIncludes &&
          !entry.windowTextIncludes.every((part) =>
            normalizedWindowText.includes(part.toLowerCase()),
          )
        ) {
          return false;
        }
        return true;
      });
      if (!fixture) {
        return {
          decision: {
            action: "ignore",
            confidence: "weak",
            rationale: ["replay fixture omitted this window"],
          },
          modelId: "test/replay-memory-semantic",
          promptVersion: "test-memory-semantic-replay-v1",
        };
      }
      const replayed =
        typeof fixture.result === "function" ? fixture.result(input) : fixture.result;
      if ("decision" in replayed) {
        return replayed;
      }
      return {
        decision: replayed,
        modelId: fixture.modelId ?? "test/replay-memory-semantic",
        promptVersion: fixture.promptVersion ?? "test-memory-semantic-replay-v1",
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
  const primaryBlock = input.window.blocks[0];
  if (primaryBlock?.structuredChildren.length && primaryBlock.structuredChildren.length >= 2) {
    return primaryBlock.structuredChildren.map(cleanStep).filter((step) => step.length >= 3);
  }
  return parseSteps(input.window.windowText);
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

function inferProcedureKey(title: string): "deploy_checklist" | "release_checklist" | undefined {
  const normalized = normalizeSingleLine(title).toLowerCase();
  if (normalized.includes("deploy checklist")) {
    return "deploy_checklist";
  }
  if (normalized.includes("release checklist")) {
    return "release_checklist";
  }
  return undefined;
}

function toTitleCase(value: string): string {
  return normalizeSingleLine(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractChecklistTitle(text: string): string | null {
  const [firstLine] = normalizeText(text).split("\n").filter(Boolean);
  if (!firstLine) {
    return null;
  }
  const normalizedFirstLine = normalizeSingleLine(firstLine);
  if (/^for releases,\s+we use this checklist:?$/i.test(normalizedFirstLine)) {
    return "Release checklist";
  }
  const titledChecklistMatch =
    normalizedFirstLine.match(/^(?:actually,\s*)?(?:my|our)\s+(.+?checklist):?$/i) ??
    normalizedFirstLine.match(/^(?:actually,\s*)?(.+?checklist):?$/i);
  if (!titledChecklistMatch) {
    return null;
  }
  const rawTitle = titledChecklistMatch[1]?.trim();
  if (!rawTitle) {
    return null;
  }
  const normalizedTitle = normalizeSingleLine(rawTitle).toLowerCase();
  if (normalizedTitle === "deploy checklist") {
    return "Deploy checklist";
  }
  if (normalizedTitle === "release checklist") {
    return "Release checklist";
  }
  return toTitleCase(rawTitle);
}

function inferProjectFactFieldKey(
  subject: string,
):
  | "default_branch"
  | "staging_branch"
  | "repository_url"
  | "documentation_url"
  | "primary_package_manager"
  | undefined {
  const normalized = normalizeSingleLine(subject).toLowerCase();
  if (normalized === "default branch") {
    return "default_branch";
  }
  if (normalized === "staging branch") {
    return "staging_branch";
  }
  if (normalized === "repository url" || normalized === "repo url") {
    return "repository_url";
  }
  if (
    normalized === "documentation url" ||
    normalized === "docs url" ||
    normalized === "support url" ||
    normalized === "support docs url"
  ) {
    return "documentation_url";
  }
  if (normalized === "package manager" || normalized === "primary package manager") {
    return "primary_package_manager";
  }
  return undefined;
}

function semanticObjectDedupeKey(object: MemorySemanticObject): string {
  switch (object.kind) {
    case "preference":
      return JSON.stringify([
        object.kind,
        object.operation,
        object.subject,
        object.instruction,
        object.scope?.projectScope ?? "",
        object.scope?.workflowScope ?? "",
      ]);
    case "correction":
      return JSON.stringify([
        object.kind,
        object.correctionKind,
        object.subject,
        object.recommendedAction ?? "",
        object.avoidAction ?? "",
        object.neededCapability ?? "",
        object.scope?.projectScope ?? "",
        object.scope?.workflowScope ?? "",
      ]);
    case "procedure":
      return JSON.stringify([
        object.kind,
        object.title,
        object.steps,
        object.scope?.projectScope ?? "",
        object.scope?.workflowScope ?? "",
      ]);
    case "project_fact":
      return JSON.stringify([
        object.kind,
        object.subject,
        object.value,
        object.factFieldKey ?? "",
        object.scope?.projectScope ?? "",
        object.scope?.workflowScope ?? "",
      ]);
    case "routing":
      return JSON.stringify([
        object.kind,
        object.task,
        object.primaryResource,
        object.companionResources ?? [],
        object.scope?.projectScope ?? "",
        object.scope?.workflowScope ?? "",
      ]);
  }
}

function provenanceBlockCount(object: MemorySemanticObject): number {
  return object.provenanceSpans.reduce((sum, span) => sum + (span.blockIds?.length ?? 0), 0);
}

function provenanceBlockSet(object: MemorySemanticObject): Set<string> {
  return new Set(
    object.provenanceSpans
      .flatMap((span) => span.blockIds ?? [])
      .filter((blockId) => blockId.length > 0),
  );
}

function isSubsetSupport(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0 || left.size > right.size) {
    return false;
  }
  return [...left].every((value) => right.has(value));
}

function dedupeSemanticObjects(objects: MemorySemanticObject[]): MemorySemanticObject[] {
  const deduped: MemorySemanticObject[] = [];
  for (const object of objects) {
    const key = semanticObjectDedupeKey(object);
    const nextSupport = provenanceBlockSet(object);
    let handled = false;
    for (let index = 0; index < deduped.length; index += 1) {
      const existing = deduped[index];
      if (semanticObjectDedupeKey(existing) !== key) {
        continue;
      }
      const existingSupport = provenanceBlockSet(existing);
      if (isSubsetSupport(nextSupport, existingSupport)) {
        deduped[index] = object;
        handled = true;
        break;
      }
      if (isSubsetSupport(existingSupport, nextSupport)) {
        handled = true;
        break;
      }
      if (
        provenanceBlockCount(object) === provenanceBlockCount(existing) &&
        nextSupport.size === existingSupport.size &&
        [...nextSupport].every((value) => existingSupport.has(value))
      ) {
        handled = true;
        break;
      }
    }
    if (!handled) {
      deduped.push(object);
    }
  }
  return deduped;
}

/**
 * Legacy heuristic scaffold for non-proof tests only.
 *
 * This exists to keep compatibility and runtime harness tests cheap while the
 * proof surfaces move to replayed or stored model outputs. Do not use this as
 * semantic evidence for model-native correctness.
 */
export function createLegacySemanticTestScaffoldInterpreter(): MemorySemanticInterpreterPort {
  function decideWindow(
    input: MemorySemanticInterpretationInput,
    allowBlockExpansion: boolean,
  ): MemorySemanticInterpretationDecision {
    if (allowBlockExpansion && input.window.blocks.length > 1) {
      const collected: MemorySemanticObject[] = [];
      const fullWindowDecision = decideWindow(input, false);
      if (fullWindowDecision.action === "capture") {
        collected.push(...fullWindowDecision.objects);
      }
      for (const block of input.window.blocks) {
        const blockDecision = decideWindow(
          {
            ...input,
            window: {
              ...input.window,
              id: `${input.window.id}:${block.id}`,
              headingPath: block.headingPath,
              blocks: [block],
              windowText: block.blockText,
              listKinds: [block.listKind],
              scope: block.scope,
              provenance: block.provenance,
            },
          },
          false,
        );
        if (blockDecision.action === "capture") {
          collected.push(...blockDecision.objects);
        }
      }
      const deduped = dedupeSemanticObjects(collected);
      if (deduped.length > 0) {
        return {
          action: "capture",
          objects: deduped,
        };
      }
      return {
        action: "ignore",
        confidence: "weak",
        rationale: ["test helper found no durable memory candidate"],
      };
    }

    const primaryBlock = input.window.blocks[0];
    const text = normalizeText(input.window.windowText);
    const singleLine = normalizeSingleLine(text);
    const canonicalSingleLine = singleLine.replace(/^actually,\s*/i, "").trim();
    const lower = singleLine.toLowerCase();
    const headingPathLower = input.window.headingPath.map((entry) => entry.toLowerCase());
    const projectScope = input.window.scope.projectScope?.trim();
    const structuredSteps = readStructuredSteps(input);
    const defaultSpan = input.window.blocks.map((block) => block.id);

    function withSpan(
      object: Omit<MemorySemanticPreferenceObject, "provenanceSpans">,
    ): MemorySemanticPreferenceObject;
    function withSpan(
      object: Omit<MemorySemanticCorrectionObject, "provenanceSpans">,
    ): MemorySemanticCorrectionObject;
    function withSpan(
      object: Omit<MemorySemanticProcedureObject, "provenanceSpans">,
    ): MemorySemanticProcedureObject;
    function withSpan(
      object: Omit<MemorySemanticProjectFactObject, "provenanceSpans">,
    ): MemorySemanticProjectFactObject;
    function withSpan(
      object: Omit<MemorySemanticRoutingObject, "provenanceSpans">,
    ): MemorySemanticRoutingObject;
    function withSpan(object: Omit<MemorySemanticObject, "provenanceSpans">): MemorySemanticObject {
      return {
        ...object,
        provenanceSpans: [{ blockIds: defaultSpan }],
      } as MemorySemanticObject;
    }

    if (!singleLine || /\bremember this later maybe\b/i.test(singleLine)) {
      return {
        action: "ignore",
        confidence: "weak",
        rationale: ["test helper ignored low-signal filler"],
      };
    }

    if (/\bplain english\b/i.test(singleLine)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response language",
            instruction: "use plain English",
            preferenceProfile: "plain_english",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped explicit plain-English preference"],
          }),
        ],
      };
    }

    if (/\bavoid jargon\b/i.test(singleLine)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response language",
            instruction: "use plain English",
            preferenceProfile: "plain_english",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped avoid-jargon preference to plain-English guidance"],
          }),
        ],
      };
    }

    if (
      /\b(?:keep it short|shorter replies|keep replies short|keep responses concise)\b/i.test(
        singleLine,
      )
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response style",
            instruction: "keep responses concise",
            preferenceProfile: "concise",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped concise response preference"],
          }),
        ],
      };
    }

    if (/\bbullets?(?:\s+points?)?\b/i.test(singleLine)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response format",
            instruction: "use bullet points when listing items",
            durability: "durable",
            confidence: "medium",
            preferenceProfile: "bullets",
            rationale: ["test helper mapped bullet preference"],
          }),
        ],
      };
    }

    if (/\bdirect answer first\b/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response opening",
            instruction: "start with the direct answer first",
            durability: "durable",
            confidence: "medium",
            preferenceProfile: "generalized_guidance",
            rationale: ["test helper mapped generalized response-opening preference"],
          }),
        ],
      };
    }

    if (/\bhigh level\b/i.test(lower) && /\bask for more detail\b/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "response detail level",
            instruction: "keep explanations high level unless I ask for more detail",
            durability: "durable",
            confidence: "medium",
            preferenceProfile: "generalized_guidance",
            rationale: ["test helper mapped generalized detail-level preference"],
          }),
        ],
      };
    }

    if (
      /\brepo-root relative paths\b/i.test(singleLine) ||
      /\brepo relative paths\b/i.test(singleLine)
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "preference",
            operation: "capture",
            subject: "file references",
            instruction: "use repo-root relative paths",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped durable file-reference preference"],
          }),
        ],
      };
    }

    if (projectScope && /^\s*(?:default branch|the default branch)\s+is\s+/i.test(singleLine)) {
      const value = singleLine
        .replace(/^\s*(?:default branch|the default branch)\s+is\s+/i, "")
        .replace(/[.!?]+$/g, "")
        .trim();
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "project_fact",
            subject: "default branch",
            value,
            factFieldKey: "default_branch",
            scope: {
              projectScope,
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped implicit-scope default branch fact"],
          }),
        ],
      };
    }

    if (projectScope && /^\s*(?:staging branch|the staging branch)\s+is\s+/i.test(singleLine)) {
      const value = singleLine
        .replace(/^\s*(?:staging branch|the staging branch)\s+is\s+/i, "")
        .replace(/[.!?]+$/g, "")
        .trim();
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "project_fact",
            subject: "staging branch",
            value,
            factFieldKey: "staging_branch",
            scope: {
              projectScope,
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped implicit-scope staging branch fact"],
          }),
        ],
      };
    }

    const scopedProjectFactMatch = canonicalSingleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?),\s+(?:the\s+)?(.+?)\s+is\s+(.+?)[.]?$/i,
    );
    if (scopedProjectFactMatch && input.window.blocks.length === 1) {
      const scopedProject = scopedProjectFactMatch[1].trim();
      const subject = scopedProjectFactMatch[2].trim();
      const value = scopedProjectFactMatch[3].trim();
      const fieldKey = inferProjectFactFieldKey(subject);
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "project_fact",
            subject,
            value,
            ...(fieldKey ? { factFieldKey: fieldKey } : {}),
            scope: {
              projectScope: scopedProject,
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped scoped project fact"],
          }),
        ],
      };
    }

    const scopedPackageManagerMatch = canonicalSingleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?),\s+we use (npm|pnpm|yarn|bun)[.]?$/i,
    );
    if (scopedPackageManagerMatch) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "project_fact",
            subject: "package manager",
            value: scopedPackageManagerMatch[2].trim(),
            factFieldKey: "primary_package_manager",
            scope: {
              projectScope: scopedPackageManagerMatch[1].trim(),
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "medium",
            rationale: ["test helper mapped scoped package-manager fact"],
          }),
        ],
      };
    }

    const scopedProjectRuleMatch = canonicalSingleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?),\s+(?:use|prefer|trust)\s+(.+?)(?:\s+for\s+(.+?))?\s+instead of\s+(.+?)[.]?$/i,
    );
    if (scopedProjectRuleMatch) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "project_rule",
            subject: scopedProjectRuleMatch[3]?.trim() || "project workflow",
            recommendedAction: scopedProjectRuleMatch[2]?.trim(),
            avoidAction: scopedProjectRuleMatch[4]?.trim(),
            guidancePattern: "use_instead_of",
            scope: {
              projectScope: scopedProjectRuleMatch[1]?.trim(),
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped scoped project rule guidance"],
          }),
        ],
      };
    }

    const genericWorkflowGuidanceMatch =
      canonicalSingleLine.match(/^For (.+?),\s+use\s+(.+?)\s+instead of\s+(.+?)[.]?$/i) ??
      canonicalSingleLine.match(
        /^(?:use|prefer|trust)\s+(.+?)\s+for\s+(.+?)\s+instead of\s+(.+?)[.]?$/i,
      );
    if (genericWorkflowGuidanceMatch) {
      const subject =
        genericWorkflowGuidanceMatch.length === 4 && /^For /i.test(canonicalSingleLine)
          ? genericWorkflowGuidanceMatch[1]?.trim()
          : genericWorkflowGuidanceMatch[2]?.trim();
      const recommendedAction =
        genericWorkflowGuidanceMatch.length === 4 && /^For /i.test(canonicalSingleLine)
          ? genericWorkflowGuidanceMatch[2]?.trim()
          : genericWorkflowGuidanceMatch[1]?.trim();
      const avoidAction = genericWorkflowGuidanceMatch[3]?.trim();
      if (subject && recommendedAction && avoidAction) {
        return {
          action: "capture",
          objects: [
            withSpan({
              kind: "correction",
              correctionKind: "workflow_guidance",
              workflowProfile: "general_guidance",
              subject,
              recommendedAction,
              avoidAction,
              guidancePattern: "use_instead_of",
              durability: "durable",
              confidence: "strong",
              rationale: ["test helper mapped generalized workflow guidance"],
            }),
          ],
        };
      }
    }

    if (
      projectScope &&
      headingPathLower.some((entry) => entry.includes("docs")) &&
      /\bupdate the english docs first\b/i.test(lower) &&
      /\bdocs i18n\b/i.test(lower)
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "project_rule",
            subject: "docs localization changes",
            recommendedAction: "update the English docs first and rerun docs i18n",
            avoidAction: "edit docs/zh-CN directly",
            guidancePattern: "use_instead_of",
            scope: {
              projectScope,
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped docs localization project rule"],
          }),
        ],
      };
    }

    const scopedDocsRuleMatch = singleLine.match(
      /^For ([a-z0-9][a-z0-9 /_-]{1,80}?) docs, update (?:the )?English docs first and rerun docs i18n instead of editing docs\/zh-CN directly[.]?$/i,
    );
    if (scopedDocsRuleMatch) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "project_rule",
            subject: "docs localization changes",
            recommendedAction: "update the English docs first and rerun docs i18n",
            avoidAction: "edit docs/zh-CN directly",
            guidancePattern: "use_instead_of",
            scope: {
              projectScope: scopedDocsRuleMatch[1],
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped scoped docs localization project rule"],
          }),
        ],
      };
    }

    if (
      /\bpython\b/.test(lower) &&
      /\b(?:not available|isn't available|is not available|unavailable)\b/.test(lower) &&
      /\b(?:node|tsx|input-type=module)\b/.test(lower)
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            workflowProfile: "environment_constraint",
            subject: "python command availability",
            recommendedAction: "node --input-type=module or tsx",
            avoidAction: "python",
            guidancePattern: "use_instead_of",
            rationaleText: "python command is not available here",
            durability: "durable",
            confidence:
              /\btsx\b/.test(lower) || /\binput-type=module\b/.test(lower) ? "strong" : "medium",
            rationale: ["test helper mapped environment-constraint workflow guidance"],
          }),
        ],
      };
    }

    if (
      /\b(?:semantic memory search|embedding|embeddings)\b/.test(lower) &&
      /\bcodex\b/.test(lower) &&
      /\boauth\b/.test(lower) &&
      /\bopenai\b/.test(lower)
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            workflowProfile: "api_workaround",
            subject: "OpenAI embeddings auth",
            recommendedAction: "use a configured OPENAI_API_KEY or another embeddings provider",
            avoidAction: "codex OAuth alone",
            guidancePattern: "use_instead_of",
            rationaleText: "semantic memory search still needs provider auth",
            durability: "durable",
            confidence: /\bneed|needs|still need|does not help\b/.test(lower) ? "strong" : "medium",
            rationale: ["test helper mapped API-workaround workflow guidance"],
          }),
        ],
      };
    }

    if (/we(?:'re| are)\s+missing\b/i.test(lower) && projectScope) {
      const missingMatch = singleLine.match(
        /we(?:'re| are)\s+missing\s+(.+?)\s+for\s+(.+?)(?:\s+because\s+(.+))?[.]?$/i,
      );
      if (missingMatch) {
        return {
          action: "capture",
          objects: [
            withSpan({
              kind: "correction",
              correctionKind: "missing_capability",
              subject: missingMatch[2],
              neededCapability: missingMatch[1],
              ...(missingMatch[3] ? { rationaleText: missingMatch[3] } : {}),
              scope: {
                projectScope,
                contextualDependencies: [],
              },
              durability: "durable",
              confidence: "strong",
              rationale: ["test helper mapped unmet need"],
            }),
          ],
        };
      }
    }

    const scopedMissingMatch = singleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?),\s+we(?:'re| are)\s+missing\s+(.+?)\s+for\s+(.+?)(?:\s+because\s+(.+))?[.]?$/i,
    );
    if (scopedMissingMatch) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "missing_capability",
            subject: scopedMissingMatch[3],
            neededCapability: scopedMissingMatch[2],
            ...(scopedMissingMatch[4] ? { rationaleText: scopedMissingMatch[4] } : {}),
            scope: {
              projectScope: scopedMissingMatch[1],
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped scoped unmet need"],
          }),
        ],
      };
    }

    const scopedNeedMatch = canonicalSingleLine.match(
      /^For project ([a-z0-9][a-z0-9 /_-]{1,80}?),\s+we need\s+(.+?)\s+for\s+(.+?)(?:\s+because\s+(.+))?[.]?$/i,
    );
    if (scopedNeedMatch) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "missing_capability",
            subject: scopedNeedMatch[3],
            neededCapability: scopedNeedMatch[2],
            ...(scopedNeedMatch[4] ? { rationaleText: scopedNeedMatch[4] } : {}),
            scope: {
              projectScope: scopedNeedMatch[1],
              contextualDependencies: [],
            },
            durability: "durable",
            confidence: "medium",
            rationale: ["test helper mapped scoped unmet-need request"],
          }),
        ],
      };
    }

    const checklistTitle = extractChecklistTitle(input.window.windowText);
    const checklistSteps = parseSteps(input.window.windowText);
    if (checklistTitle && checklistSteps.length >= 2) {
      const procedureKey = inferProcedureKey(checklistTitle);
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "procedure",
            title: checklistTitle,
            steps: checklistSteps,
            ...(procedureKey ? { procedureKey } : {}),
            durability: "durable",
            confidence:
              procedureKey === "deploy_checklist" ? "strong" : procedureKey ? "medium" : "strong",
            rationale: ["test helper mapped inline checklist procedure"],
          }),
        ],
      };
    }

    if (
      primaryBlock?.listKind !== "none" &&
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
        action: "capture",
        objects: [
          withSpan({
            kind: "procedure",
            title: input.window.headingPath.at(-1) ?? "Recurring procedure",
            steps: structuredSteps,
            ...(inferProcedureKey(input.window.headingPath.at(-1) ?? "Recurring procedure")
              ? {
                  procedureKey: inferProcedureKey(
                    input.window.headingPath.at(-1) ?? "Recurring procedure",
                  ),
                }
              : {}),
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped procedure-like titled list block"],
          }),
        ],
      };
    }

    if (
      /\bpnpm test\b/i.test(singleLine) &&
      /\braw vitest\b/i.test(singleLine) &&
      (/\binstead of\b/i.test(singleLine) ||
        /\bwrapper\b/i.test(singleLine) ||
        /\buse pnpm test\b/i.test(singleLine))
    ) {
      const strongGuidance =
        /\binstead of\b/i.test(singleLine) &&
        (/<path>/i.test(singleLine) || /src\/.+\.test\.ts/i.test(singleLine));
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            workflowProfile: "general_guidance",
            subject: "targeted tests",
            recommendedAction: "pnpm test -- <path>",
            avoidAction: "raw vitest",
            guidancePattern: "use_instead_of",
            rationaleText: "the wrapper preserves repo test configuration",
            durability: "durable",
            confidence: strongGuidance ? "strong" : "medium",
            rationale: ["test helper mapped pnpm-test wrapper guidance"],
          }),
        ],
      };
    }

    if (
      /scripts\/committer/i.test(singleLine) &&
      (/\bgit add\b/i.test(singleLine) ||
        /\bgit commit\b/i.test(singleLine) ||
        /\bscoped commits?\b/i.test(singleLine))
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            subject: "scoped commits",
            recommendedAction: 'scripts/committer "<msg>" <file...>',
            avoidAction: "manual git add / git commit",
            guidancePattern: "use_instead_of",
            rationaleText: "staging stays scoped",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped scripts/committer workflow guidance"],
          }),
        ],
      };
    }

    if (
      /\bpnpm check:fast\b/i.test(singleLine) &&
      (/\bpnpm build\b/i.test(singleLine) || /\bpnpm test\b/i.test(singleLine)) &&
      (headingPathLower.some((entry) => entry.includes("docs or process only")) ||
        /helper paths that detect docs or changelog-only changes/i.test(singleLine))
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            subject: "docs-only work",
            recommendedAction: "pnpm check:fast",
            avoidAction: "full pnpm check or pnpm build",
            guidancePattern: "use_instead_of",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped docs-only validation tier guidance"],
          }),
        ],
      };
    }

    if (lower.includes("/readyz") && lower.includes("/healthz")) {
      if (primaryBlock?.listKind !== "none") {
        if (structuredSteps.length >= 2) {
          return {
            action: "capture",
            objects: [
              withSpan({
                kind: "procedure",
                title: input.window.headingPath.at(-1) ?? "Readiness checklist",
                steps: structuredSteps,
                durability: "durable",
                confidence: "strong",
                rationale: ["test helper mapped readiness checklist procedure"],
              }),
              withSpan({
                kind: "correction",
                correctionKind: "workflow_guidance",
                subject: "rollout readiness",
                recommendedAction: "/readyz",
                avoidAction: "/healthz",
                guidancePattern: "trust_for_scope",
                rationaleText: "liveness",
                durability: "durable",
                confidence: "strong",
                rationale: ["test helper mapped readiness routing guidance"],
              }),
            ],
          };
        }
      }
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            subject: "rollout readiness",
            recommendedAction: "/readyz",
            avoidAction: "/healthz",
            guidancePattern: "trust_for_scope",
            rationaleText: "liveness",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped readiness routing guidance"],
          }),
        ],
      };
    }

    if (
      (lower.includes("/readyz") || lower.includes("/healthz")) &&
      headingPathLower.some((entry) => entry.includes("checklist") || entry.includes("readiness"))
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            subject: "rollout readiness",
            recommendedAction: "/readyz",
            avoidAction: "/healthz",
            guidancePattern: "trust_for_scope",
            rationaleText: "liveness",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped single-step readiness guidance"],
          }),
        ],
      };
    }

    if (
      (headingPathLower.some((entry) => entry.includes("checklist")) ||
        headingPathLower.some((entry) => entry.includes("phase order")) ||
        countActionableProcedureSteps(structuredSteps) >= 2) &&
      structuredSteps.length >= 2
    ) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "procedure",
            title: input.window.headingPath.at(-1) ?? "Recurring checklist",
            steps: structuredSteps,
            ...(inferProcedureKey(input.window.headingPath.at(-1) ?? "Recurring checklist")
              ? {
                  procedureKey: inferProcedureKey(
                    input.window.headingPath.at(-1) ?? "Recurring checklist",
                  ),
                }
              : {}),
            durability: "durable",
            confidence: headingPathLower.some((entry) => entry.includes("phase order"))
              ? "medium"
              : "strong",
            rationale: ["test helper mapped structured procedure block"],
          }),
        ],
      };
    }

    if (/use it with .*testing.*release policy/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "routing",
            task: "slice landing workflow",
            primaryResource: "Testing",
            companionResources: ["Release Policy"],
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped companion-doc routing guidance"],
          }),
        ],
      };
    }

    if (/repo-wide order of operations/i.test(lower) && /slice landing workflow/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "routing",
            task: "repo-wide order of operations around validation, isolated proof, production proof, commit, push, and closeout",
            primaryResource: "Slice Landing Workflow",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped validation-order doc routing guidance"],
          }),
        ],
      };
    }

    if (/landing tiers/i.test(lower) && /feature, integration, or production bar/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "routing",
            task: "the repo's default feature, integration, or production bar",
            primaryResource: "Landing Gate Tiers",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped landing-tier routing guidance"],
          }),
        ],
      };
    }

    if (/landing gate tiers/i.test(lower) && /timing artifacts/i.test(lower)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "routing",
            task: "current timing artifacts and the lighter-weight landing model",
            primaryResource: "Landing Gate Tiers",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped landing-model doc routing guidance"],
          }),
        ],
      };
    }

    if (/pnpm runtime:proof:fast/i.test(singleLine)) {
      return {
        action: "capture",
        objects: [
          withSpan({
            kind: "correction",
            correctionKind: "workflow_guidance",
            subject: "non-production runtime proof",
            recommendedAction: "pnpm runtime:proof:fast",
            avoidAction: "ad hoc proof entrypoints",
            rationaleText: "it owns gateway restart and /readyz proof semantics",
            durability: "durable",
            confidence: "strong",
            rationale: ["test helper mapped runtime proof workflow guidance"],
          }),
        ],
      };
    }

    if (/does not replace existing hard gates/i.test(lower)) {
      return {
        action: "ignore",
        confidence: "weak",
        rationale: ["test helper ignored explanatory prose"],
      };
    }

    return {
      action: "ignore",
      confidence: "weak",
      rationale: ["test helper found no durable memory candidate"],
    };
  }

  return createScriptedMemorySemanticInterpreter((input) => decideWindow(input, true));
}

/**
 * Deprecated compatibility alias. Prefer createLegacySemanticTestScaffoldInterpreter()
 * so tests cannot mistake this helper for semantic proof.
 */
export function createRuleBasedTestMemorySemanticInterpreter(): MemorySemanticInterpreterPort {
  return createLegacySemanticTestScaffoldInterpreter();
}
