import { resolveCommandSecretRefsViaGateway } from "openclaw/plugin-sdk/memory-core-host-runtime-cli";
import {
  listMemoryEmbeddingProviders,
  loadConfig,
  registerMemoryEmbeddingProvider,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/memory-core-host-runtime-core";
import {
  builtinMemoryEmbeddingProviderAdapters,
  registerBuiltInMemoryEmbeddingProviders,
} from "./memory/provider-adapters.js";

const MEMORY_RUNTIME_SECRET_TARGET_IDS = new Set([
  "agents.defaults.memorySearch.remote.apiKey",
  "agents.list[].memorySearch.remote.apiKey",
]);

export type MemoryCoreRuntimeBootstrapResult = {
  config: OpenClawConfig;
  diagnostics: string[];
  registeredBuiltinProviderIds: string[];
  availableBuiltinProviderIds: string[];
};

export function getMemoryRuntimeSecretTargetIds(): Set<string> {
  return new Set(MEMORY_RUNTIME_SECRET_TARGET_IDS);
}

export async function bootstrapMemoryCoreRuntime(params: {
  commandName: string;
  config?: OpenClawConfig;
}): Promise<MemoryCoreRuntimeBootstrapResult> {
  const inputConfig = params.config ?? loadConfig();
  const { resolvedConfig, diagnostics } = await resolveCommandSecretRefsViaGateway({
    config: inputConfig,
    commandName: params.commandName,
    targetIds: getMemoryRuntimeSecretTargetIds(),
  });

  const builtinIds = new Set(builtinMemoryEmbeddingProviderAdapters.map((adapter) => adapter.id));
  const existingProviderIds = new Set(listMemoryEmbeddingProviders().map((adapter) => adapter.id));
  registerBuiltInMemoryEmbeddingProviders({
    registerMemoryEmbeddingProvider,
  });
  const availableBuiltinProviderIds = listMemoryEmbeddingProviders()
    .map((adapter) => adapter.id)
    .filter((id) => builtinIds.has(id));
  const registeredBuiltinProviderIds = availableBuiltinProviderIds.filter(
    (id) => !existingProviderIds.has(id),
  );

  return {
    config: resolvedConfig,
    diagnostics,
    registeredBuiltinProviderIds,
    availableBuiltinProviderIds,
  };
}
