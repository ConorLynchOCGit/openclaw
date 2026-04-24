import {
  createMemoryIngestionFailureTelemetry,
  createMemoryIngestionTelemetryEvent,
} from "./telemetry.ts";
import type { MemoryIngestionPipelineStage, MemoryIngestionTelemetryEvent } from "./types.ts";

export class MemoryIngestionPipeline {
  constructor(
    private readonly input: {
      path: MemoryIngestionTelemetryEvent["path"];
      emitTelemetry?: (event: MemoryIngestionTelemetryEvent) => void | Promise<void>;
    },
  ) {}

  async run(stages: MemoryIngestionPipelineStage[]): Promise<MemoryIngestionTelemetryEvent[]> {
    const emitted: MemoryIngestionTelemetryEvent[] = [];
    const emit = async (event: MemoryIngestionTelemetryEvent) => {
      emitted.push(event);
      await this.input.emitTelemetry?.(event);
    };

    for (const stage of stages) {
      await emit(
        createMemoryIngestionTelemetryEvent({
          path: this.input.path,
          stage: stage.stage,
          status: "started",
        }),
      );
      try {
        const result = await stage.run();
        await emit(
          createMemoryIngestionTelemetryEvent({
            path: this.input.path,
            stage: stage.stage,
            status: result.status,
            ...result.telemetry,
          }),
        );
      } catch (error) {
        await emit(
          createMemoryIngestionFailureTelemetry({
            path: this.input.path,
            stage: stage.stage,
            error,
          }),
        );
        throw error;
      }
    }

    return emitted;
  }
}
