import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { isSubagentSessionKey } from "openclaw/plugin-sdk/routing";
import { createXComplianceRefreshService } from "./src/compliance-refresh.js";
import {
  createConfiguredXReadTransport,
  createXIntelligenceTools,
  getXIntelligenceRuntime,
  type XIntelligencePluginConfig,
} from "./src/tools.js";
import {
  X_RESEARCH_ADMISSION_NAMESPACE,
  X_RESEARCH_LEGACY_BUDGET_NAMESPACE,
  XResearchAdmission,
} from "./src/x-research-admission.js";

const TOOL_NAMES = ["x_posts", "x_counts", "x_users", "x_timelines", "x_trends", "x_metrics"];
const ADMITTED_TOOL_NAMES = new Set<string>([...TOOL_NAMES, "x_search"]);
const MAX_ADMISSION_RECORDS = 25_000;

function rpcString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function resolveXResearchToolIdentityBlock(params: {
  toolName: string;
  agentId?: string;
  researcherAgentId: string;
}): { block: true; blockReason: string } | undefined {
  if (!ADMITTED_TOOL_NAMES.has(params.toolName) || params.agentId === params.researcherAgentId) {
    return undefined;
  }
  return { block: true, blockReason: "admission_identity_missing_or_unauthorized" };
}

export default definePluginEntry({
  id: "x-intelligence",
  name: "X Intelligence",
  description: "Read-only official X source operations with compliance-aware evidence.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as XIntelligencePluginConfig;
    if (config.enabled === false) {
      return;
    }
    const admission = new XResearchAdmission({
      store: api.runtime.state.openKeyedStore({
        namespace: X_RESEARCH_ADMISSION_NAMESPACE,
        maxEntries: MAX_ADMISSION_RECORDS,
      }),
      priceAuthority: config.researchPriceAuthority,
      legacyBudgetStore: api.runtime.state.openKeyedStore({
        namespace: X_RESEARCH_LEGACY_BUDGET_NAMESPACE,
        maxEntries: 25_000,
      }),
      waitForRun: api.runtime.subagent.waitForRun,
      onCloseoutError: () => {
        api.logger.error("X research admission closeout failed its durable reread.");
      },
    });
    const researcherAgentId = config.researcherAgentId ?? "x-researcher";
    const block = (code: string) => ({ block: true, blockReason: code });
    api.on("before_agent_run", async (event, ctx) => {
      if (ctx.agentId !== researcherAgentId) {
        return undefined;
      }
      const proof = await admission.activateProof({ ...ctx, prompt: event.prompt });
      if (proof.allowed) {
        return undefined;
      }
      if (await admission.isKnownProofRun(ctx.runId)) {
        return { outcome: "block", reason: proof.code };
      }
      if (!isSubagentSessionKey(ctx.sessionKey)) {
        return { outcome: "block", reason: "admission_native_subagent_required" };
      }
      const product = await admission.activateProduct({
        ...ctx,
        prompt: event.prompt,
        researcherAgentId,
      });
      if (!product.allowed) {
        return { outcome: "block", reason: product.code };
      }
      return undefined;
    });
    api.registerTrustedToolPolicy({
      id: "research-admission",
      description: "Enforce cumulative X/Grok research identity, ordering, and spend limits.",
      evaluate: async (event, ctx) => {
        if (!ADMITTED_TOOL_NAMES.has(event.toolName)) {
          return undefined;
        }
        const identityBlock = resolveXResearchToolIdentityBlock({
          toolName: event.toolName,
          agentId: ctx.agentId,
          researcherAgentId,
        });
        if (identityBlock) {
          return identityBlock;
        }
        const reserved = await admission.reserve({
          toolName: event.toolName,
          params: event.params,
          runId: ctx.runId ?? event.runId,
          sessionKey: ctx.sessionKey,
          sessionId: ctx.sessionId,
          agentId: ctx.agentId,
          toolCallId: ctx.toolCallId ?? event.toolCallId,
        });
        if (!reserved.allowed) {
          return block(reserved.code);
        }
        if (reserved.row.rowKind === "probe_benchmark") {
          return {
            params: { ...event.params, research_cache_control: { mode: "bypass" } },
          };
        }
        return undefined;
      },
    });
    api.on("after_tool_call", async (event, ctx) => {
      if (!ADMITTED_TOOL_NAMES.has(event.toolName) || ctx.agentId !== researcherAgentId) {
        return;
      }
      await admission.settle({
        toolName: event.toolName,
        params: event.params,
        runId: ctx.runId ?? event.runId,
        toolCallId: ctx.toolCallId ?? event.toolCallId,
        result: event.result,
        error: event.error,
      });
    });
    api.on("subagent_ended", async (event, ctx) => {
      await admission.terminal({
        runId: event.runId ?? ctx.runId,
        sessionKey: event.targetSessionKey ?? ctx.childSessionKey,
        outcome: event.outcome,
      });
    });
    api.on("gateway_start", async () => {
      await admission.recover();
    });
    api.registerGatewayMethod(
      "x-intelligence.researchAdmission",
      async ({ params, respond }) => {
        const operation = typeof params.operation === "string" ? params.operation : "";
        if (operation === "provision") {
          respond(
            true,
            await admission.provisionSerialized(
              typeof params.manifestJson === "string" ? params.manifestJson : "",
              typeof params.manifestDigest === "string" ? params.manifestDigest : "",
            ),
          );
          return;
        }
        if (operation === "readback") {
          respond(true, await admission.read(rpcString(params.manifestDigest)));
          return;
        }
        if (operation === "launch") {
          respond(
            true,
            await admission.launch({
              manifestDigest: rpcString(params.manifestDigest),
              runId: rpcString(params.runId),
              message: rpcString(params.message),
              run: api.runtime.subagent.run,
            }),
          );
          return;
        }
        throw new Error("x_research_admission_operation_invalid");
      },
      { scope: "operator.admin" },
    );
    if (config.complianceRefresh?.enabled === true) {
      api.registerService(
        createXComplianceRefreshService({
          getCache: async (stateDir) => {
            const runtime = getXIntelligenceRuntime(api, config, stateDir);
            await runtime.hydrate;
            return runtime.cache;
          },
          createTransport: () => createConfiguredXReadTransport(config),
          intervalMs: (config.complianceRefresh.intervalMinutes ?? 360) * 60_000,
          maxIdsPerPass: config.complianceRefresh.maxIdsPerPass ?? 100,
        }),
      );
    }
    api.registerTool((ctx) => createXIntelligenceTools({ api, config, ctx }), {
      names: TOOL_NAMES,
      optional: true,
    });
  },
});
