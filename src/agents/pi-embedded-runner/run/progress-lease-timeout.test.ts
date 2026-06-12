import { describe, expect, it, vi } from "vitest";
import { createProgressLeaseTimeout } from "./progress-lease-timeout.js";

describe("createProgressLeaseTimeout", () => {
  it("expires when no progress occurs inside the lease window", () => {
    vi.useFakeTimers();
    try {
      const onExpire = vi.fn();
      const lease = createProgressLeaseTimeout({
        leaseMs: 1000,
        onExpire,
        now: () => Date.now(),
      });

      lease.start();
      vi.advanceTimersByTime(999);
      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onExpire).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "initial",
          progressCount: 0,
          ignoredRepeatedProgressCount: 0,
          lastProgressAt: null,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the lease on meaningful progress", () => {
    vi.useFakeTimers();
    try {
      const onExpire = vi.fn();
      const lease = createProgressLeaseTimeout({
        leaseMs: 1000,
        onExpire,
        now: () => Date.now(),
      });

      lease.start();
      vi.advanceTimersByTime(900);
      lease.recordProgress("tool_result", "tool:read:1");
      vi.advanceTimersByTime(900);
      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(onExpire).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "progress",
          progressCount: 1,
          progressLabel: "tool_result",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reset for repeated identical progress signatures", () => {
    vi.useFakeTimers();
    try {
      const onExpire = vi.fn();
      const lease = createProgressLeaseTimeout({
        leaseMs: 1000,
        onExpire,
        now: () => Date.now(),
      });

      lease.start();
      vi.advanceTimersByTime(900);
      lease.recordProgress("tool_result", "tool:read:same-args");
      vi.advanceTimersByTime(900);
      lease.recordProgress("tool_result", "tool:read:same-args");

      vi.advanceTimersByTime(99);
      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(onExpire).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "progress",
          progressCount: 1,
          ignoredRepeatedProgressCount: 1,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports explicit compaction-grace scheduling", () => {
    vi.useFakeTimers();
    try {
      const onExpire = vi.fn();
      const lease = createProgressLeaseTimeout({
        leaseMs: 1000,
        onExpire,
        now: () => Date.now(),
      });

      lease.start();
      lease.schedule(250, "compaction-grace");
      vi.advanceTimersByTime(250);

      expect(onExpire).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "compaction-grace",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
