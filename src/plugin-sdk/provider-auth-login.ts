// Public interactive auth/login helpers for provider plugins.

import { createLazyRuntimeMethodBinder, createLazyRuntimeModule } from "../shared/lazy-runtime.js";

const loadProviderAuthLoginRuntime = createLazyRuntimeModule(
  () => import("./provider-auth-login.runtime.js"),
);
const bindProviderAuthLoginRuntime = createLazyRuntimeMethodBinder(loadProviderAuthLoginRuntime);

type ProviderAuthLoginRuntime = Awaited<ReturnType<typeof loadProviderAuthLoginRuntime>>;
type GithubCopilotLoginCommand = ProviderAuthLoginRuntime["githubCopilotLoginCommand"];
type LoginChutes = ProviderAuthLoginRuntime["loginChutes"];
type LoginOpenAICodexOAuth = ProviderAuthLoginRuntime["loginOpenAICodexOAuth"];

export const githubCopilotLoginCommand: (
  ...args: Parameters<GithubCopilotLoginCommand>
) => Promise<Awaited<ReturnType<GithubCopilotLoginCommand>>> = bindProviderAuthLoginRuntime(
  (runtime) => runtime.githubCopilotLoginCommand,
);
export const loginChutes: (
  ...args: Parameters<LoginChutes>
) => Promise<Awaited<ReturnType<LoginChutes>>> = bindProviderAuthLoginRuntime(
  (runtime) => runtime.loginChutes,
);
export const loginOpenAICodexOAuth: (
  ...args: Parameters<LoginOpenAICodexOAuth>
) => Promise<Awaited<ReturnType<LoginOpenAICodexOAuth>>> = bindProviderAuthLoginRuntime(
  (runtime) => runtime.loginOpenAICodexOAuth,
);
