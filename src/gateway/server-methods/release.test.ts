import { beforeEach, describe, expect, it, vi } from "vitest";

const startReleasePreparationHandoff = vi.hoisted(() => vi.fn());
vi.mock("../../infra/release-preparation-handoff.js", () => ({
  startReleasePreparationHandoff,
}));

import { releaseHandlers } from "./release.js";

describe("release.prepare gateway method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startReleasePreparationHandoff.mockResolvedValue({
      status: "started",
      operationId: "operation-1",
      unitName: "openclaw-release-prepare-operation-1.service",
    });
  });

  it("passes only the validated Coding task ID to the handoff", async () => {
    const respond = vi.fn();
    await releaseHandlers["release.prepare"]({
      params: { codingTaskId: "task-1" },
      respond,
      client: null,
      context: {},
    } as never);

    expect(startReleasePreparationHandoff).toHaveBeenCalledWith({ codingTaskId: "task-1" });
    expect(respond).toHaveBeenCalledWith(true, {
      status: "started",
      operationId: "operation-1",
      unitName: "openclaw-release-prepare-operation-1.service",
    });
  });

  it("rejects extra path authority before invoking the handoff", async () => {
    const respond = vi.fn();
    await releaseHandlers["release.prepare"]({
      params: { codingTaskId: "task-1", packagePath: "/tmp/release.tgz" },
      respond,
      client: null,
      context: {},
    } as never);

    expect(startReleasePreparationHandoff).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(false, undefined, expect.any(Object));
  });
});
