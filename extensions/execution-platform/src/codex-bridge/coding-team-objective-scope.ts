export type CodingTeamObjectiveScope = {
  artifactKind: "coding_team_objective_scope";
  scopeVersion: "coding-team-objective-scope.v1";
  targetActiveQueueId: string | null;
  targetTitle: string | null;
  ownerSystemArea: string;
  sourceDocRefs: string[];
  approvedRepoScopePaths: string[];
  approvedValidationCommands: string[];
  roleTaskTheme: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ResolveCodingTeamObjectiveScopeInput = {
  objectiveForModel: string;
  objectiveForEvidence: string;
  fallbackRepoScopePaths: string[];
  fallbackValidationCommands: string[];
  activeQueueDefinitions?: Array<{
    activeQueueId: string | null;
    title: string;
    ownerSystemArea: string;
    sourceDocRefs?: string[];
  }>;
};

const BASE_ALWAYS_ALLOWED_SCOPE = ["scripts/", "docs/projects/execution-platform/"] as const;

const REPO_PATH_ROOTS = [
  "extensions/execution-platform/",
  "extensions/model-memory/",
  "src/",
  "ui/src/ui/",
  "scripts/",
  "docs/projects/execution-platform/",
  "docs/projects/model-memory/",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function bounded(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

function dirnameScope(value: string): string {
  if (value.endsWith("/")) {
    return value;
  }
  const lastSlash = value.lastIndexOf("/");
  if (lastSlash < 0) {
    return value;
  }
  const basename = value.slice(lastSlash + 1);
  if (/\.[a-z0-9]+$/iu.test(basename)) {
    return value.slice(0, lastSlash + 1);
  }
  return value;
}

function extractExplicitRepoPathScopes(objective: string): string[] {
  const matches = objective.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\/?/gu) ?? [];
  return unique(
    matches
      .map((match) => match.replace(/[),.;:]+$/u, ""))
      .filter((match) => REPO_PATH_ROOTS.some((root) => match.startsWith(root)))
      .map(dirnameScope),
  ).slice(0, 20);
}

type ActiveQueueMention = {
  id: string;
  index: number;
  score: number;
};

function normalizeActiveQueueId(value: string): string {
  return `openclaw-convergence.active-queue-${value.padStart(2, "0")}`;
}

function scoreActiveQueueMention(input: {
  objective: string;
  index: number;
  mentionLength: number;
}): number {
  const before = input.objective.slice(Math.max(0, input.index - 120), input.index);
  const immediateBefore = input.objective.slice(Math.max(0, input.index - 48), input.index);
  const after = input.objective.slice(
    input.index + input.mentionLength,
    input.index + input.mentionLength + 160,
  );
  const context = `${before} ${after}`.toLowerCase();
  let score = input.index / Math.max(1, input.objective.length);
  if (
    /\b(?:goal\s+for\s+this\s+pass:\s*)?(?:complete|implement|finish|run|execute)\s+$/iu.test(
      immediateBefore,
    )
  ) {
    score += 50;
  }
  if (
    /\b(?:continue\s+(?:openclaw\s+platform\s+convergence\s+)?after|after|source\s+from|prefer\s+source\s+from|prior|previous|depends\s+on)\s+$/iu.test(
      immediateBefore,
    )
  ) {
    score -= 50;
  }
  if (
    /\b(?:goal|complete|complete\s+active|current|target|runtime\s+objective|work\s+queue\s+next\s+active\s+item\s+is|tracker\s+now\s+points\s+to|next\s+active\s+item\s+is)\b/u.test(
      context,
    )
  ) {
    score += 20;
  }
  if (
    /\b(?:continue\s+(?:openclaw\s+platform\s+convergence\s+)?after|after|prior|previous|completed|passed|source\s+from|depends\s+on|artifact|closeout|preflight)\b/u.test(
      context,
    )
  ) {
    score -= 20;
  }
  if (
    /\b(?:set|mark|advance|next)\s+(?:the\s+)?next\s+active\s+queue\s+item\s+to\b/u.test(context)
  ) {
    score -= 15;
  }
  return score;
}

function activeQueueIdFromObjective(objective: string): string | null {
  const mentions: ActiveQueueMention[] = [];
  const regex = /\b(?:openclaw-convergence\.)?active-queue-(\d{1,3})\b/giu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(objective)) !== null) {
    mentions.push({
      id: normalizeActiveQueueId(match[1]),
      index: match.index,
      score: scoreActiveQueueMention({
        objective,
        index: match.index,
        mentionLength: match[0].length,
      }),
    });
  }
  if (mentions.length === 0) {
    return null;
  }
  mentions.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.index - left.index;
  });
  return mentions[0].id;
}

function scopePathsForOwner(ownerSystemArea: string, title: string | null): string[] {
  const normalizedOwner = ownerSystemArea.toLowerCase();
  const normalizedTitle = (title ?? "").toLowerCase();
  if (normalizedOwner.includes("model-memory") || normalizedTitle.includes("skillifier")) {
    return [
      ...BASE_ALWAYS_ALLOWED_SCOPE,
      "docs/projects/model-memory/",
      "extensions/model-memory/",
      "extensions/execution-platform/src/model-memory-runtime/",
      "extensions/execution-platform/src/work-queue/",
      "src/agents/model-memory/",
      "src/infra/model-memory-proactivity-runtime.ts",
      "src/infra/heartbeat-runner.ts",
      "src/gateway/server-methods/model-memory-proactivity.ts",
    ];
  }
  if (normalizedOwner.includes("work-queue")) {
    return [
      ...BASE_ALWAYS_ALLOWED_SCOPE,
      "extensions/execution-platform/src/work-queue/",
      "ui/src/ui/",
    ];
  }
  if (normalizedOwner.includes("workflows") || normalizedOwner.includes("codex")) {
    return [
      ...BASE_ALWAYS_ALLOWED_SCOPE,
      "extensions/execution-platform/src/codex-bridge/",
      "extensions/execution-platform/src/workflows/",
      "extensions/execution-platform/src/workers/",
      "extensions/execution-platform/src/work-queue/",
    ];
  }
  return [];
}

function validationCommandsForScope(input: {
  ownerSystemArea: string;
  title: string | null;
  approvedRepoScopePaths: string[];
  fallbackValidationCommands: string[];
}): string[] {
  const normalizedOwner = input.ownerSystemArea.toLowerCase();
  const normalizedTitle = (input.title ?? "").toLowerCase();
  const scopeText = input.approvedRepoScopePaths.join("\n");
  if (normalizedOwner.includes("model-memory") || normalizedTitle.includes("skillifier")) {
    return [
      "pnpm test:file extensions/model-memory/src/middleware-adoption.test.ts",
      "pnpm test:file src/infra/model-memory-proactivity-runtime.test.ts",
      "pnpm test:file extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.test.ts",
    ];
  }
  if (
    scopeText.includes("extensions/execution-platform/src/work-queue/") ||
    scopeText.includes("ui/src/ui/")
  ) {
    return [
      ...(scopeText.includes("extensions/execution-platform/src/work-queue/")
        ? [
            "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
          ]
        : []),
      ...(scopeText.includes("ui/src/ui/")
        ? ["pnpm test:file ui/src/ui/views/work-queue.test.ts"]
        : []),
    ];
  }
  return input.fallbackValidationCommands;
}

function roleTaskThemeForScope(input: {
  title: string | null;
  ownerSystemArea: string;
  objectiveForEvidence: string;
}): string {
  if (input.title) {
    return `${input.title}: ${bounded(input.objectiveForEvidence, 280)}`;
  }
  return `${input.ownerSystemArea}: ${bounded(input.objectiveForEvidence, 320)}`;
}

export function resolveCodingTeamObjectiveScope(
  input: ResolveCodingTeamObjectiveScopeInput,
): CodingTeamObjectiveScope {
  const definitions = input.activeQueueDefinitions ?? [];
  const targetActiveQueueId = activeQueueIdFromObjective(
    `${input.objectiveForEvidence}\n${input.objectiveForModel}`,
  );
  const target = targetActiveQueueId
    ? definitions.find((definition) => definition.activeQueueId === targetActiveQueueId)
    : null;
  const ownerSystemArea = target?.ownerSystemArea ?? "execution-platform";
  const targetTitle = target?.title ?? null;
  const scopedPaths = scopePathsForOwner(ownerSystemArea, targetTitle);
  const explicitRepoPathScopes = extractExplicitRepoPathScopes(
    `${input.objectiveForEvidence}\n${input.objectiveForModel}`,
  );
  const approvedRepoScopePaths = unique(
    explicitRepoPathScopes.length > 0
      ? [...BASE_ALWAYS_ALLOWED_SCOPE, ...explicitRepoPathScopes]
      : scopedPaths.length > 0
        ? scopedPaths
        : input.fallbackRepoScopePaths,
  );
  const approvedValidationCommands = unique(
    validationCommandsForScope({
      ownerSystemArea,
      title: targetTitle,
      approvedRepoScopePaths,
      fallbackValidationCommands: input.fallbackValidationCommands,
    }),
  );
  const reasonCodes = [
    ...(targetActiveQueueId ? ["active_queue_target_detected"] : ["active_queue_target_absent"]),
    ...(target ? ["active_queue_target_resolved"] : []),
    ...(targetActiveQueueId && !target ? ["active_queue_target_unresolved"] : []),
    ...(scopedPaths.length > 0
      ? ["owner_system_area_scope_resolved"]
      : ["fallback_repo_scope_used"]),
    ...(explicitRepoPathScopes.length > 0 ? ["explicit_repo_path_scope_resolved"] : []),
  ];
  return {
    artifactKind: "coding_team_objective_scope",
    scopeVersion: "coding-team-objective-scope.v1",
    targetActiveQueueId,
    targetTitle,
    ownerSystemArea,
    sourceDocRefs: (target?.sourceDocRefs ?? []).slice(0, 20),
    approvedRepoScopePaths,
    approvedValidationCommands,
    roleTaskTheme: roleTaskThemeForScope({
      title: targetTitle,
      ownerSystemArea,
      objectiveForEvidence: input.objectiveForEvidence,
    }),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
