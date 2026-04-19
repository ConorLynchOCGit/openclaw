import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  installVitestNoOutputWatchdog,
  resolveVitestCacheIdentity,
  resolveVitestExecutionEnv,
  resolveVitestFsModuleCachePath,
  resolveVitestNodeArgs,
  resolveVitestNoOutputTimeoutMs,
  resolveVitestSpawnParams,
  shouldSuppressVitestStderrLine,
} from "../../scripts/run-vitest.mjs";

describe("scripts/run-vitest", () => {
  it("adds --no-maglev to vitest child processes by default", () => {
    expect(resolveVitestNodeArgs({ PATH: "/usr/bin" })).toEqual(["--no-maglev"]);
  });

  it("adds an explicit old-space budget when configured", () => {
    expect(
      resolveVitestNodeArgs({
        OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB: "6144",
        PATH: "/usr/bin",
      }),
    ).toEqual(["--max-old-space-size=6144", "--no-maglev"]);
  });

  it("allows opting back into Maglev explicitly", () => {
    expect(
      resolveVitestNodeArgs({
        OPENCLAW_VITEST_ENABLE_MAGLEV: "1",
        PATH: "/usr/bin",
      }),
    ).toEqual([]);
    expect(
      resolveVitestNodeArgs({
        OPENCLAW_VITEST_ENABLE_MAGLEV: "1",
        OPENCLAW_TEST_MAX_OLD_SPACE_SIZE_MB: "4096",
        PATH: "/usr/bin",
      }),
    ).toEqual(["--max-old-space-size=4096"]);
  });

  it("parses the optional no-output timeout env", () => {
    expect(resolveVitestNoOutputTimeoutMs({})).toBeNull();
    expect(resolveVitestNoOutputTimeoutMs({ OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS: "2500" })).toBe(
      2500,
    );
    expect(
      resolveVitestNoOutputTimeoutMs({ OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS: "0" }),
    ).toBeNull();
  });

  it("spawns vitest in a detached process group on Unix hosts", () => {
    expect(resolveVitestSpawnParams({ PATH: "/usr/bin" }, "darwin")).toEqual({
      env: { PATH: "/usr/bin" },
      detached: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    expect(resolveVitestSpawnParams({ PATH: "/usr/bin" }, "win32")).toEqual({
      env: { PATH: "/usr/bin" },
      detached: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
  });

  it("suppresses rolldown plugin timing noise while keeping other stderr intact", () => {
    expect(
      shouldSuppressVitestStderrLine(
        "\u001b[33m[PLUGIN_TIMINGS] Warning:\u001b[0m plugin `foo` was slow\n",
      ),
    ).toBe(true);
    expect(shouldSuppressVitestStderrLine("real failure output\n")).toBe(false);
  });

  it("derives a stable cache identity from config and targets", () => {
    expect(
      resolveVitestCacheIdentity([
        "run",
        "--config",
        "test/vitest/vitest.tooling.config.ts",
        "test/scripts/run-vitest.test.ts",
      ]),
    ).toBe("test/vitest/vitest.tooling.config.ts--test/scripts/run-vitest.test.ts");
  });

  it("assigns a stable direct-run fs module cache path outside CI", () => {
    expect(
      resolveVitestFsModuleCachePath(
        [
          "run",
          "--config",
          "test/vitest/vitest.tooling.config.ts",
          "test/scripts/run-vitest.test.ts",
        ],
        {
          cwd: "/repo",
          env: {},
          platform: "linux",
        },
      ),
    ).toBe(
      "/repo/node_modules/.experimental-vitest-cache/test-vitest-vitest.tooling.config.ts--test-scripts-run-vitest.test.ts",
    );
  });

  it("leaves explicit fs module cache paths alone", () => {
    const executionEnv = resolveVitestExecutionEnv(["run", "foo.test.ts"], {
      env: {
        OPENCLAW_VITEST_FS_MODULE_CACHE_PATH: "/tmp/cache",
      },
      cwd: "/repo",
      platform: "linux",
    });
    expect(executionEnv.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH).toBe("/tmp/cache");
  });

  it("kills silent vitest runs after the configured idle timeout", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const timeoutSpy = vi.fn();
      const forceKillSpy = vi.fn();
      const logSpy = vi.fn();

      const teardown = installVitestNoOutputWatchdog({
        streams: [stdout],
        timeoutMs: 1000,
        forceKillAfterMs: 5000,
        log: logSpy,
        onTimeout: timeoutSpy,
        onForceKill: forceKillSpy,
        setTimeoutFn: setTimeout,
        clearTimeoutFn: clearTimeout,
      });

      vi.advanceTimersByTime(900);
      expect(timeoutSpy).not.toHaveBeenCalled();

      stdout.emit("data", "still alive");
      vi.advanceTimersByTime(900);
      expect(timeoutSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] no output for 1000ms; terminating stalled Vitest process group.",
      );

      vi.advanceTimersByTime(5000);
      expect(forceKillSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] process group still alive after 5000ms; sending SIGKILL.",
      );

      teardown();
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes the runner label in watchdog logs when provided", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const logSpy = vi.fn();

      installVitestNoOutputWatchdog({
        streams: [stdout],
        timeoutMs: 1000,
        forceKillAfterMs: 0,
        label: "run --config test/vitest/vitest.secrets.config.ts",
        log: logSpy,
        onTimeout: () => {},
      });

      vi.advanceTimersByTime(1000);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] no output for 1000ms; terminating stalled Vitest process group (run --config test/vitest/vitest.secrets.config.ts).",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
