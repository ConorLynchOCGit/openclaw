import { Type } from "@sinclair/typebox";
import {
  readSessionTodo,
  updateSessionTodo,
  type SessionTodoUpdateResult,
} from "../../config/sessions/todo.js";
import type { SessionTodoPriority, SessionTodoState } from "../../config/sessions/types.js";
import { emitAgentPlanEvent } from "../../infra/agent-events.js";
import { stringEnum } from "../schema/typebox.js";
import {
  describeReadTodoTool,
  describeUpdatePlanTool,
  READ_TODO_TOOL_DISPLAY_SUMMARY,
  UPDATE_PLAN_TOOL_DISPLAY_SUMMARY,
} from "../tool-description-presets.js";
import { type AnyAgentTool, ToolInputError, readStringParam } from "./common.js";

const PLAN_STEP_STATUSES = ["pending", "in_progress", "completed"] as const;
const PLAN_STEP_PRIORITIES = ["low", "normal", "high"] as const;

const UpdatePlanToolSchema = Type.Object({
  explanation: Type.Optional(
    Type.String({
      description: "Optional short note explaining what changed in the plan.",
    }),
  ),
  plan: Type.Array(
    Type.Object(
      {
        step: Type.String({
          description: "Brief task description.",
        }),
        status: stringEnum(PLAN_STEP_STATUSES, {
          description: 'One of "pending", "in_progress", or "completed".',
        }),
        priority: Type.Optional(
          stringEnum(PLAN_STEP_PRIORITIES, {
            description: 'Optional priority: "low", "normal", or "high".',
          }),
        ),
      },
      { additionalProperties: true },
    ),
    {
      minItems: 1,
      description: "Ordered todo items for the current run.",
    },
  ),
});

type UpdatePlanStep = {
  step: string;
  status: (typeof PLAN_STEP_STATUSES)[number];
  priority?: SessionTodoPriority;
};

function readPlanSteps(params: Record<string, unknown>): UpdatePlanStep[] {
  const rawPlan = params.plan;
  if (!Array.isArray(rawPlan) || rawPlan.length === 0) {
    throw new ToolInputError("plan required");
  }

  const steps = rawPlan.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new ToolInputError(`plan[${index}] must be an object`);
    }
    const stepParams = entry as Record<string, unknown>;
    const step = readStringParam(stepParams, "step", {
      required: true,
      label: `plan[${index}].step`,
    });
    const status = readStringParam(stepParams, "status", {
      required: true,
      label: `plan[${index}].status`,
    });
    if (!PLAN_STEP_STATUSES.includes(status as (typeof PLAN_STEP_STATUSES)[number])) {
      throw new ToolInputError(
        `plan[${index}].status must be one of ${PLAN_STEP_STATUSES.join(", ")}`,
      );
    }
    const priority = readStringParam(stepParams, "priority", {
      label: `plan[${index}].priority`,
    });
    if (
      priority !== undefined &&
      !PLAN_STEP_PRIORITIES.includes(priority as (typeof PLAN_STEP_PRIORITIES)[number])
    ) {
      throw new ToolInputError(
        `plan[${index}].priority must be one of ${PLAN_STEP_PRIORITIES.join(", ")}`,
      );
    }
    return {
      step,
      status: status as (typeof PLAN_STEP_STATUSES)[number],
      ...(priority ? { priority: priority as SessionTodoPriority } : {}),
    };
  });

  return steps;
}

type UpdatePlanToolOptions = {
  sessionKey?: string;
  storePath?: string;
  runId?: string;
  now?: () => number;
};

function buildTodoDetails(result: SessionTodoUpdateResult | null) {
  if (!result) {
    return undefined;
  }
  if (!result.persisted) {
    return {
      persisted: false,
      reason: result.reason,
      sessionKey: result.sessionKey,
      todoRef: result.todoRef,
    };
  }
  return {
    persisted: true,
    sessionKey: result.sessionKey,
    todoRef: result.todoRef,
    updatedAt: result.todo.updatedAt,
    eventId: result.event.eventId,
    items: result.todo.items,
    itemCount: result.event.itemCount,
    completedCount: result.event.completedCount,
    inProgressCount: result.event.inProgressCount,
  };
}

function buildTodoReadDetails(params: {
  sessionKey?: string;
  todo: SessionTodoState | null;
  missingReason?: "missing_session_context" | "missing_store_path";
}) {
  if (params.missingReason) {
    return {
      status: "unavailable" as const,
      reason: params.missingReason,
    };
  }
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return {
      status: "unavailable" as const,
      reason: "missing_session_context" as const,
    };
  }
  const todoRef = `openclaw-session-todo://${encodeURIComponent(sessionKey)}`;
  if (!params.todo) {
    return {
      status: "empty" as const,
      sessionKey,
      todoRef,
      itemCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      items: [],
      history: [],
    };
  }
  const completedCount = params.todo.items.filter((item) => item.status === "completed").length;
  const inProgressCount = params.todo.items.filter((item) => item.status === "in_progress").length;
  return {
    status: "ok" as const,
    sessionKey,
    todoRef,
    updatedAt: params.todo.updatedAt,
    itemCount: params.todo.items.length,
    completedCount,
    inProgressCount,
    items: params.todo.items,
    history: params.todo.history.map((event) => ({
      eventId: event.eventId,
      updatedAt: event.updatedAt,
      itemCount: event.itemCount,
      completedCount: event.completedCount,
      inProgressCount: event.inProgressCount,
    })),
  };
}

function formatPlanUpdateText(params: {
  explanation?: string;
  plan: readonly UpdatePlanStep[];
  todoResult: SessionTodoUpdateResult | null;
}): string {
  const items =
    params.todoResult?.persisted === true
      ? params.todoResult.todo.items.map((item) => ({
          content: item.content,
          status: item.status,
          priority: item.priority,
        }))
      : params.plan.map((item) => ({
          content: item.step,
          status: item.status,
          priority: item.priority ?? "normal",
        }));
  return JSON.stringify(items, null, 2);
}

export function createUpdatePlanTool(options: UpdatePlanToolOptions = {}): AnyAgentTool {
  return {
    label: "Update Plan",
    name: "update_plan",
    displaySummary: UPDATE_PLAN_TOOL_DISPLAY_SUMMARY,
    description: describeUpdatePlanTool(),
    parameters: UpdatePlanToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const explanation = readStringParam(params, "explanation");
      const plan = readPlanSteps(params);
      const sessionKey = options.sessionKey?.trim();
      const storePath = options.storePath?.trim();
      const todoResult =
        sessionKey && storePath
          ? await updateSessionTodo({
              storePath,
              sessionKey,
              explanation,
              sourceToolCallId: _toolCallId,
              now: options.now?.(),
              items: plan.map((step) => ({
                content: step.step,
                status: step.status,
                priority: step.priority,
              })),
            })
          : null;
      if (options.runId?.trim()) {
        emitAgentPlanEvent({
          runId: options.runId.trim(),
          ...(sessionKey ? { sessionKey } : {}),
          data: {
            phase: "update",
            title: "Todo updated",
            ...(explanation ? { explanation } : {}),
            steps: plan.map((step) => step.step),
            items:
              todoResult?.persisted === true
                ? todoResult.todo.items
                : plan.map((step, index) => ({
                    content: step.step,
                    status: step.status,
                    priority: step.priority ?? "normal",
                    position: index + 1,
                  })),
            source: "update_plan",
            eventType: "todo.updated",
            ...(todoResult ? { todoRef: todoResult.todoRef } : {}),
            ...(todoResult?.persisted === true
              ? {
                  itemCount: todoResult.event.itemCount,
                  completedCount: todoResult.event.completedCount,
                  inProgressCount: todoResult.event.inProgressCount,
                }
              : {}),
          },
        });
      }
      return {
        content: [
          {
            type: "text" as const,
            text: formatPlanUpdateText({ explanation, plan, todoResult }),
          },
        ],
        details: {
          status: "updated" as const,
          ...(explanation ? { explanation } : {}),
          plan,
          ...(todoResult ? { todo: buildTodoDetails(todoResult) } : {}),
        },
      };
    },
  };
}

export function createReadTodoTool(options: UpdatePlanToolOptions = {}): AnyAgentTool {
  return {
    label: "Read Todo",
    name: "read_todo",
    displaySummary: READ_TODO_TOOL_DISPLAY_SUMMARY,
    description: describeReadTodoTool(),
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async () => {
      const sessionKey = options.sessionKey?.trim();
      const storePath = options.storePath?.trim();
      const details =
        sessionKey && storePath
          ? buildTodoReadDetails({
              sessionKey,
              todo: readSessionTodo({ storePath, sessionKey }),
            })
          : buildTodoReadDetails({
              sessionKey,
              todo: null,
              missingReason: sessionKey ? "missing_store_path" : "missing_session_context",
            });
      return {
        content: [],
        details,
      };
    },
  };
}
