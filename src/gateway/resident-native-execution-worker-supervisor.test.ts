import { describe, expect, it, vi } from "vitest";
import { ResidentNativeExecutionWorkerSupervisor } from "./resident-native-execution-worker-supervisor.js";

const agentRuntime = {} as never;

function runResult(claimed: boolean) {
  return {
    claimed,
    completed: claimed,
    failed: false,
    status: claimed ? "completed" : "idle",
    runtimeJobId: claimed ? "job-claimed" : null,
    sessionId: claimed ? "session-claimed" : null,
    agentProfile: claimed ? "execution-coding" : null,
    workerId: "worker-1",
    reasonCodes: [],
  } as never;
}

describe("ResidentNativeExecutionWorkerSupervisor", () => {
  it("owns resident queue dispatch and drains claimed jobs until the queue is empty", async () => {
    const runNativeExecutionRuntimeJob = vi
      .fn()
      .mockResolvedValueOnce(runResult(true))
      .mockResolvedValueOnce(runResult(true))
      .mockResolvedValueOnce(runResult(false));
    const supervisor = new ResidentNativeExecutionWorkerSupervisor({
      runtimeJobs: { recordEvent: vi.fn() } as never,
      workQueue: {} as never,
      agentRuntime,
      runNativeExecutionRuntimeJob,
    });

    supervisor.wakeQueue({ workerId: "worker-1", queueName: "native-execution-session" });
    await supervisor.drain();

    expect(runNativeExecutionRuntimeJob).toHaveBeenCalledTimes(3);
    expect(runNativeExecutionRuntimeJob.mock.calls.map(([input]) => input.queueName)).toEqual([
      "native-execution-session",
      "native-execution-session",
      "native-execution-session",
    ]);
  });

  it("schedules child native sessions back through the resident supervisor", async () => {
    const runNativeExecutionRuntimeJob = vi.fn(async (input) => {
      if (!input.runtimeJobId) {
        await input.launchNativeExecutionSession?.({
          runtimeJobId: "child-job-1",
          sessionId: "child-session-1",
          agentProfile: "execution-coding",
          workerId: "worker-1:child",
          queueName: "native-execution-session",
        });
      }
      return runResult(false);
    });
    const supervisor = new ResidentNativeExecutionWorkerSupervisor({
      runtimeJobs: { recordEvent: vi.fn() } as never,
      workQueue: {} as never,
      agentRuntime,
      runNativeExecutionRuntimeJob,
    });

    supervisor.wakeQueue({ workerId: "worker-1", queueName: "native-execution-session" });
    await supervisor.drain();
    await supervisor.drain();

    expect(runNativeExecutionRuntimeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeJobId: "child-job-1",
        workerId: "worker-1:child",
        queueName: "native-execution-session",
      }),
    );
  });

  it("records bounded dispatch failure evidence for explicit job wakes", async () => {
    const recordEvent = vi.fn();
    const supervisor = new ResidentNativeExecutionWorkerSupervisor({
      runtimeJobs: { recordEvent } as never,
      workQueue: {} as never,
      agentRuntime,
      runNativeExecutionRuntimeJob: vi.fn(async () => {
        throw new Error("dispatch blew up with details");
      }),
    });

    supervisor.wake({
      runtimeJobId: "runtime-job-1",
      workerId: "worker-1",
      queueName: "native-execution-session",
    });
    await supervisor.drain();

    expect(recordEvent).toHaveBeenCalledWith({
      jobId: "runtime-job-1",
      eventType: "runtime_worker.dispatch_failed",
      workerId: "worker-1",
      data: expect.objectContaining({
        schedulerClass: "resident_native_execution_worker_supervisor",
        queueName: "native-execution-session",
        errorName: "Error",
        errorMessage: "dispatch blew up with details",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      }),
    });
  });
});
