import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

export const gatewayServerHttpTestInclude = [
  "src/gateway/embeddings-http.test.ts",
  "src/gateway/models-http.test.ts",
  "src/gateway/openai-http.test.ts",
  "src/gateway/openresponses-http.test.ts",
  "src/gateway/probe.auth.integration.test.ts",
  "src/gateway/control-ui.auto-root.http.test.ts",
  "src/gateway/control-ui.http.test.ts",
  "src/gateway/mcp-http.test.ts",
  "src/gateway/server-http.probe.test.ts",
  "src/gateway/server-http.stages.test.ts",
  "src/gateway/server-http.hooks-request-timeout.test.ts",
  "src/gateway/server.plugin-http-auth.test.ts",
  "src/gateway/server.plugins-http.test.ts",
  "src/gateway/session-kill-http.test.ts",
  "src/gateway/tools-invoke-http.test.ts",
];

export function createGatewayServerHttpVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(gatewayServerHttpTestInclude, {
    dir: "src/gateway",
    env,
    name: "gateway-server-http",
    passWithNoTests: true,
  });
}

export default createGatewayServerHttpVitestConfig();
