import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOpenClawLspService, type OpenClawLspService } from "../openclaw-lsp-service.js";
import { createLspTool } from "./lsp-tool.js";

function readText(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("\n");
}

describe("OpenClaw LSP tool", () => {
  let tmpDir = "";
  let lspServices: OpenClawLspService[] = [];

  afterEach(async () => {
    await Promise.all(lspServices.map((service) => service.shutdown()));
    lspServices = [];
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  async function createWorkspace() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lsp-tool-"));
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "src", "worker.ts"),
      [
        "export interface WorkQueueExecutionReadModel {",
        "  id: string;",
        "}",
        "",
        "export function buildWorkQueueExecutionReadModel(): WorkQueueExecutionReadModel {",
        "  return { id: 'one' };",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(tmpDir, "src", "other.ts"),
      "export function otherWorker() {\n  return buildOther();\n}\nfunction buildOther() {\n  return 'ok';\n}\n",
      "utf8",
    );
    return tmpDir;
  }

  async function createTool() {
    await createWorkspace();
    const lspService = createOpenClawLspService({ workspaceRoot: tmpDir, idleShutdownMs: 60_000 });
    lspServices.push(lspService);
    return createLspTool({ workspaceRoot: tmpDir, lspService });
  }

  it("returns source coordinates for document symbols", async () => {
    const tool = await createTool();
    expect(tool.description).toContain("Default large-TypeScript-file structure tool");
    expect(tool.description).toContain("documentSymbol or workspaceSymbol before sequential reads");
    const result = await tool.execute("call-lsp-symbols", {
      operation: "documentSymbol",
      filePath: "src/worker.ts",
    });

    const text = readText(result);
    expect(text).toContain("LSP documentSymbol for src/worker.ts outline");
    expect(text).toContain("shown:");
    expect(text).toContain('read: read({"path":"src/worker.ts"');
    expect(text).toContain("range: 1:");
    expect(text).toContain("symbol: WorkQueueExecutionReadModel");
    expect(text).toContain("kind: interface");
    expect(text).toContain("symbol: buildWorkQueueExecutionReadModel");
    expect(text).toContain("kind: function");
    expect(text).not.toContain('"range"');
    expect(result.details).toMatchObject({
      status: "ok",
      operation: "documentSymbol",
      filePath: "src/worker.ts",
      resultCount: expect.any(Number),
      shownCount: expect.any(Number),
      omittedCount: expect.any(Number),
    });
    expect((result.details as { result?: unknown; text?: unknown }).result).toBeUndefined();
    expect((result.details as { result?: unknown; text?: unknown }).text).toBeUndefined();
  });

  it("returns bounded workspace symbol matches", async () => {
    const tool = await createTool();
    const result = await tool.execute("call-lsp-workspace-symbol", {
      operation: "workspaceSymbol",
      filePath: "src/worker.ts",
      query: "buildWorkQueue",
    });

    const text = readText(result);
    expect(text).toContain('LSP workspaceSymbol query="buildWorkQueue"');
    expect(text).toContain("src/worker.ts");
    expect(text).toContain("symbol: buildWorkQueueExecutionReadModel");
    expect(text).toContain("kind: function");
    expect(text).toContain('read: read({"path":"src/worker.ts"');
    expect(result.details).toMatchObject({
      status: "ok",
      operation: "workspaceSymbol",
      query: "buildWorkQueue",
      resultCount: expect.any(Number),
      shownCount: expect.any(Number),
      omittedCount: expect.any(Number),
    });
  });

  it("renders huge documentSymbol results as a compact top-level outline", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lsp-tool-mock-"));
    const symbols = [
      {
        name: "TopLevelOne",
        kind: "function",
        path: "src/huge.ts",
        range: { start: { line: 10, character: 1 }, end: { line: 20, character: 1 } },
      },
      {
        name: "TopLevelTwo",
        kind: "function",
        path: "src/huge.ts",
        range: { start: { line: 200, character: 1 }, end: { line: 240, character: 1 } },
      },
      ...Array.from({ length: 200 }, (_, index) => ({
        name: `nested${index}`,
        kind: "property",
        path: "src/huge.ts",
        range: {
          start: { line: 300 + index, character: 3 },
          end: { line: 300 + index, character: 20 },
        },
        containerName: "TopLevelTwo",
      })),
    ];
    const lspService = {
      hasClients: async () => true,
      touchFile: async () => {},
      documentSymbol: async () => symbols,
      workspaceSymbol: async () => [],
      init: async () => {},
      status: async () => [],
      diagnostics: async () => ({}),
      diagnosticsForFile: async () => [],
      definition: async () => [],
      references: async () => [],
      implementation: async () => [],
      hover: async () => [],
      prepareCallHierarchy: async () => [],
      incomingCalls: async () => [],
      outgoingCalls: async () => [],
      shutdown: async () => {},
    } satisfies OpenClawLspService;
    const tool = createLspTool({ workspaceRoot: tmpDir, lspService });

    const result = await tool.execute("call-lsp-symbols", {
      operation: "documentSymbol",
      filePath: "src/huge.ts",
    });

    const text = readText(result);
    expect(text).toContain("shown: 2 of 202");
    expect(text).toContain("symbol: TopLevelOne");
    expect(text).toContain("kind: function");
    expect(text).toContain("symbol: TopLevelTwo");
    expect(text).not.toContain("nested199");
    expect(text).not.toContain("Full output saved");
    expect(result.details).toMatchObject({
      resultCount: 202,
      shownCount: 2,
      omittedCount: 200,
    });
  });

  it("uses documentSymbol query mode for target symbols and containers", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lsp-tool-mock-"));
    const symbols = [
      {
        name: "WorkQueueExecutionReadModel",
        kind: "interface",
        path: "src/huge.ts",
        range: { start: { line: 50, character: 1 }, end: { line: 140, character: 1 } },
      },
      {
        name: "workQueueEventDeltaReadback",
        kind: "property",
        path: "src/huge.ts",
        range: { start: { line: 90, character: 3 }, end: { line: 96, character: 1 } },
        containerName: "WorkQueueExecutionReadModel",
      },
      {
        name: "unrelated",
        kind: "function",
        path: "src/huge.ts",
        range: { start: { line: 500, character: 1 }, end: { line: 520, character: 1 } },
      },
    ];
    const lspService = {
      hasClients: async () => true,
      touchFile: async () => {},
      documentSymbol: async () => symbols,
      workspaceSymbol: async () => [],
      init: async () => {},
      status: async () => [],
      diagnostics: async () => ({}),
      diagnosticsForFile: async () => [],
      definition: async () => [],
      references: async () => [],
      implementation: async () => [],
      hover: async () => [],
      prepareCallHierarchy: async () => [],
      incomingCalls: async () => [],
      outgoingCalls: async () => [],
      shutdown: async () => {},
    } satisfies OpenClawLspService;
    const tool = createLspTool({ workspaceRoot: tmpDir, lspService });

    const result = await tool.execute("call-lsp-symbol-query", {
      operation: "documentSymbol",
      filePath: "src/huge.ts",
      query: "delta",
    });

    const text = readText(result);
    expect(text).toContain('query="delta"');
    expect(text).toContain("symbol: WorkQueueExecutionReadModel");
    expect(text).toContain("kind: interface");
    expect(text).toContain("symbol: workQueueEventDeltaReadback");
    expect(text).toContain("kind: property");
    expect(text).toContain('read: read({"path":"src/huge.ts","offset":90');
    expect(text).not.toContain("function unrelated");
  });

  it("does not dump every child when documentSymbol query matches a container", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lsp-tool-mock-"));
    const symbols = [
      {
        name: "WorkQueueExecutionReadModel",
        kind: "interface",
        path: "src/huge.ts",
        range: { start: { line: 50, character: 1 }, end: { line: 400, character: 1 } },
      },
      ...Array.from({ length: 80 }, (_, index) => ({
        name: `field${index}`,
        kind: "property",
        path: "src/huge.ts",
        range: {
          start: { line: 60 + index, character: 3 },
          end: { line: 60 + index, character: 20 },
        },
        containerName: "WorkQueueExecutionReadModel",
      })),
      {
        name: "buildWorkQueueExecutionReadModel",
        kind: "function",
        path: "src/huge.ts",
        range: { start: { line: 500, character: 1 }, end: { line: 560, character: 1 } },
      },
    ];
    const lspService = {
      hasClients: async () => true,
      touchFile: async () => {},
      documentSymbol: async () => symbols,
      workspaceSymbol: async () => [],
      init: async () => {},
      status: async () => [],
      diagnostics: async () => ({}),
      diagnosticsForFile: async () => [],
      definition: async () => [],
      references: async () => [],
      implementation: async () => [],
      hover: async () => [],
      prepareCallHierarchy: async () => [],
      incomingCalls: async () => [],
      outgoingCalls: async () => [],
      shutdown: async () => {},
    } satisfies OpenClawLspService;
    const tool = createLspTool({ workspaceRoot: tmpDir, lspService });

    const result = await tool.execute("call-lsp-symbol-query", {
      operation: "documentSymbol",
      filePath: "src/huge.ts",
      query: "WorkQueueExecutionReadModel",
    });

    const text = readText(result);
    expect(text).toContain("symbol: WorkQueueExecutionReadModel");
    expect(text).toContain("kind: interface");
    expect(text).toContain("symbol: buildWorkQueueExecutionReadModel");
    expect(text).toContain("kind: function");
    expect(text).toContain('read: read({"path":"src/huge.ts","offset":50');
    expect(text).not.toContain("field79");
    expect(result.details).toMatchObject({
      resultCount: 82,
      shownCount: expect.any(Number),
      omittedCount: expect.any(Number),
    });
    expect((result.details as { shownCount?: number }).shownCount).toBeLessThan(12);
  });

  it("does not request diagnostics for symbol-only navigation", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-lsp-tool-mock-"));
    const touchedModes: unknown[] = [];
    const lspService = {
      hasClients: async () => true,
      touchFile: async (_filePath: string, diagnosticsMode?: "document" | "full") => {
        touchedModes.push(diagnosticsMode);
      },
      documentSymbol: async () => [],
      workspaceSymbol: async () => [],
      init: async () => {},
      status: async () => [],
      diagnostics: async () => ({}),
      diagnosticsForFile: async () => [],
      definition: async () => [],
      references: async () => [],
      implementation: async () => [],
      hover: async () => [],
      prepareCallHierarchy: async () => [],
      incomingCalls: async () => [],
      outgoingCalls: async () => [],
      shutdown: async () => {},
    } satisfies OpenClawLspService;
    const tool = createLspTool({ workspaceRoot: tmpDir, lspService });

    await tool.execute("call-lsp-symbols", {
      operation: "documentSymbol",
      filePath: "worker.ts",
    });
    await tool.execute("call-lsp-workspace-symbol", {
      operation: "workspaceSymbol",
      filePath: "worker.ts",
      query: "worker",
    });

    expect(touchedModes).toEqual([undefined, undefined]);
  });

  it("reuses one external TypeScript LSP client per root and shuts it down explicitly", async () => {
    await createWorkspace();
    const lspService = createOpenClawLspService({ workspaceRoot: tmpDir, idleShutdownMs: 60_000 });
    lspServices.push(lspService);

    await lspService.touchFile(path.join(tmpDir, "src", "worker.ts"));
    await lspService.touchFile(path.join(tmpDir, "src", "other.ts"));

    const connected = (await lspService.status()).filter((entry) => entry.status === "connected");
    expect(connected).toHaveLength(1);
    expect(connected[0]).toMatchObject({
      id: "typescript-language-server",
      name: "TypeScript language server",
      root: ".",
    });

    await lspService.shutdown();
    expect(await lspService.status()).toEqual([]);
  });

  it("collects bounded document diagnostics through the external server", async () => {
    await createWorkspace();
    const brokenPath = path.join(tmpDir, "src", "broken.ts");
    await fs.writeFile(brokenPath, "const value: string = 1;\n", "utf8");
    const lspService = createOpenClawLspService({ workspaceRoot: tmpDir, idleShutdownMs: 60_000 });
    lspServices.push(lspService);

    await lspService.touchFile(brokenPath, "document");
    const diagnostics = await lspService.diagnosticsForFile(brokenPath);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.length).toBeLessThanOrEqual(20);
    expect(diagnostics.some((diagnostic) => diagnostic.severity === "ERROR")).toBe(true);
    expect(diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toContain(
      "not assignable",
    );
  });
});
