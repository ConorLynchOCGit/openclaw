// Task readback progress is a projection of native session evidence, not task state.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { loadGatewaySessionRow } from "./session-utils.js";
import type { ActiveProgressCapsule } from "./session-utils.types.js";

function taskSessionCandidates(task: TaskRecord): string[] {
  const candidates = [task.childSessionKey, task.requesterSessionKey, task.ownerKey]
    .map((value) => normalizeOptionalString(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

export function resolveTaskActiveProgressCapsule(
  task: TaskRecord,
): ActiveProgressCapsule | undefined {
  if (task.status !== "running" && task.status !== "queued") {
    return undefined;
  }
  for (const sessionKey of taskSessionCandidates(task)) {
    try {
      const row = loadGatewaySessionRow(sessionKey, {
        includeDerivedTitles: false,
        includeLastMessage: false,
      });
      const activeProgress = row?.readbackProvenance?.activeProgress ?? row?.activeProgress;
      if (activeProgress?.bounded) {
        return activeProgress;
      }
    } catch {
      // Missing or unreadable session evidence should leave task readback generic.
    }
  }
  return undefined;
}
