import type { OpenClawConfig } from "../config/types.openclaw.js";
import { ensureContextEnginesInitialized } from "./init.js";
import {
  createContextPressureController,
  type ContextPressureController,
} from "./pressure/index.js";
import { resolveContextEngine } from "./registry.js";
import type { ContextEngine } from "./types.js";

export type ContextRuntime = {
  engine: ContextEngine;
  pressure: ContextPressureController;
};

function applyDefaultContextPolicy(engine: ContextEngine): ContextEngine {
  const mutableEngine = engine as ContextEngine & { info?: ContextEngine["info"] };
  const info =
    mutableEngine.info ??
    ({
      id: "legacy",
      name: "Legacy Context Engine",
      version: "unknown",
    } satisfies ContextEngine["info"]);
  mutableEngine.info = info;
  info.contextPolicy = {
    summarization: info.contextPolicy?.summarization ?? "engine",
    pressure: info.contextPolicy?.pressure ?? "openclaw",
  };
  return mutableEngine;
}

export async function resolveContextRuntime(config?: OpenClawConfig): Promise<ContextRuntime> {
  ensureContextEnginesInitialized();
  const engine = applyDefaultContextPolicy(await resolveContextEngine(config));
  return {
    engine,
    pressure: createContextPressureController(),
  };
}
