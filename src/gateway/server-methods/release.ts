import {
  ErrorCodes,
  errorShape,
  validateReleasePrepareParams,
} from "../../../packages/gateway-protocol/src/index.js";
import { startReleasePreparationHandoff } from "../../infra/release-preparation-handoff.js";
import { formatControlPlaneActor, resolveControlPlaneActor } from "../control-plane-audit.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

export const releaseHandlers: GatewayRequestHandlers = {
  "release.prepare": async ({ params, respond, client, context }) => {
    if (!assertValidParams(params, validateReleasePrepareParams, "release.prepare", respond)) {
      return;
    }
    const actor = resolveControlPlaneActor(client);
    try {
      const result = await startReleasePreparationHandoff({
        codingTaskId: params.codingTaskId,
      });
      context?.logGateway?.info(
        `release.prepare ${result.status} ${formatControlPlaneActor(actor)} operation=${result.operationId}`,
      );
      respond(true, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context?.logGateway?.warn(
        `release.prepare rejected ${formatControlPlaneActor(actor)} error=${message}`,
      );
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, message));
    }
  },
};
