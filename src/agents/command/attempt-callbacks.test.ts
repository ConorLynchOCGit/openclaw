// Verifies the small lifecycle callback adapter used during agent attempts.
import { describe, expect, it } from "vitest";
import {
  buildAgentAttemptTerminalTaskEventMetadata,
  createAgentAttemptLifecycleCallbacks,
} from "./attempt-callbacks.js";

describe("createAgentAttemptLifecycleCallbacks", () => {
  it("tracks user-message persistence without closing over the agent command scope", () => {
    const state = {
      currentTurnUserMessagePersisted: false,
      lifecycleFinishing: false,
      lifecycleEnded: false,
    };
    const callbacks = createAgentAttemptLifecycleCallbacks(state);

    // The callback mutates only the shared lifecycle state object; it should not
    // need access to the wider runAgentAttempt closure.
    callbacks.onUserMessagePersisted?.({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    });

    expect(state.currentTurnUserMessagePersisted).toBe(true);
    expect(state.lifecycleEnded).toBe(false);
  });

  it("tracks terminal lifecycle phases", () => {
    const state = {
      currentTurnUserMessagePersisted: false,
      lifecycleFinishing: false,
      lifecycleEnded: false,
    };
    const callbacks = createAgentAttemptLifecycleCallbacks(state);

    callbacks.onAgentEvent({ stream: "lifecycle", data: { phase: "start" } });
    expect(state.lifecycleEnded).toBe(false);

    callbacks.onAgentEvent({
      stream: "lifecycle",
      data: {
        phase: "finishing",
        attemptStatus: "error",
        taskEventMetadata: {
          providerState: "retry_recovered",
          providerCause: "disconnect",
        },
      },
    });
    expect(state.lifecycleFinishing).toBe(true);
    expect(state.lifecycleEnded).toBe(false);
    expect(state.terminalTaskEventMetadata).toEqual({
      providerState: "retry_recovered",
      providerCause: "disconnect",
    });

    callbacks.onAgentEvent({ stream: "lifecycle", data: { phase: "end" } });
    expect(state.lifecycleEnded).toBe(true);
  });

  it("preserves retry or fallback cause unless local postprocessing becomes terminal", () => {
    expect(
      buildAgentAttemptTerminalTaskEventMetadata({
        attemptMetadata: {
          providerState: "retry_recovered",
          providerCause: "disconnect",
          providerAttemptStatus: "succeeded",
        },
        fallbackMetadata: {
          providerState: "fallback_recovered",
          providerCause: "overloaded",
          providerAttemptStatus: "succeeded",
        },
      }),
    ).toEqual({
      providerState: "fallback_recovered",
      providerCause: "overloaded",
      providerAttemptStatus: "succeeded",
    });

    expect(
      buildAgentAttemptTerminalTaskEventMetadata({
        fallbackMetadata: {
          providerState: "fallback_recovered",
          providerCause: "overloaded",
        },
        postprocessingFailed: true,
      }),
    ).toEqual({
      providerState: "postprocessing_failed",
      providerCause: "local_postprocessing",
      providerAttemptStatus: "succeeded",
    });
  });
});
