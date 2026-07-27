// Tests cover immutable, non-content evidence and compliance artifacts.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAcquisitionManifest,
  createClaimLedger,
  createComplianceEvent,
  type XAcquisitionManifestV4Input,
} from "./contracts.js";
import {
  XEvidenceArtifactCollisionError,
  resolveEvidenceArtifactsDir,
  writeAcquisitionManifest,
  writeClaimLedger,
  writeComplianceEvent,
} from "./evidence-store.js";

const tempDirs: string[] = [];
const EVIDENCE_RELATIVE_DIR = ["artifacts", "business-ops", "x-acquisition-manifests-v4"];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function manifestInput(): XAcquisitionManifestV4Input {
  return {
    versions: { request: "v1", subject: "v1", purpose: "v2", method: "v3", query: "v4" },
    request: { id: "req-1", correlationId: "corr-1" },
    subject: { kind: "post", ids: ["post-2", "post-1"] },
    purpose: { code: "market-research" },
    method: { name: "search" },
    query: {
      text: "open source database",
      filters: { language: "en", minLikes: 10 },
      window: { limit: 20 },
    },
    endpoint: {
      name: "search-posts",
      tool: "x_search",
      url: "https://api.example.test/search?token=removed&q=db",
    },
    evidence: {
      ids: ["result-2", "result-1"],
      urls: ["https://example.test/2", "https://example.test/1"],
      hashes: ["sha256:bbb", "sha256:aaa"],
      citations: [{ id: "result-1", url: "https://example.test/1", hash: "sha256:aaa" }],
      publicMetrics: { reposts: 3, likes: 10 },
    },
    resources: { requests: 2, retries: 1, retryDelayMs: 250, bytes: 512, durationMs: 20 },
    cost: { currency: "USD", amount: 0.01 },
    errors: [{ code: "RATE_LIMIT", category: "provider", retryable: true }],
    pagination: { page: 1, pageSize: 20, cursorHash: "sha256:cursor", hasMore: true },
    provenance: {
      model: { provider: "openai", name: "gpt-5", version: "2026-07" },
      toolCall: { id: "call-1", name: "x_search", version: "v1" },
    },
  };
}

async function createWorkspace(prefix: string): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

function evidenceArtifactsDir(workspaceDir: string): string {
  return path.join(workspaceDir, ...EVIDENCE_RELATIVE_DIR);
}

describe("x evidence store", () => {
  it("normalizes immutable manifests without content, identity, raw payload, or credentials", () => {
    const manifest = createAcquisitionManifest(manifestInput());
    const rendered = JSON.stringify(manifest);

    expect(manifest).toMatchObject({
      schema: "x_acquisition_manifest.v4",
      subject: { ids: ["post-1", "post-2"] },
      resources: { requests: 2, retries: 1, retryDelayMs: 250 },
    });
    const descriptiveMethod = createAcquisitionManifest({
      ...manifestInput(),
      versions: {
        ...manifestInput().versions,
        method: "query usefulness: topic + influence + questions",
      },
    });
    expect(descriptiveMethod.versions.method).toBe(
      "query usefulness: topic + influence + questions",
    );
    expect(manifest.endpoint.url).toBe("https://api.example.test/search");
    expect(manifest.query).toMatchObject({ digest: expect.stringMatching(/^sha256:/) });
    expect(manifest.query).not.toHaveProperty("text");
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.evidence.urls)).toBe(true);
    expect(rendered).not.toMatch(
      /postText|profileBio|username|location|rawPayload|credentials|token/i,
    );
    expect(() =>
      createAcquisitionManifest({
        ...manifestInput(),
        evidence: { ...manifestInput().evidence, rawPayload: { body: "never" } },
      } as never),
    ).toThrow(/forbidden field/i);
    expect(() =>
      createAcquisitionManifest({
        ...manifestInput(),
        subject: { ...manifestInput().subject, username: "never-retain" },
      } as never),
    ).toThrow(/forbidden field/i);
  });

  it("produces identical content-addressed refs for equivalent object ordering", async () => {
    const workspaceDir = await createWorkspace("x-evidence-");
    const first = await writeAcquisitionManifest({ input: manifestInput(), workspaceDir });
    const input = manifestInput();
    const second = await writeAcquisitionManifest({
      input: { ...input, query: { ...input.query, filters: { minLikes: 10, language: "en" } } },
      workspaceDir,
    });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      created: false,
      digest: first.digest,
      ref: first.ref,
      path: first.path,
    });
    expect(await fs.readFile(first.path, "utf8")).toMatch(/^\{"cost":/);
  });

  it("keeps acquisition manifests distinct for separate captures", async () => {
    const workspaceDir = await createWorkspace("x-evidence-captures-");
    const firstInput = manifestInput();
    const first = await writeAcquisitionManifest({ input: firstInput, workspaceDir });
    const second = await writeAcquisitionManifest({
      input: { ...firstInput, request: { ...firstInput.request, id: "req-2" } },
      workspaceDir,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.digest).not.toBe(first.digest);
    expect(second.ref).not.toBe(first.ref);
  });

  it("uses only the native workspace root and detects a mismatched digest path", async () => {
    const workspaceDir = await createWorkspace("x-evidence-workspace-");
    const operationalDir = await createWorkspace("x-operational-artifacts-");
    const env = {
      OPENCLAW_WORKSPACE_DIR: workspaceDir,
      OPENCLAW_WORKSPACE: "/home/node/.openclaw/workspace/src/openclaw",
      OPENCLAW_ARTIFACTS_DIR: operationalDir,
    };
    expect(resolveEvidenceArtifactsDir({ env })).toBe(evidenceArtifactsDir(workspaceDir));
    expect(resolveEvidenceArtifactsDir({ workspaceDir, env: {} })).toBe(
      evidenceArtifactsDir(workspaceDir),
    );
    expect(() =>
      resolveEvidenceArtifactsDir({
        env: {
          OPENCLAW_WORKSPACE: "/home/node/.openclaw/workspace",
          OPENCLAW_ARTIFACTS_DIR: operationalDir,
        },
      }),
    ).toThrow(/OPENCLAW_WORKSPACE_DIR/);

    const result = await writeAcquisitionManifest({
      input: manifestInput(),
      env,
    });
    await fs.writeFile(result.path, "tampered\n", "utf8");
    await expect(writeAcquisitionManifest({ input: manifestInput(), env })).rejects.toBeInstanceOf(
      XEvidenceArtifactCollisionError,
    );
  });

  it("rejects relative workspace roots instead of deriving identity from cwd", () => {
    expect(() => resolveEvidenceArtifactsDir({ workspaceDir: "workspace/src/openclaw" })).toThrow(
      /absolute workspace directory/,
    );
  });

  it.runIf(process.platform !== "win32")(
    "rejects an artifacts symlink that redirects writes outside the workspace",
    async () => {
      const workspaceDir = await createWorkspace("x-evidence-symlink-workspace-");
      const operationalDir = await createWorkspace("x-evidence-symlink-operational-");
      await fs.symlink(operationalDir, path.join(workspaceDir, "artifacts"), "dir");

      await expect(
        writeAcquisitionManifest({ input: manifestInput(), workspaceDir }),
      ).rejects.toThrow();
      await expect(fs.readdir(operationalDir)).resolves.toEqual([]);
    },
  );

  it("writes bounded immutable compliance events", async () => {
    const workspaceDir = await createWorkspace("x-compliance-");
    const input = {
      eventId: "event-1",
      type: "takedown" as const,
      occurredAt: "2026-07-16T00:00:00.000Z",
      subject: { kind: "post" as const, ids: ["post-1"] },
      reasonCodes: ["copyright", "requester-verified"],
      manifestDigest: "sha256:manifest",
    };
    const event = createComplianceEvent(input);
    const result = await writeComplianceEvent({ input, workspaceDir });

    expect(Object.isFrozen(event)).toBe(true);
    expect(result.artifact).toEqual(event);
    expect(result.digest).toBe(
      `sha256:${createHash("sha256")
        .update(await fs.readFile(result.path, "utf8"), "utf8")
        .digest("hex")}`,
    );
    expect(() =>
      createComplianceEvent({
        ...input,
        reasonCodes: Array.from({ length: 17 }, () => "too-many"),
      }),
    ).toThrow(/16 items/);
  });

  it("validates and writes a model-authored claim ledger without deriving semantics", async () => {
    const workspaceDir = await createWorkspace("x-claim-ledger-");
    const input = {
      ledgerId: "ledger-1",
      authoredAt: "2026-07-16T00:00:00.000Z",
      methodVersion: "influence-map.v1",
      model: { provider: "xai", name: "grok-4", version: null },
      claims: [
        {
          claimId: "claim-1",
          statement: "The observed account repeatedly discusses nuclear supply constraints.",
          sources: [
            { sourceId: "post-1", status: "support" as const, evidenceDigest: "sha256:aaa" },
            { sourceId: "post-2", status: "contrary" as const, evidenceDigest: null },
          ],
          asOf: "2026-07-16T00:00:00.000Z",
          confidence: 0.72,
          limitations: ["Bounded sample; not a longitudinal conclusion."],
          invalidation: { state: "active" as const, at: null, reason: null },
        },
      ],
    };

    const ledger = createClaimLedger(input);
    const result = await writeClaimLedger({ input, workspaceDir });
    expect(ledger).toMatchObject({ schema: "x_claim_ledger.v1", claims: [{ claimId: "claim-1" }] });
    expect(Object.isFrozen(ledger.claims)).toBe(true);
    expect(result.artifact).toEqual(ledger);
    expect(await fs.readFile(result.path, "utf8")).not.toContain("rawPayload");

    expect(() =>
      createClaimLedger({
        ...input,
        claims: [
          {
            ...input.claims[0]!,
            invalidation: {
              state: "invalidated" as const,
              at: null,
              reason: null,
            },
          },
        ],
      }),
    ).toThrow(/requires invalidation at and reason/);
  });
});
