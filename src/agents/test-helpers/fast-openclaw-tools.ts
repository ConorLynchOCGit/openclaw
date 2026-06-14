import { vi } from "vitest";
import { stubTool } from "./fast-tool-stubs.js";

function stubActionTool(name: string, actions: string[]) {
  return {
    ...stubTool(name),
    parameters: {
      type: "object" as const,
      properties: {
        action: {
          type: "string" as const,
          enum: actions,
        },
      },
      required: ["action"],
    },
  };
}

const coreTools = [
  stubActionTool("canvas", ["create", "read"]),
  stubActionTool("nodes", ["list", "invoke"]),
  stubActionTool("cron", ["schedule", "cancel"]),
  stubActionTool("message", ["send", "reply"]),
  stubActionTool("gateway", ["status"]),
  stubActionTool("agents_list", ["list", "show"]),
  stubActionTool("sessions_list", ["list", "show"]),
  stubActionTool("sessions_history", ["read", "tail"]),
  stubActionTool("sessions_send", ["send", "reply"]),
  stubActionTool("sessions_spawn", ["spawn", "handoff"]),
  stubTool("update_plan"),
  stubTool("read_todo"),
  stubActionTool("subagents", ["list", "show"]),
  stubActionTool("session_status", ["get", "show"]),
  stubTool("tts"),
  stubTool("image_generate"),
  stubTool("video_generate"),
  stubTool("web_fetch"),
  stubTool("image"),
  stubTool("pdf"),
];

vi.mock("../openclaw-tools.js", () => ({
  createOpenClawTools: (options?: {
    nativeTask?: { enabled?: boolean };
    nativeExecutionSession?: {
      enabled?: boolean;
      readWorkQueueEligibility?: unknown;
      startExecutionSession?: unknown;
    };
  }) => [
    ...coreTools.map((tool) => ({ ...tool })),
    ...(options?.nativeExecutionSession?.enabled === true &&
    options.nativeExecutionSession.readWorkQueueEligibility
      ? [stubTool("work_queue_execution_eligibility")]
      : []),
    ...(options?.nativeExecutionSession?.enabled === true &&
    options.nativeExecutionSession.startExecutionSession
      ? [stubTool("start_execution_session")]
      : []),
    ...(options?.nativeTask?.enabled === true ? [stubTool("task")] : []),
  ],
  __testing: {
    setDepsForTest: () => {},
  },
}));
