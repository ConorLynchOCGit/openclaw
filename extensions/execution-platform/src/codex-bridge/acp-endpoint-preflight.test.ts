import { describe, expect, it } from "vitest";
import { runAcpEndpointSetupPreflight } from "./acp-endpoint-setup.ts";

describe("ACP endpoint setup preflight", () => {
  it("reports the exact missing config key without fake success", async () => {
    await expect(
      runAcpEndpointSetupPreflight({ env: {}, codexHome: "/tmp/openclaw-missing-codex-auth" }),
    ).resolves.toMatchObject({
      status: "codex_auth_missing",
      exactMissingValues: expect.arrayContaining(["OPENCLAW_ACP_ENDPOINT_URL"]),
      fakeSuccessClaimed: false,
    });
  });

  it("does not use Codex auth as endpoint proof", async () => {
    await expect(
      runAcpEndpointSetupPreflight({
        endpointUrl: "ws://127.0.0.1:28789",
        codexAuth: {
          artifactKind: "acp_codex_auth_discovery",
          codexHome: "/tmp/codex",
          authJsonPresent: true,
          configTomlPresent: true,
          credentialKinds: ["openai_api_key"],
          authMode: "apikey",
          secretValuesRead: false,
          secretValuesStored: false,
        },
        probe: () => false,
      }),
    ).resolves.toMatchObject({
      status: "acp_endpoint_unavailable",
      fakeSuccessClaimed: false,
      endpointPreflight: {
        endpointConfigured: true,
        endpointAvailable: false,
      },
    });
  });

  it("records configured endpoint probe result", async () => {
    await expect(
      runAcpEndpointSetupPreflight({
        endpointUrl: "ws://127.0.0.1:28789",
        codexAuth: {
          artifactKind: "acp_codex_auth_discovery",
          codexHome: "/tmp/codex",
          authJsonPresent: true,
          configTomlPresent: true,
          credentialKinds: ["openai_api_key"],
          authMode: "apikey",
          secretValuesRead: false,
          secretValuesStored: false,
        },
        probe: () => true,
      }),
    ).resolves.toMatchObject({
      status: "ready_for_real_acp_endpoint_run",
      fakeSuccessClaimed: false,
      endpointPreflight: {
        endpointConfigured: true,
        endpointAvailable: true,
        mode: "real_endpoint_available",
      },
    });
  });
});
