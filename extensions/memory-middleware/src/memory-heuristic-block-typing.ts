import type { NormalizedMemoryBlock } from "./memory-source-normalization.js";

export type HeuristicMemoryBlockType =
  | "response_style_candidate"
  | "project_fact_candidate"
  | "procedure_candidate"
  | "workflow_routing_candidate"
  | "ignore";

export function typeNormalizedMemoryBlockHeuristically(
  block: NormalizedMemoryBlock,
): HeuristicMemoryBlockType {
  const text = block.blockText.trim().toLowerCase();
  if (!text) {
    return "ignore";
  }
  if (
    block.listKind !== "none" ||
    /\b(?:phase order|checklist|steps?|procedure|gate)\b/.test(text)
  ) {
    return "procedure_candidate";
  }
  if (
    /\b(?:plain english|avoid jargon|bullet points|numbered steps|do not use tables|keep responses concise|keep it short|shorter replies|start with the direct answer)\b/.test(
      text,
    ) ||
    (/\b(?:file|files|path|paths)\b/.test(text) &&
      /\b(?:refer|reference|referencing|relative)\b/.test(text))
  ) {
    return "response_style_candidate";
  }
  if (
    /\b(?:default branch|staging branch|repository url|deployment url|documentation url|runbook url|primary package manager|primary environment)\b/.test(
      text,
    )
  ) {
    return "project_fact_candidate";
  }
  if (
    /^(?:use|trust|avoid|do not|don't|update|follow|run|treat|keep)\b/.test(text) ||
    /^for [a-z0-9][a-z0-9 /_-]{1,80} docs,\s*(?:use|trust|avoid|do not|don't|update|follow|run|treat|keep)\b/.test(
      text,
    ) ||
    /^for project [a-z0-9][a-z0-9 /_-]{1,80},\s*we(?:'re| are)\s+missing\b/.test(text) ||
    /^for project [a-z0-9][a-z0-9 /_-]{1,80},\s*we need\b/.test(text) ||
    /\b(?:workflow|runbook|landing gate|release policy|testing|readyz|healthz)\b/.test(text) ||
    /(?:\bpnpm\b|scripts\/committer|git diff --check|fast_commit)/.test(text)
  ) {
    return "workflow_routing_candidate";
  }
  return "ignore";
}
