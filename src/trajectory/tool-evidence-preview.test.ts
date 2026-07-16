import { describe, expect, it } from "vitest";
import { formatBoundedToolEvidencePreview } from "./tool-evidence-preview.js";

describe("formatBoundedToolEvidencePreview", () => {
  it("projects bounded x_search evidence without provider content or errors", () => {
    const preview = formatBoundedToolEvidencePreview({
      name: "x_search",
      result: {
        content: [{ type: "text", text: "PRIVATE PROVIDER CONTENT" }],
        details: {
          responseStatus: "completed",
          provider: "openrouter",
          model: "x-ai/grok-4.5",
          citationCount: 4,
          citations: [
            "https://x.com/example/status/1",
            "https://x.com/example/status/2",
            "javascript:alert(1)",
            "https://x.com/example/status/3",
          ],
          usage: { totalTokens: 1234, costUsd: 0.0123 },
          providerErrors: [{ message: "OPENROUTER_API_KEY=secret" }],
        },
      },
    });

    expect(preview).toContain("x_search status=completed provider=openrouter");
    expect(preview).toContain("citations=4");
    expect(preview).toContain("tokens=1234 costUsd=0.0123");
    expect(preview).toContain("https://x.com/example/status/1");
    expect(preview).not.toContain("PRIVATE PROVIDER CONTENT");
    expect(preview).not.toContain("OPENROUTER_API_KEY");
    expect(preview).not.toContain("javascript:");
  });

  it("projects raw X purpose, method, evidence, resources, and cost only", () => {
    const preview = formatBoundedToolEvidencePreview({
      name: "x_posts",
      result: {
        details: {
          status: "complete",
          operation: "search_recent",
          purpose: "topic_pulse",
          method_version: "x-topic-pulse.v1",
          provider_status: 200,
          provider: { data: [{ text: "untrusted post body" }] },
          evidence: {
            ref: "artifacts/business-ops/x-acquisition-manifests-v4/abc.json",
            digest: "sha256:abc123",
          },
          resources: { requests: 1, duration_ms: 42 },
          cost: { status: "provider_not_reported" },
          error: { message: "Bearer secret" },
        },
      },
    });

    expect(preview).toContain("x_posts status=complete operation=search_recent");
    expect(preview).toContain("purpose=topic_pulse method=x-topic-pulse.v1");
    expect(preview).toContain("providerStatus=200");
    expect(preview).toContain("evidence=artifacts/business-ops/");
    expect(preview).toContain("requests=1 durationMs=42 cost=provider_not_reported");
    expect(preview).not.toContain("untrusted post body");
    expect(preview).not.toContain("Bearer secret");
  });

  it("does not summarize unrelated tool results", () => {
    expect(
      formatBoundedToolEvidencePreview({
        name: "exec_command",
        result: { details: { output: "secret" } },
      }),
    ).toBeUndefined();
  });
});
