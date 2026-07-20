import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareAcceptedRelease: vi.fn(),
  buildReleasePreparationEnvironment: vi.fn(() => ({ SAFE: "1" })),
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
}));

vi.mock("../../infra/release-preparation.js", () => ({
  prepareAcceptedRelease: mocks.prepareAcceptedRelease,
}));
vi.mock("../../infra/release-preparation-handoff.js", () => ({
  buildReleasePreparationEnvironment: mocks.buildReleasePreparationEnvironment,
}));
vi.mock("../../runtime.js", () => ({
  defaultRuntime: { log: mocks.log, error: mocks.error, exit: mocks.exit },
}));
vi.mock("../cli-utils.js", () => ({
  runCommandWithRuntime: async (
    _runtime: unknown,
    run: () => Promise<void>,
    onError?: (error: unknown) => void,
  ) => {
    try {
      await run();
    } catch (error) {
      onError?.(error);
    }
  },
}));

import { registerReleaseCommand } from "./register.release.js";

describe("registerReleaseCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareAcceptedRelease.mockResolvedValue({
      schema: "openclaw.release.prepare.result.v1",
      codingTaskId: "task-1",
      acceptedReleaseReceiptId: "a".repeat(64),
    });
  });

  it("runs preparation from only a Coding task ID", async () => {
    const program = new Command();
    program.exitOverride();
    registerReleaseCommand(program);
    await program.parseAsync([
      "node",
      "openclaw",
      "release",
      "prepare",
      "--coding-task",
      "task-1",
      "--json",
    ]);

    expect(mocks.prepareAcceptedRelease).toHaveBeenCalledWith({
      codingTaskId: "task-1",
      env: { SAFE: "1" },
    });
    expect(mocks.log).toHaveBeenCalledWith(
      JSON.stringify(await mocks.prepareAcceptedRelease.mock.results[0]?.value, null, 2),
    );
  });
});
