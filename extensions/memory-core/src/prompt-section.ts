import type { MemoryPromptSectionBuilder } from "openclaw/plugin-sdk/memory-core-host-runtime-core";
import {
  buildDurableMemoryBehaviorProfile,
  renderDurableMemoryBehaviorProfile,
} from "./behavior-profile.js";

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
    const profile = buildDurableMemoryBehaviorProfile({ availableTools });
    if (profile) {
      lines.push(...renderDurableMemoryBehaviorProfile(profile));
    }
  }

  if (lines.length === 0) {
    lines.push("## Memory Recall", "No memory tools are available in this run.");
  }
  return lines;
};
