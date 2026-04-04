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
        "If an approved durable memory result directly answers the question, use it in the normal reply without asking the user to restate it. If no approved result exists, answer normally and say you did not find stored memory only when that context matters.",
      );
    }

    if (hasCandidateSubmit) {
      lines.push(
        "When the user shares a recurring requirement, important correction, reusable procedure, or project improvement that should survive beyond the current turn, submit a concise candidate with memory_candidate_submit.",
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
