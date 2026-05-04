import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createOutboundNetworkAuthorityProfile,
  recordOutboundNetworkAuthorityProof,
  type OutboundNetworkAuthorityProfile,
} from "./outbound-network-authority-profile.ts";

export type OutboundNetworkLocalMockPilotResult = {
  artifactKind: "codex_bridge_outbound_network_local_mock_pilot";
  profileId: string;
  status: "completed" | "refused";
  mockUrl: string | null;
  requestRedacted: boolean;
  responseRedacted: boolean;
  auditRecorded: boolean;
  realExternalSendPerformed: false;
  blockingReasons: string[];
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => resolve(body));
  });
}

export async function runOutboundNetworkLocalMockPilot(
  input: {
    runtimeJobs?: RuntimeJobRepository;
    runtimeJobId?: string;
    profile?: OutboundNetworkAuthorityProfile;
    payload?: JsonValue;
  } = {},
): Promise<OutboundNetworkLocalMockPilotResult> {
  const profile =
    input.profile ??
    createOutboundNetworkAuthorityProfile({
      allowedDomains: ["127.0.0.1", "localhost"],
      allowedActions: ["local_mock_request"],
    });
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    await readBody(request);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, redacted: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const mockUrl = `http://127.0.0.1:${address.port}/mock-outbound`;
    const proof = await recordOutboundNetworkAuthorityProof({
      runtimeJobs: input.runtimeJobs,
      runtimeJobId: input.runtimeJobId,
      profile,
      targetDomain: "127.0.0.1",
      action: "local_mock_request",
      localMock: true,
      payload: input.payload ?? { message: "redacted-local-mock" },
    });
    if (proof.status === "local_mock_recorded") {
      await fetch(mockUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: "redacted-local-mock" }),
      });
    }
    const result: OutboundNetworkLocalMockPilotResult = {
      artifactKind: "codex_bridge_outbound_network_local_mock_pilot",
      profileId: profile.profileId,
      status: proof.status === "local_mock_recorded" ? "completed" : "refused",
      mockUrl,
      requestRedacted: true,
      responseRedacted: true,
      auditRecorded: proof.status === "local_mock_recorded",
      realExternalSendPerformed: false,
      blockingReasons: proof.blockingReasons,
    };
    if (input.runtimeJobs && input.runtimeJobId) {
      await input.runtimeJobs.attachArtifact({
        jobId: input.runtimeJobId,
        artifactType: "codex_bridge.outbound_network_local_mock_pilot",
        storageKind: "metadata",
        uri: `runtime-job://${input.runtimeJobId}/codex-bridge/outbound-network/local-mock`,
        contentType: "application/json",
        metadata: result as unknown as JsonValue,
      });
    }
    return result;
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
