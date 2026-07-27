// Verifies the small lifecycle callback adapter used during agent attempts.
import { describe, expect, it } from "vitest";
import {
  buildAgentAttemptTerminalTaskEventMetadata,
  createAgentAttemptLifecycleCallbacks,
  type AgentAttemptLifecycleState,
} from "./attempt-callbacks.js";

describe("createAgentAttemptLifecycleCallbacks", () => {
  it("tracks user-message persistence without closing over the agent command scope", () => {
    const state: AgentAttemptLifecycleState = {
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

    callbacks.onAgentEvent({ stream: "lifecycle", data: { phase: "end" } });
    expect(state.lifecycleEnded).toBe(true);
  });

  it("retains deferred lifecycle errors without marking the attempt terminal", () => {
    const state: AgentAttemptLifecycleState = {
      currentTurnUserMessagePersisted: false,
      lifecycleFinishing: false,
      lifecycleEnded: false,
    };
    const callbacks = createAgentAttemptLifecycleCallbacks(state);

    callbacks.onAgentEvent({
      stream: "lifecycle",
      data: { phase: "finishing", error: "provider failed" },
    });

    expect(state.lifecycleError).toBe("provider failed");
    expect(state.lifecycleFinishing).toBe(true);
    expect(state.lifecycleEnded).toBe(false);
  });

  it("replaces a failed candidate lifecycle when a retry starts", () => {
    const state: AgentAttemptLifecycleState = {
      currentTurnUserMessagePersisted: true,
      lifecycleError: "provider failed",
      lifecycleFinishing: true,
      lifecycleEnded: false,
    };
    const callbacks = createAgentAttemptLifecycleCallbacks(state);

    callbacks.onAgentEvent({ stream: "lifecycle", data: { phase: "start" } });

    expect(state).toEqual({
      currentTurnUserMessagePersisted: true,
      lifecycleError: undefined,
      lifecycleFinishing: false,
      lifecycleEnded: false,
    });
  });

  it("retains native provider metadata from a deferred attempt terminal", () => {
    const state: AgentAttemptLifecycleState = {
      currentTurnUserMessagePersisted: false,
      lifecycleFinishing: false,
      lifecycleEnded: false,
    };
    const callbacks = createAgentAttemptLifecycleCallbacks(state);

    callbacks.onAgentEvent({
      stream: "lifecycle",
      data: {
        phase: "finishing",
        taskEventMetadata: {
          providerState: "failed",
          providerCause: "disconnect",
          providerAttemptStatus: "failed",
        },
      },
    });

    expect(state.terminalTaskEventMetadata).toEqual({
      providerState: "failed",
      providerCause: "disconnect",
      providerAttemptStatus: "failed",
    });
  });

  it("lets recovered fallback and local postprocessing facts override attempt metadata", () => {
    expect(
      buildAgentAttemptTerminalTaskEventMetadata({
        attemptMetadata: {
          providerState: "failed",
          providerCause: "disconnect",
          providerAttemptStatus: "failed",
        },
        fallbackMetadata: {
          providerState: "fallback_recovered",
          providerAttemptStatus: "succeeded",
        },
      }),
    ).toEqual({
      providerState: "fallback_recovered",
      providerCause: "disconnect",
      providerAttemptStatus: "succeeded",
    });

    expect(
      buildAgentAttemptTerminalTaskEventMetadata({
        attemptMetadata: { providerCause: "disconnect" },
        postprocessingFailed: true,
      }),
    ).toEqual({
      providerState: "postprocessing_failed",
      providerCause: "local_postprocessing",
      providerAttemptStatus: "succeeded",
    });
  });
});
