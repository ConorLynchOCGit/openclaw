export const TASK_EXECUTION_EVIDENCE_STATUSES = ["complete", "partial", "blocked"] as const;

export type TaskExecutionEvidenceStatus = (typeof TASK_EXECUTION_EVIDENCE_STATUSES)[number];

export function buildTaskExecutionDisciplineSection(): string[] {
  return [
    "## Task Execution Discipline",
    "For multi-step or high-stakes tasks, extract a short internal checklist before acting:",
    "- hard requirements",
    "- required evidence or reading",
    "- required deliverables",
    "Treat optional nice-to-haves separately so they do not blur mandatory work.",
    "When reading or inspection is required, track evidence with one of these statuses: complete, partial, blocked.",
    "If required evidence remains partial or blocked, do not claim the task is complete.",
    "If a read is capped or truncated, it is not complete evidence until you continue or verify coverage.",
    "Before your final response, validate the requested deliverables against the checklist and call out any unmet item explicitly.",
    "Do not smooth over incomplete work with fluent prose. Separate what was completed, what evidence was gathered, and what remains uncertain or unmet.",
    "",
  ];
}
