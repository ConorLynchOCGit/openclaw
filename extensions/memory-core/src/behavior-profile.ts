import {
  DURABLE_MEMORY_GUIDANCE_FAMILY_IDS,
  getDurableMemoryGuidanceFamilyDefinition,
  type DurableMemoryGuidanceFamilyDefinition,
  type DurableMemoryGuidanceFamilyId,
} from "./durable-memory-guidance-families.js";

type DurableMemoryToolFlags = {
  hasCandidateSubmit: boolean;
  hasLearnedGuidancePlan: boolean;
  hasObjectGet: boolean;
  hasObjectList: boolean;
  hasObjectSearchBasic: boolean;
  hasObjectSearchHybrid: boolean;
  hasSessionGet: boolean;
  hasSessionUpdate: boolean;
};

export type MemoryBehaviorFamilyProfile = {
  familyId: DurableMemoryGuidanceFamilyId;
  applicationMode: DurableMemoryGuidanceFamilyDefinition["applicationMode"];
  directUseOnlyOnClearAsk: boolean;
  retrievalMode: DurableMemoryGuidanceFamilyDefinition["retrievalMode"];
  promptSection: DurableMemoryGuidanceFamilyDefinition["promptSection"];
  searchGuidance: string[];
  applicationGuidance: string[];
  captureGuidance: string[];
};

export type DurableMemoryBehaviorProfile = {
  flags: DurableMemoryToolFlags;
  families: MemoryBehaviorFamilyProfile[];
};

export type DurableMemoryGuidancePlan = {
  hasObjectSurface: boolean;
  hasCandidateSurface: boolean;
  hasLearnedGuidanceSurface: boolean;
  hasSessionSurface: boolean;
  searchFamilies: DurableMemoryGuidanceFamilyId[];
  applicationFamilies: DurableMemoryGuidanceFamilyId[];
  captureFamilies: DurableMemoryGuidanceFamilyId[];
};

export type DurableMemoryApplicationGuidanceKind = "search" | "application" | "capture";

export type DurableMemoryApplicationQueryIntent = {
  kind: "tool_surface_guidance";
  hasObjectSurface: boolean;
  hasCandidateSurface: boolean;
  hasLearnedGuidanceSurface: boolean;
  hasSessionSurface: boolean;
};

export type DurableMemorySelectedApplicationItem = {
  familyId: DurableMemoryGuidanceFamilyId;
  applicationMode: DurableMemoryGuidanceFamilyDefinition["applicationMode"];
  directUseOnlyOnClearAsk: boolean;
  retrievalMode: DurableMemoryGuidanceFamilyDefinition["retrievalMode"];
  promptSection: DurableMemoryGuidanceFamilyDefinition["promptSection"];
  selectedGuidanceKinds: DurableMemoryApplicationGuidanceKind[];
  selectionReasonCodes: string[];
  searchGuidance: string[];
  applicationGuidance: string[];
  captureGuidance: string[];
};

export type DurableMemorySuppressedApplicationItem = {
  familyId: DurableMemoryGuidanceFamilyId;
  applicationMode: DurableMemoryGuidanceFamilyDefinition["applicationMode"];
  suppressedGuidanceKinds: DurableMemoryApplicationGuidanceKind[];
  suppressionReasonCodes: string[];
};

export type DurableMemoryApplicationSelection = {
  flags: DurableMemoryToolFlags;
  queryIntent: DurableMemoryApplicationQueryIntent;
  selectedItems: DurableMemorySelectedApplicationItem[];
  suppressedItems: DurableMemorySuppressedApplicationItem[];
  renderingHints: DurableMemoryGuidancePlan;
};

export function buildDurableMemoryBehaviorProfile(params: {
  availableTools: Set<string>;
}): DurableMemoryBehaviorProfile | null {
  const flags: DurableMemoryToolFlags = {
    hasCandidateSubmit: params.availableTools.has("memory_candidate_submit"),
    hasLearnedGuidancePlan: params.availableTools.has("memory_learned_guidance_plan"),
    hasObjectGet: params.availableTools.has("memory_object_get"),
    hasObjectList: params.availableTools.has("memory_object_list"),
    hasObjectSearchBasic: params.availableTools.has("memory_object_search_basic"),
    hasObjectSearchHybrid: params.availableTools.has("memory_object_search_hybrid"),
    hasSessionGet: params.availableTools.has("memory_session_get"),
    hasSessionUpdate: params.availableTools.has("memory_session_update"),
  };

  const hasDurableMemorySection =
    flags.hasCandidateSubmit ||
    flags.hasLearnedGuidancePlan ||
    flags.hasObjectGet ||
    flags.hasObjectList ||
    flags.hasObjectSearchBasic ||
    flags.hasObjectSearchHybrid ||
    flags.hasSessionGet ||
    flags.hasSessionUpdate;

  if (!hasDurableMemorySection) {
    return null;
  }

  return {
    flags,
    families: DURABLE_MEMORY_GUIDANCE_FAMILY_IDS.map((familyId) => buildFamilyProfile(familyId)),
  };
}

export function resolveDurableMemoryGuidancePlan(
  flags: DurableMemoryToolFlags,
): DurableMemoryGuidancePlan {
  const hasObjectSurface =
    flags.hasObjectSearchHybrid ||
    flags.hasObjectSearchBasic ||
    flags.hasObjectList ||
    flags.hasObjectGet;

  return {
    hasObjectSurface,
    hasCandidateSurface: flags.hasCandidateSubmit,
    hasLearnedGuidanceSurface: flags.hasLearnedGuidancePlan,
    hasSessionSurface: flags.hasSessionGet || flags.hasSessionUpdate,
    searchFamilies: flags.hasObjectSearchHybrid
      ? [
          "response_style",
          "project_fact",
          "recurring_procedure",
          "workflow_improvement",
          "project_rule",
          "unmet_need",
        ]
      : [],
    applicationFamilies: hasObjectSurface ? ["recurring_procedure", "workflow_improvement"] : [],
    captureFamilies: flags.hasCandidateSubmit ? [...DURABLE_MEMORY_GUIDANCE_FAMILY_IDS] : [],
  };
}

export function buildDurableMemoryApplicationSelection(params: {
  availableTools: Set<string>;
}): DurableMemoryApplicationSelection | null {
  const profile = buildDurableMemoryBehaviorProfile(params);
  return profile ? buildDurableMemoryApplicationSelectionFromProfile(profile) : null;
}

export function buildDurableMemoryApplicationSelectionFromProfile(
  profile: DurableMemoryBehaviorProfile,
): DurableMemoryApplicationSelection {
  const guidancePlan = resolveDurableMemoryGuidancePlan(profile.flags);
  const selectedItems: DurableMemorySelectedApplicationItem[] = [];
  const suppressedItems: DurableMemorySuppressedApplicationItem[] = [];

  for (const family of profile.families) {
    const selectedGuidanceKinds: DurableMemoryApplicationGuidanceKind[] = [];
    const selectionReasonCodes: string[] = [];
    const suppressedGuidanceKinds: DurableMemoryApplicationGuidanceKind[] = [];
    const suppressionReasonCodes: string[] = [];

    if (guidancePlan.searchFamilies.includes(family.familyId)) {
      selectedGuidanceKinds.push("search");
      selectionReasonCodes.push("search_surface_available");
    } else {
      suppressedGuidanceKinds.push("search");
      suppressionReasonCodes.push(
        guidancePlan.hasObjectSurface
          ? "search_surface_not_enabled_for_family"
          : "object_surface_unavailable",
      );
    }

    if (guidancePlan.applicationFamilies.includes(family.familyId)) {
      selectedGuidanceKinds.push("application");
      selectionReasonCodes.push("application_surface_available");
    } else {
      suppressedGuidanceKinds.push("application");
      suppressionReasonCodes.push(
        guidancePlan.hasObjectSurface
          ? "application_surface_not_enabled_for_family"
          : "object_surface_unavailable",
      );
    }

    if (guidancePlan.captureFamilies.includes(family.familyId)) {
      selectedGuidanceKinds.push("capture");
      selectionReasonCodes.push("candidate_surface_available");
    } else {
      suppressedGuidanceKinds.push("capture");
      suppressionReasonCodes.push("candidate_surface_unavailable");
    }

    if (selectedGuidanceKinds.length > 0) {
      selectedItems.push({
        familyId: family.familyId,
        applicationMode: family.applicationMode,
        directUseOnlyOnClearAsk: family.directUseOnlyOnClearAsk,
        retrievalMode: family.retrievalMode,
        promptSection: family.promptSection,
        selectedGuidanceKinds,
        selectionReasonCodes,
        searchGuidance: selectedGuidanceKinds.includes("search") ? family.searchGuidance : [],
        applicationGuidance: selectedGuidanceKinds.includes("application")
          ? family.applicationGuidance
          : [],
        captureGuidance: selectedGuidanceKinds.includes("capture") ? family.captureGuidance : [],
      });
    }

    if (suppressedGuidanceKinds.length > 0) {
      suppressedItems.push({
        familyId: family.familyId,
        applicationMode: family.applicationMode,
        suppressedGuidanceKinds,
        suppressionReasonCodes,
      });
    }
  }

  return {
    flags: profile.flags,
    queryIntent: {
      kind: "tool_surface_guidance",
      hasObjectSurface: guidancePlan.hasObjectSurface,
      hasCandidateSurface: guidancePlan.hasCandidateSurface,
      hasLearnedGuidanceSurface: guidancePlan.hasLearnedGuidanceSurface,
      hasSessionSurface: guidancePlan.hasSessionSurface,
    },
    selectedItems,
    suppressedItems,
    renderingHints: guidancePlan,
  };
}

export function renderDurableMemoryBehaviorProfile(
  profile: DurableMemoryBehaviorProfile,
): string[] {
  return renderDurableMemoryApplicationSelection(
    buildDurableMemoryApplicationSelectionFromProfile(profile),
  );
}

export function renderDurableMemoryApplicationSelection(
  selection: DurableMemoryApplicationSelection,
): string[] {
  const lines: string[] = ["## Durable Memory"];
  const guidancePlan = selection.renderingHints;
  const selectedGuidance = new Set(
    selection.selectedItems.flatMap((item) =>
      item.selectedGuidanceKinds.map((kind) => `${item.familyId}:${kind}`),
    ),
  );

  const hasSelectedGuidance = (
    familyId: DurableMemoryGuidanceFamilyId,
    kind: DurableMemoryApplicationGuidanceKind,
  ): boolean => selectedGuidance.has(`${familyId}:${kind}`);

  if (guidancePlan.hasObjectSurface) {
    lines.push(
      "Use approved durable memory only when it can materially change the answer. Candidate backlog is not durable memory unless you are explicitly reviewing candidates.",
    );

    if (selection.flags.hasObjectSearchHybrid) {
      if (hasSelectedGuidance("response_style", "search")) {
        lines.push(
          "Behavior memory: for durable user preferences, corrections, or response-style requirements, search approved feedback memory first and apply the stored style when it is relevant to the reply.",
        );
      }
      if (
        hasSelectedGuidance("project_fact", "search") ||
        hasSelectedGuidance("project_rule", "search") ||
        hasSelectedGuidance("unmet_need", "search")
      ) {
        lines.push(
          "Project memory: for named-project asks, search approved project memory first and use the top fact, rule, or unmet-need result that directly matches the question instead of blending adjacent project families.",
        );
      }
      if (hasSelectedGuidance("workflow_improvement", "search")) {
        lines.push(
          selection.flags.hasLearnedGuidancePlan
            ? 'Workflow guidance: for workflow-preflight asks such as "before I land/push/do this", "preflight", or "what should I double-check first", prefer memory_learned_guidance_plan and keep the result suggestion-only. For direct repo-operating lookup asks, keep using approved workflow search and surface only the top directly relevant hint or two.'
            : "Workflow guidance: for repo-operating, provider-troubleshooting, or environment-constraint asks, search approved workflow guidance first and surface only the top directly relevant hint or two.",
        );
      }
      if (hasSelectedGuidance("recurring_procedure", "search")) {
        lines.push(
          "Procedure memory: for clear checklist or recurring-step asks, search validated procedures first; for nearby advice, surface the stored checklist suggestion-first instead of forcing it.",
        );
      }
    }

    lines.push(
      "If approved durable memory directly answers the question, use it in the normal reply. If nothing relevant is stored, answer normally.",
    );
  }

  if (guidancePlan.hasCandidateSurface) {
    lines.push(
      "Use memory_candidate_submit for bounded durable items when the user explicitly asks to store them, or when they make a clear in-scope durable correction.",
    );
    lines.push(
      "Capture scope: response-style requirements and durable user corrections, explicit named-project facts, reusable named procedures, and repo-local workflow lessons, project rules, or unmet needs.",
    );
    lines.push(
      "Natural correction phrasing still counts for bounded durable items, but do not store transient chatter, one-off logistics, secrets, or plain favorite statements that low-risk auto-capture may already handle.",
    );
  }

  if (guidancePlan.hasSessionSurface) {
    lines.push(
      "Use memory_session_get and memory_session_update for bounded session state and active task context. Keep durable learnings in candidate memory, not only in session state.",
    );
  }

  lines.push("");
  return lines;
}

function buildFamilyProfile(familyId: DurableMemoryGuidanceFamilyId): MemoryBehaviorFamilyProfile {
  const definition = getDurableMemoryGuidanceFamilyDefinition(familyId);
  return {
    familyId,
    applicationMode: definition.applicationMode,
    directUseOnlyOnClearAsk: definition.directUseOnlyOnClearAsk,
    retrievalMode: definition.retrievalMode,
    promptSection: definition.promptSection,
    searchGuidance: buildFamilySearchGuidance(familyId),
    applicationGuidance: buildFamilyApplicationGuidance(familyId),
    captureGuidance: buildFamilyCaptureGuidance(familyId),
  };
}

function buildFamilySearchGuidance(familyId: DurableMemoryGuidanceFamilyId): string[] {
  switch (familyId) {
    case "response_style":
      return [
        "For user preference, default, correction, or response-style requirement questions, prefer memory_object_search_hybrid with kind=feedback and approved-only scope before falling back to generic memory_search. Use memory_search afterward only when you need workspace notes or broader context.",
        "When the question is about a specific response-style requirement, include the exact style in the hybrid-search query, such as plain English, bullet points, no tables, concise replies, or numbered steps, so the most relevant approved memory wins over adjacent style memories.",
      ];
    case "project_fact":
      return [
        "For direct named-project fact questions, prefer memory_object_search_hybrid with kind=project and approved-only scope before falling back to generic memory_search. This includes both the older typed project fields and newer approved generic named-project reference facts.",
      ];
    case "recurring_procedure":
      return [
        "For clear asks about a stored checklist or recurring procedure, prefer memory_object_search_hybrid with kind=procedure and scope=include_validated_procedures before falling back to generic memory_search.",
        "For nearby deploy, release, triage, investigation, or other clearly named recurring workflow-area asks where a stored checklist may help, also prefer memory_object_search_hybrid with kind=procedure and scope=include_validated_procedures even if the user did not say checklist.",
      ];
    case "workflow_improvement":
      return [
        'For workflow-preflight asks framed like "before I land/push/do this", "preflight", or "what should I double-check first", prefer memory_learned_guidance_plan when that tool is available. Keep the query close to the current task and let retrieval fallback handle no-guidance or disabled results.',
        "For direct repo-operating or provider-troubleshooting lookup asks where a remembered workflow lesson may matter, prefer memory_object_search_hybrid with kind=project and approved-only scope before falling back to generic memory_search. This includes both the older bounded workflow lessons and newer approved generic workflow guidance. When asking what to use, avoid, or trust for a repo-local scope, include the scope plus the competing actions or signals in the hybrid query so the most relevant approved generic lesson wins.",
      ];
    case "project_rule":
      return [
        "For direct asks about how a named project should be operated, queried, or trusted, also use memory_object_search_hybrid with kind=project and approved-only scope, and include the explicit project name plus the competing actions, sources, or signals so an approved project rule can outrank adjacent project facts or workflow guidance.",
      ];
    case "unmet_need":
      return [
        "For direct asks about what a named project is still missing, still needs, or should have next, also use memory_object_search_hybrid with kind=project and approved-only scope, and include the explicit project name plus the missing capability or gap subject so approved unmet-need recommendations can surface without falling back to generic search.",
      ];
  }
}

function buildFamilyApplicationGuidance(familyId: DurableMemoryGuidanceFamilyId): string[] {
  switch (familyId) {
    case "recurring_procedure":
      return [
        "If a validated procedure exists and the user clearly asks for that checklist, recurring procedure, or recurring steps, return it directly. If the user only asks for nearby advice, you may mention that a stored checklist exists, but do not silently force it as the only answer.",
        "For nearby advice asks that match a stored checklist, surface it suggestion-first as an option or relevant checklist rather than silently treating it as mandatory workflow.",
      ];
    case "workflow_improvement":
      return [
        "If approved workflow-improvement memory exists for a relevant tool, repo-operating ask, or known environment constraint, surface only the top directly relevant guidance hint or two and omit weak adjacent lessons. Do not turn it into an autonomous action or silently mutate the plan.",
      ];
    default:
      return [];
  }
}

function buildFamilyCaptureGuidance(familyId: DurableMemoryGuidanceFamilyId): string[] {
  switch (familyId) {
    case "response_style":
      return [
        "If the user states a bounded recurring response requirement in plain language, such as keep replies concise, use bullet points when listing items, use plain English, do not use tables unless asked, or use numbered steps when giving instructions, submit it as a learning candidate.",
      ];
    case "project_fact":
      return [
        "If the user states a tightly bounded named project fact in explicit declarative form, such as For project Atlas, the staging branch is atlas-staging or For project Atlas, the evidence dashboard is atlas-rollout, submit it as a learning candidate. Keep the broader generic path bounded to explicit reference-like project facts rather than speculative summaries.",
      ];
    case "recurring_procedure":
      return [
        "If the user explicitly teaches a reusable named checklist with bounded steps, such as my deploy checklist or my release checklist followed by numbered or bulleted steps, submit it as kind=procedure.",
      ];
    case "workflow_improvement":
      return [
        "If the user explicitly teaches a repo-local workflow lesson in plain language, with a bounded scope plus a recommended action, avoided action, or trusted signal, submit it as kind=improvement. This includes both the older named lessons and broader review-first guidance such as use pnpm test -- <path-or-filter> instead of raw vitest, use scripts/committer for commits, avoid git stash in multi-agent work, use pnpm check:fast for docs-only work, use pnpm memory:proof for bounded memory proof, trust /readyz for readiness instead of /healthz, python is not available here so use node/tsx, gateway POST /tools/invoke is forbidden here so use direct runtime invocation, OpenAI embeddings here still need a configured OPENAI_API_KEY or another embeddings provider because openai-codex OAuth profiles do not satisfy the embeddings path directly, or Anthropic Extra usage required for long context requests means context1m needs an eligible credential or fallback posture.",
      ];
    case "project_rule":
      return [
        "If the user explicitly teaches a durable named-project operating rule in plain language, such as For project Atlas, use generated migration IDs for audit events instead of client timestamps, also submit it as kind=improvement rather than trying to coerce it into a named project fact.",
      ];
    case "unmet_need":
      return [
        "If the user explicitly teaches a durable named-project unmet need in plain language, such as For project Atlas, we need a release evidence template for rollout audits, also submit it as kind=improvement. Keep it recommendation-only rather than turning it into procurement, install, or approval work.",
      ];
  }
}
