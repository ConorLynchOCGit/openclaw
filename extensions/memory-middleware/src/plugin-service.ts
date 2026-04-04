import type { OpenClawPluginService } from "../api.js";
import { createOrdinaryTurnAutoCaptureController } from "./ordinary-turn-auto-capture.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";

export function createMemoryMiddlewarePluginService(
  runtime: MemoryMiddlewareRuntime,
  subscribeToTranscriptUpdates?:
    | Parameters<typeof createOrdinaryTurnAutoCaptureController>[0]["subscribe"]
    | undefined,
): OpenClawPluginService {
  let ordinaryTurnAutoCapture:
    | ReturnType<typeof createOrdinaryTurnAutoCaptureController>
    | undefined;

  return {
    id: "memory-middleware-base",
    async start(ctx) {
      if (
        (runtime.config.autoCapture?.profile ?? "disabled") === "disabled" ||
        !subscribeToTranscriptUpdates
      ) {
        return;
      }
      ordinaryTurnAutoCapture = createOrdinaryTurnAutoCaptureController({
        config: runtime.config,
        logger: ctx.logger,
        candidateIngress: runtime.candidateIngress,
        subscribe: subscribeToTranscriptUpdates,
      });
      ordinaryTurnAutoCapture.start();
    },
    async stop() {
      ordinaryTurnAutoCapture?.stop();
      ordinaryTurnAutoCapture = undefined;
    },
  };
}
