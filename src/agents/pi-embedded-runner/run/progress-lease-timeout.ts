export type ProgressLeaseTimeoutReason = "initial" | "progress" | "compaction-grace";

export type ProgressLeaseTimeoutEvent = {
  reason: ProgressLeaseTimeoutReason;
  progressCount: number;
  ignoredRepeatedProgressCount: number;
  lastProgressAt: number | null;
  idleMs: number | null;
  progressLabel?: string;
};

export type ProgressLeaseTimeoutSnapshot = {
  active: boolean;
  reason: ProgressLeaseTimeoutReason;
  progressCount: number;
  ignoredRepeatedProgressCount: number;
  lastProgressAt: number | null;
  progressLabel?: string;
  lastProgressSignature?: string;
};

export type ProgressLeaseTimeout = {
  start: (reason?: ProgressLeaseTimeoutReason, delayMs?: number) => void;
  schedule: (delayMs: number, reason: ProgressLeaseTimeoutReason) => void;
  recordProgress: (label?: string, signature?: string) => void;
  cancel: () => void;
  snapshot: () => ProgressLeaseTimeoutSnapshot;
};

export function createProgressLeaseTimeout(params: {
  leaseMs: number;
  onExpire: (event: ProgressLeaseTimeoutEvent) => void;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): ProgressLeaseTimeout {
  const now = params.now ?? Date.now;
  const setTimeoutFn = params.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = params.clearTimeoutFn ?? clearTimeout;
  const leaseMs = Math.max(1, Math.floor(params.leaseMs));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let reason: ProgressLeaseTimeoutReason = "initial";
  let progressCount = 0;
  let ignoredRepeatedProgressCount = 0;
  let lastProgressAt: number | null = null;
  let progressLabel: string | undefined;
  let lastProgressSignature: string | undefined;

  const cancelTimer = () => {
    if (timer) {
      clearTimeoutFn(timer);
      timer = undefined;
    }
  };

  const schedule = (delayMs: number, nextReason: ProgressLeaseTimeoutReason) => {
    cancelTimer();
    active = true;
    reason = nextReason;
    timer = setTimeoutFn(
      () => {
        timer = undefined;
        active = false;
        const currentTime = now();
        params.onExpire({
          reason,
          progressCount,
          ignoredRepeatedProgressCount,
          lastProgressAt,
          idleMs: lastProgressAt === null ? null : Math.max(0, currentTime - lastProgressAt),
          progressLabel,
        });
      },
      Math.max(1, Math.floor(delayMs)),
    );
  };

  const start = (nextReason: ProgressLeaseTimeoutReason = "initial", delayMs = leaseMs) => {
    schedule(delayMs, nextReason);
  };

  const recordProgress = (label?: string, signature?: string) => {
    if (!active) {
      return;
    }
    const normalizedSignature =
      typeof signature === "string" && signature.trim() ? signature.trim() : undefined;
    if (normalizedSignature && normalizedSignature === lastProgressSignature) {
      ignoredRepeatedProgressCount += 1;
      return;
    }
    progressCount += 1;
    lastProgressAt = now();
    progressLabel = typeof label === "string" && label.trim() ? label.trim() : undefined;
    lastProgressSignature = normalizedSignature;
    schedule(leaseMs, "progress");
  };

  return {
    start,
    schedule,
    recordProgress,
    cancel: () => {
      active = false;
      cancelTimer();
    },
    snapshot: () => ({
      active,
      reason,
      progressCount,
      ignoredRepeatedProgressCount,
      lastProgressAt,
      progressLabel,
      lastProgressSignature,
    }),
  };
}
