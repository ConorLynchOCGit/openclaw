import {
  getMemoryFamilyDefinition,
  MEMORY_FAMILY_IDS,
  type MemoryFamilyApplicationMode,
  type MemoryFamilyDefinition,
  type MemoryFamilyId,
} from "openclaw/plugin-sdk/memory-family-policy";

type DurableMemoryToolFlags = {
  hasCandidateSubmit: boolean;
  hasObjectGet: boolean;
  hasObjectList: boolean;
  hasObjectSearchBasic: boolean;
  hasObjectSearchHybrid: boolean;
  hasSessionGet: boolean;
  hasSessionUpdate: boolean;
};

export type MemoryBehaviorFamilyProfile = {
  familyId: MemoryFamilyId;
  applicationMode: MemoryFamilyApplicationMode;
  directUseOnlyOnClearAsk: boolean;
  retrievalMode: MemoryFamilyDefinition["retrievalPolicy"]["mode"];
  promptSection: MemoryFamilyDefinition["applicationPolicy"]["promptSection"];
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
  hasSessionSurface: boolean;
  searchFamilies: MemoryFamilyId[];
  applicationFamilies: MemoryFamilyId[];
  captureFamilies: MemoryFamilyId[];
};

export function buildDurableMemoryBehaviorProfile(params: {
  availableTools: Set<string>;
}): DurableMemoryBehaviorProfile | null {
  const flags: DurableMemoryToolFlags = {
    hasCandidateSubmit: params.availableTools.has("memory_candidate_submit"),
    hasObjectGet: params.availableTools.has("memory_object_get"),
    hasObjectList: params.availableTools.has("memory_object_list"),
    hasObjectSearchBasic: params.availableTools.has("memory_object_search_basic"),
    hasObjectSearchHybrid: params.availableTools.has("memory_object_search_hybrid"),
    hasSessionGet: params.availableTools.has("memory_session_get"),
    hasSessionUpdate: params.availableTools.has("memory_session_update"),
  };

  const hasDurableMemorySection =
    flags.hasCandidateSubmit ||
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
    families: MEMORY_FAMILY_IDS.map((familyId) => buildFamilyProfile(familyId)),
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
    captureFamilies: flags.hasCandidateSubmit ? [...MEMORY_FAMILY_IDS] : [],
  };
}

export function renderDurableMemoryBehaviorProfile(
  profile: DurableMemoryBehaviorProfile,
): string[] {
  const lines: string[] = ["## Durable Memory"];
  const guidancePlan = resolveDurableMemoryGuidancePlan(profile.flags);

  if (guidancePlan.hasObjectSurface) {
    lines.push(
      "Before claiming durable long-term memory about a project, preference, decision, correction, or procedure, inspect existing approved memory with the memory_object search/list/get tools when that helps avoid duplicates or contradictions.",
    );
    lines.push(
      "When the user asks about their own preferences, defaults, recurring requirements, or prior corrections, search approved durable memory before answering instead of relying on unstated recollection. Candidate backlog is not durable memory unless you are explicitly reviewing candidates.",
    );
    lines.push(
      "For format-sensitive or step-by-step replies, search approved durable feedback memory for response-style requirements before answering when that can change how you should present the answer.",
    );
    lines.push(
      "If approved durable memory says the user prefers concise replies, bullet points, plain English, no tables, or numbered steps for instructions, follow that preference in the current reply whenever it is relevant instead of treating it as passive metadata.",
    );

    if (profile.flags.hasObjectSearchHybrid) {
      for (const familyId of guidancePlan.searchFamilies) {
        lines.push(...getFamilyProfile(profile, familyId).searchGuidance);
      }
      lines.push(
        "When a direct named-project ask is clearly about where or what something is, use the top fact-like project result. When it is clearly about what to use, trust, or avoid, use the top project-rule result. When it is clearly about what is still missing or needed, use the top unmet-need result. Do not blend adjacent project memories from other families unless they directly corroborate the same answer.",
      );
    }

    lines.push(
      "If an approved durable memory result directly answers the question, use it in the normal reply without asking the user to restate it. If no approved result exists, answer normally and say you did not find stored memory only when that context matters.",
    );
    for (const familyId of guidancePlan.applicationFamilies) {
      lines.push(...getFamilyProfile(profile, familyId).applicationGuidance);
    }
  }

  if (guidancePlan.hasCandidateSurface) {
    lines.push(
      "When the user shares a recurring requirement, important correction, reusable procedure, or project improvement that should survive beyond the current turn, submit a concise candidate with memory_candidate_submit.",
    );
    lines.push(
      "Natural correction phrasing still counts: if the user says things like Actually, No, I meant, Sorry, or That's not right to correct a durable preference, default, recurring requirement, or tightly bounded named project fact, submit it as kind=correction even without an explicit save request.",
    );
    for (const familyId of guidancePlan.captureFamilies) {
      lines.push(...getFamilyProfile(profile, familyId).captureGuidance);
    }
    lines.push(
      "If the user explicitly asks you to store, remember, or save one of those durable items, call memory_candidate_submit before you answer unless the content is disallowed.",
    );
    lines.push(
      "Do not call memory_candidate_submit just because the user naturally states a plain favorite/preferred preference in ordinary conversation; that narrow low-risk preference class may be auto-captured already.",
    );
    lines.push(
      "Do not submit transient chatter, one-off logistics, secrets, credentials, or anything the user asked not to retain. Candidate submission stays bounded even when some low-risk classes auto-promote.",
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

function buildFamilyProfile(familyId: MemoryFamilyId): MemoryBehaviorFamilyProfile {
  const definition = getMemoryFamilyDefinition(familyId);
  return {
    familyId,
    applicationMode: definition.applicationPolicy.mode,
    directUseOnlyOnClearAsk: definition.applicationPolicy.directUseOnlyOnClearAsk,
    retrievalMode: definition.retrievalPolicy.mode,
    promptSection: definition.applicationPolicy.promptSection,
    searchGuidance: buildFamilySearchGuidance(familyId),
    applicationGuidance: buildFamilyApplicationGuidance(familyId),
    captureGuidance: buildFamilyCaptureGuidance(familyId),
  };
}

function getFamilyProfile(
  profile: DurableMemoryBehaviorProfile,
  familyId: MemoryFamilyId,
): MemoryBehaviorFamilyProfile {
  const found = profile.families.find((candidate) => candidate.familyId === familyId);
  if (!found) {
    throw new Error(`unknown behavior profile family: ${familyId}`);
  }
  return found;
}

function buildFamilySearchGuidance(familyId: MemoryFamilyId): string[] {
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
        "For repo-operating or provider-troubleshooting asks where a remembered workflow lesson may matter, prefer memory_object_search_hybrid with kind=project and approved-only scope before falling back to generic memory_search. This includes both the older bounded workflow lessons and newer approved generic workflow guidance. When asking what to use, avoid, or trust for a repo-local scope, include the scope plus the competing actions or signals in the hybrid query so the most relevant approved generic lesson wins.",
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

function buildFamilyApplicationGuidance(familyId: MemoryFamilyId): string[] {
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

function buildFamilyCaptureGuidance(familyId: MemoryFamilyId): string[] {
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
