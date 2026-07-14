// Control UI module implements session run state behavior.
import type { SessionRunStatus } from "./types.ts";

type SessionRunState = {
  hasActiveRun?: boolean;
  status?: SessionRunStatus;
  finalDelivery?: { state?: "pending" | "settled" | "not_requested" };
};

export function isSessionRunActive(state: SessionRunState): boolean {
  if (state.finalDelivery?.state === "pending") {
    return true;
  }
  if (state.status && state.status !== "running") {
    return false;
  }
  if (typeof state.hasActiveRun === "boolean") {
    return state.hasActiveRun;
  }
  return state.status === "running";
}
