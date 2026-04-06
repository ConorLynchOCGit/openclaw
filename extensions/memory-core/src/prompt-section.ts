import type { MemoryPromptSectionBuilder } from "openclaw/plugin-sdk/memory-core-host-runtime-core";

export const buildPromptSection: MemoryPromptSectionBuilder = ({
  availableTools,
  citationsMode,
}) => {
  const hasMemorySearch = availableTools.has("memory_search");
  const hasMemoryGet = availableTools.has("memory_get");
  const hasCandidateSubmit = availableTools.has("memory_candidate_submit");
  const hasObjectList = availableTools.has("memory_object_list");
  const hasObjectGet = availableTools.has("memory_object_get");
  const hasObjectSearchBasic = availableTools.has("memory_object_search_basic");
  const hasObjectSearchHybrid = availableTools.has("memory_object_search_hybrid");
  const hasSessionGet = availableTools.has("memory_session_get");
  const hasSessionUpdate = availableTools.has("memory_session_update");

  const hasRecallSection = hasMemorySearch || hasMemoryGet;
  const hasDurableMemorySection =
    hasCandidateSubmit ||
    hasObjectList ||
    hasObjectGet ||
    hasObjectSearchBasic ||
    hasObjectSearchHybrid ||
    hasSessionGet ||
    hasSessionUpdate;

  if (!hasRecallSection && !hasDurableMemorySection) {
    return [];
  }

  const lines: string[] = [];

  if (hasRecallSection) {
    let toolGuidance: string;
    if (hasMemorySearch && hasMemoryGet) {
      toolGuidance =
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines. If low confidence after search, say you checked.";
    } else if (hasMemorySearch) {
      toolGuidance =
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md and answer from the matching results. If low confidence after search, say you checked.";
    } else {
      toolGuidance =
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos that already point to a specific memory file or note: run memory_get to pull only the needed lines. If low confidence after reading them, say you checked.";
    }

    lines.push("## Memory Recall", toolGuidance);
    if (citationsMode === "off") {
      lines.push(
        "Citations are disabled: do not mention file paths or line numbers in replies unless the user explicitly asks.",
      );
    } else {
      lines.push(
        "Citations: include Source: <path#line> when it helps the user verify memory snippets.",
      );
    }
    lines.push("");
  }

  if (hasDurableMemorySection) {
    lines.push("## Durable Memory");

    if (hasObjectSearchHybrid || hasObjectSearchBasic || hasObjectList || hasObjectGet) {
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
      if (hasObjectSearchHybrid) {
        lines.push(
          "For user preference, default, correction, or response-style requirement questions, prefer memory_object_search_hybrid with kind=feedback and approved-only scope before falling back to generic memory_search. Use memory_search afterward only when you need workspace notes or broader context.",
        );
        lines.push(
          "When the question is about a specific response-style requirement, include the exact style in the hybrid-search query, such as plain English, bullet points, no tables, concise replies, or numbered steps, so the most relevant approved memory wins over adjacent style memories.",
        );
        lines.push(
          "For direct named-project fact questions, prefer memory_object_search_hybrid with kind=project and approved-only scope before falling back to generic memory_search.",
        );
        lines.push(
          "For clear asks about a stored checklist or recurring procedure, prefer memory_object_search_hybrid with kind=procedure and scope=include_validated_procedures before falling back to generic memory_search.",
        );
        lines.push(
          "For nearby deploy, release, triage, or investigation asks where a stored checklist may help, also prefer memory_object_search_hybrid with kind=procedure and scope=include_validated_procedures even if the user did not say checklist.",
        );
        lines.push(
          "For repo-operating asks about running tests, making scoped commits, or git-state safety, prefer memory_object_search_hybrid with kind=project and approved-only scope before falling back to generic memory_search when a remembered workflow hint may matter.",
        );
      }
      lines.push(
        "If an approved durable memory result directly answers the question, use it in the normal reply without asking the user to restate it. If no approved result exists, answer normally and say you did not find stored memory only when that context matters.",
      );
      lines.push(
        "If a validated procedure exists and the user clearly asks for that checklist or recurring steps, return it directly. If the user only asks for nearby advice, you may mention that a stored checklist exists, but do not silently force it as the only answer.",
      );
      lines.push(
        "For nearby advice asks that match a stored checklist, surface it suggestion-first as an option or relevant checklist rather than silently treating it as mandatory workflow.",
      );
      lines.push(
        "If approved workflow-improvement memory exists for a relevant tool or repo-operating ask, surface it as a bounded guidance hint or gotcha to avoid. Do not turn it into an autonomous action or silently mutate the plan.",
      );
    }

    if (hasCandidateSubmit) {
      lines.push(
        "When the user shares a recurring requirement, important correction, reusable procedure, or project improvement that should survive beyond the current turn, submit a concise candidate with memory_candidate_submit.",
      );
      lines.push(
        "Natural correction phrasing still counts: if the user says things like Actually, No, I meant, Sorry, or That's not right to correct a durable preference, default, recurring requirement, or tightly bounded named project fact, submit it as kind=correction even without an explicit save request.",
      );
      lines.push(
        "If the user states a bounded recurring response requirement in plain language, such as keep replies concise, use bullet points when listing items, use plain English, do not use tables unless asked, or use numbered steps when giving instructions, submit it as a learning candidate.",
      );
      lines.push(
        "If the user states a tightly bounded named project fact in explicit declarative form, such as For project Atlas, the staging branch is atlas-staging, submit it as a learning candidate.",
      );
      lines.push(
        "If the user explicitly teaches a reusable named checklist with bounded steps, such as my deploy checklist or my release checklist followed by numbered or bulleted steps, submit it as kind=procedure.",
      );
      lines.push(
        "If the user shares a repeated repo-local tool gotcha such as use pnpm test -- <path-or-filter> instead of raw vitest, use scripts/committer for commits, or avoid git stash in multi-agent work, submit it as kind=improvement.",
      );
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

    if (hasSessionGet || hasSessionUpdate) {
      lines.push(
        "Use memory_session_get and memory_session_update for bounded session state and active task context. Keep durable learnings in candidate memory, not only in session state.",
      );
    }

    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("## Memory Recall", "No memory tools are available in this run.");
  }
  return lines;
};
