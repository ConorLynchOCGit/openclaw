// Gateway task events use the same bounded projection as CLI and UI.
import type { TaskSummary } from "../../../packages/gateway-protocol/src/index.js";

export {
  mapTaskSummaries,
  mapTaskSummary,
  taskUpdatedAt,
} from "../../tasks/task-summary-projection.js";

export type TaskEventPayload =
  | { action: "upserted"; task: TaskSummary }
  | { action: "deleted"; taskId: string }
  | { action: "restored" };
