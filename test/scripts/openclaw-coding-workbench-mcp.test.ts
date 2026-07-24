// OpenClaw Coding Workbench MCP tests cover bounded repo inspection helpers.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workbenchModulePath = path.resolve(
  "extensions/codex/system-profile/tools/openclaw-repo-workbench.mjs",
);
const workbenchModuleUrl = pathToFileURL(workbenchModulePath).href;
const imageFixturePath = path.resolve(
  "test/scripts/fixtures/openclaw-coding-workbench-one-pixel.png.base64",
);

type FileIdentity = {
  bytes: number;
  sha256: string;
};

type SelectedRangeIdentity = FileIdentity & {
  startLine: number;
  endLine: number;
};

type WorkbenchModule = {
  repoSearchMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    limits: {
      maxResponseBytes: number;
    };
    exclusionPolicies: {
      default: string[];
    };
    coverage: {
      requestedQueries: number;
      matchedQueries: number;
      returnedItems: number;
      omittedItems: number;
      omittedItemsExact: boolean;
    };
    results: Array<{
      status: string;
      searchedRoots: string[];
      scope: {
        mode: string;
        glob?: string;
        hiddenIncluded: boolean;
        ignoreFilesRespected: boolean;
      };
      appliedExclusions: {
        policy: string;
        count: number;
      };
      items?: Array<{
        path?: string;
        line?: number;
        character?: number;
        text?: string;
        context?: boolean;
      }>;
      error?: string;
      effectiveMaxMatches?: number;
      requestedMaxMatches?: number;
      maxMatchesClamped?: boolean;
      effectiveContextLines?: number;
      requestedContextLines?: number;
      contextLinesClamped?: boolean;
      totalItems: number;
      returnedItems: number;
      omittedItems: number;
      omittedItemsExact: boolean;
      truncated: boolean;
      commandOutputTruncated: boolean;
      responseTruncated: boolean;
      aggregateOmittedItems: number;
      searchComplete: boolean;
      continuation: {
        complete: boolean;
        hasMore: boolean;
        nextAction: string;
      };
      nextAction: string;
    }>;
  }>;
  repoReadMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    limits: {
      maxResponseBytes: number;
    };
    results: Array<{
      status: string;
      path?: string;
      text?: string;
      error?: string;
      totalLines?: number;
      returnedStartLine?: number;
      returnedEndLine?: number;
      returnedBytes?: number;
      file?: FileIdentity;
      selectedRange?: SelectedRangeIdentity;
      truncated?: boolean;
      nextStartLine?: number;
      effectiveMaxBytes?: number;
      requestedMaxBytes?: number;
      maxBytesClamped?: boolean;
    }>;
    omitted: Array<{
      path: string;
      requestedStartLine: number;
      requestedEndLine: number;
      totalLines: number;
      file: FileIdentity;
      selectedRange: SelectedRangeIdentity;
      nextStartLine: number;
      reason: string;
    }>;
    coverage: {
      requested: number;
      returned: number;
      truncated: number;
      errors: number;
      omitted: number;
    };
  }>;
  mcpResult(value: unknown): {
    structuredContent: unknown;
    content?: unknown;
  };
  repoGlobMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    results: Array<{
      status: string;
      files?: string[];
      effectiveMaxResults?: number;
      requestedMaxResults?: number;
      maxResultsClamped?: boolean;
    }>;
  }>;
  gitInspectMany(
    input: unknown,
    options?: unknown,
  ): Promise<{
    gitRoots?: string[];
    results: Array<{
      status: string;
      stdout?: string;
      repoRoot?: string;
      error?: string;
      effectiveMaxBytes?: number;
      requestedMaxBytes?: number;
      maxBytesClamped?: boolean;
    }>;
  }>;
  lspHoverTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    display?: string;
    error?: string;
  }>;
  lspDefinitionTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    projectMode?: string;
    projectFileCount?: number;
    lspPartial?: boolean;
    projectFileLimitReached?: boolean;
    effectiveMaxResults?: number;
    requestedMaxResults?: number;
    maxResultsClamped?: boolean;
    definitions?: Array<{ path?: string; line?: number; character?: number }>;
    error?: string;
  }>;
  lspReferencesTypescript(
    input: unknown,
    options?: unknown,
  ): Promise<{
    status: string;
    effectiveMaxResults?: number;
    requestedMaxResults?: number;
    maxResultsClamped?: boolean;
    references?: Array<{ path?: string; line?: number; character?: number }>;
    error?: string;
  }>;
  artifactViewImage(
    input: unknown,
    options?: unknown,
  ): Promise<{
    structuredContent: {
      status: string;
      path: string;
      mediaType?: string;
      dimensions?: { width: number; height: number };
      sha256?: string;
      bytes?: number;
      error?: string;
    };
    content: Array<{ type: string; data?: string; mimeType?: string }>;
  }>;
};

let tempDirs: string[] = [];

async function loadWorkbench(): Promise<WorkbenchModule> {
  return (await import(workbenchModuleUrl)) as WorkbenchModule;
}

async function makeRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-"));
  tempDirs.push(tempDir);
  await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"fixture"}\n', "utf8");
  await fs.writeFile(path.join(tempDir, "openclaw.mjs"), "#!/usr/bin/env node\n", "utf8");
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "src", "alpha.ts"),
    ["export const alpha = 1;", "export const beta = alpha + 1;", ""].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "src", "gamma.ts"),
    ['import { alpha } from "./alpha.js";', "export const gamma = alpha + 2;", ""].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "src", "unrelated.ts"),
    "export const unrelated = 3;\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(tempDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await execFileAsync("git", ["init"], { cwd: tempDir });
  await execFileAsync("git", ["add", "."], { cwd: tempDir });
  return tempDir;
}

async function writeImageFixture(destination: string) {
  const encoded = await fs.readFile(imageFixturePath, "utf8");
  await fs.writeFile(destination, Buffer.from(encoded.trim(), "base64"));
}

function optionsFor(repo: string) {
  return {
    cwd: repo,
    env: {
      ...process.env,
      OPENCLAW_REPO_WORKBENCH_ROOT: repo,
    },
  };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("openclaw-coding-workbench MCP helpers", () => {
  it("reads multiple bounded file ranges and rejects path escapes", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const result = await workbench.repoReadMany(
      {
        files: [
          { path: "src/alpha.ts", startLine: 1, endLine: 1 },
          { path: "../outside.txt" },
          { path: "src/missing.ts" },
        ],
      },
      optionsFor(repo),
    );

    expect(result.results[0]).toMatchObject({
      status: "ok",
      text: "1: export const alpha = 1;",
      returnedStartLine: 1,
      returnedEndLine: 1,
      totalLines: 3,
    });
    expect(result.results[1]).toMatchObject({
      status: "error",
      error: expect.stringContaining("path escapes repository root"),
    });
    expect(result.results[2]).toMatchObject({
      path: "src/missing.ts",
      status: "error",
      error: expect.stringContaining("ENOENT"),
    });
  });

  it("reads an installed API through an in-root workspace symlink", async () => {
    const repo = await makeRepo();
    const packageRoot = path.join(repo, "packages", "native-api");
    const installedRoot = path.join(repo, "node_modules", "native-api");
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.mkdir(path.dirname(installedRoot), { recursive: true });
    await fs.writeFile(
      path.join(packageRoot, "index.ts"),
      "export const nativeExistingSurface = true;\n",
      "utf8",
    );
    await fs.symlink(packageRoot, installedRoot, "dir");
    const workbench = await loadWorkbench();

    const result = await workbench.repoReadMany(
      {
        files: [{ path: "node_modules/native-api/index.ts", startLine: 1, endLine: 1 }],
      },
      optionsFor(repo),
    );

    expect(result.coverage).toEqual({
      requested: 1,
      returned: 1,
      truncated: 0,
      errors: 0,
      omitted: 0,
    });
    expect(result.results[0]).toMatchObject({
      status: "ok",
      path: "node_modules/native-api/index.ts",
      resolvedPath: "packages/native-api/index.ts",
      text: "1: export const nativeExistingSurface = true;",
    });

    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-api-"));
    tempDirs.push(outside);
    await fs.writeFile(path.join(outside, "outside.ts"), "export const outside = true;\n", "utf8");
    await fs.symlink(path.join(outside, "outside.ts"), path.join(installedRoot, "outside.ts"));

    const escaped = await workbench.repoReadMany(
      {
        files: [{ path: "node_modules/native-api/outside.ts" }],
      },
      optionsFor(repo),
    );

    expect(escaped.results[0]).toMatchObject({
      status: "error",
      error: expect.stringContaining("escapes repository root through symlink"),
    });
  });

  it("separates exact whole-file and normalized selected-range identities", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    const multibyteLine = "\u03b2eta \u{1f642}";
    const data = Buffer.from(`first\r\n${multibyteLine}\r\nthird\r\n`, "utf8");
    const selected = `${multibyteLine}\nthird`;
    await fs.writeFile(path.join(repo, "src", "crlf.txt"), data);

    const read = await workbench.repoReadMany(
      {
        files: [
          {
            path: "src/crlf.txt",
            startLine: 2,
            endLine: 3,
            maxBytes: Buffer.byteLength(`2: ${multibyteLine}`, "utf8"),
          },
        ],
      },
      optionsFor(repo),
    );

    expect(read.results[0]).toMatchObject({
      status: "ok",
      text: `2: ${multibyteLine}`,
      returnedStartLine: 2,
      returnedEndLine: 2,
      file: {
        bytes: data.length,
        sha256: sha256(data),
      },
      selectedRange: {
        startLine: 2,
        endLine: 3,
        bytes: Buffer.byteLength(selected, "utf8"),
        sha256: sha256(selected),
      },
      truncated: true,
      nextStartLine: 3,
    });
    expect(read.results[0]?.file?.sha256).not.toBe(read.results[0]?.selectedRange?.sha256);
  });

  it("clamps optimistic size and result hints instead of failing schema-style", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const read = await workbench.repoReadMany(
      {
        files: [{ path: "src/alpha.ts", maxBytes: 200_000 }],
      },
      optionsFor(repo),
    );
    const search = await workbench.repoSearchMany(
      {
        queries: [{ pattern: "alpha", path: "src", maxMatches: 2_000, contextLines: 8 }],
      },
      optionsFor(repo),
    );
    const glob = await workbench.repoGlobMany(
      {
        globs: [{ pattern: "src/**/*.ts", maxResults: 2_000 }],
      },
      optionsFor(repo),
    );
    const git = await workbench.gitInspectMany(
      {
        requests: [{ kind: "status", maxBytes: 200_000 }],
      },
      optionsFor(repo),
    );
    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/alpha.ts", line: 2, character: 21, maxResults: 2_000 },
      optionsFor(repo),
    );

    expect(read.results[0]).toMatchObject({
      status: "ok",
      requestedMaxBytes: 200_000,
      effectiveMaxBytes: 12_000,
      maxBytesClamped: true,
    });
    expect(search.results[0]).toMatchObject({
      status: "matched",
      requestedMaxMatches: 2_000,
      effectiveMaxMatches: 60,
      maxMatchesClamped: true,
      requestedContextLines: 8,
      effectiveContextLines: 5,
      contextLinesClamped: true,
    });
    expect(glob.results[0]).toMatchObject({
      status: "ok",
      requestedMaxResults: 2_000,
      effectiveMaxResults: 200,
      maxResultsClamped: true,
    });
    expect(git.results[0]).toMatchObject({
      status: "ok",
      requestedMaxBytes: 200_000,
      effectiveMaxBytes: 64_000,
      maxBytesClamped: true,
    });
    expect(definition).toMatchObject({
      status: "ok",
      requestedMaxResults: 2_000,
      effectiveMaxResults: 200,
      maxResultsClamped: true,
    });
  });

  it("caps aggregate read output, names omissions, and resumes exact line ranges", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    const files = [];
    const legacyBodies = [];
    for (let fileIndex = 0; fileIndex < 20; fileIndex += 1) {
      const relativePath = `src/bulk-${fileIndex}.md`;
      const body = Array.from(
        { length: 100 },
        (_, lineIndex) => `file ${fileIndex} line ${lineIndex + 1} ${"x".repeat(88)}`,
      ).join("\n");
      await fs.writeFile(path.join(repo, relativePath), `${body}\n`, "utf8");
      files.push({ path: relativePath, maxBytes: 200_000 });
      legacyBodies.push(body);
    }

    const read = await workbench.repoReadMany({ files }, optionsFor(repo));
    const serialized = JSON.stringify(read);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(read.limits.maxResponseBytes);
    expect(read.coverage.requested).toBe(20);
    expect(read.coverage.returned + read.coverage.errors + read.coverage.omitted).toBe(20);
    expect(read.coverage.truncated).toBeGreaterThan(0);
    expect(read.omitted.length).toBeGreaterThan(0);
    expect(read.omitted.every((item) => item.reason.includes("aggregate"))).toBe(true);
    expect(read.omitted.every((item) => item.requestedEndLine >= item.nextStartLine)).toBe(true);
    expect(read.omitted.every((item) => item.totalLines >= item.requestedEndLine)).toBe(true);
    for (const item of read.omitted) {
      const data = await fs.readFile(path.join(repo, item.path));
      const selected = data.toString("utf8").split(/\r?\n/u).join("\n");
      expect(item.file).toEqual({ bytes: data.length, sha256: sha256(data) });
      expect(item.selectedRange).toEqual({
        startLine: item.requestedStartLine,
        endLine: item.requestedEndLine,
        bytes: Buffer.byteLength(selected, "utf8"),
        sha256: sha256(selected),
      });
    }
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain('"lineNumberedContent"');
    expect(serialized).not.toContain('"request"');

    const truncated = read.results.find(
      (item) => item.status === "ok" && item.truncated && item.nextStartLine,
    );
    expect(truncated).toBeDefined();
    expect(truncated?.selectedRange).toMatchObject({
      startLine: 1,
      endLine: truncated?.totalLines,
    });
    expect(truncated?.selectedRange?.endLine).toBeGreaterThan(truncated?.returnedEndLine ?? 0);
    const chunks = [truncated?.text ?? ""];
    let nextStartLine = truncated?.nextStartLine;
    while (nextStartLine) {
      const continuation = await workbench.repoReadMany(
        {
          files: [{ path: truncated?.path, startLine: nextStartLine }],
        },
        optionsFor(repo),
      );
      const result = continuation.results[0];
      expect(result?.text).toMatch(new RegExp(`^${nextStartLine}: `, "u"));
      chunks.push(result?.text ?? "");
      nextStartLine = result?.nextStartLine;
    }
    const completeSource = await fs.readFile(path.join(repo, truncated?.path ?? ""), "utf8");
    const completeNumberedText = completeSource
      .split(/\r?\n/u)
      .map((line, lineIndex) => `${lineIndex + 1}: ${line}`)
      .join("\n");
    expect(chunks.join("\n")).toBe(completeNumberedText);

    const toolResult = workbench.mcpResult(read);
    expect(toolResult).toEqual({ structuredContent: read });
    expect(toolResult.content).toBeUndefined();

    const legacyValue = {
      schemaVersion: "openclaw.repo_workbench.read_many.v1",
      root: repo,
      results: legacyBodies.map((content, index) => ({
        request: files[index],
        path: files[index]?.path,
        status: "ok",
        content,
        lineNumberedContent: content
          .split("\n")
          .map((line, lineIndex) => `${lineIndex + 1}: ${line}`)
          .join("\n"),
      })),
    };
    const legacyModelVisibleBytes = Buffer.byteLength(
      JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(legacyValue, null, 2) }],
        structuredContent: legacyValue,
      }),
      "utf8",
    );
    const currentModelVisibleBytes = Buffer.byteLength(JSON.stringify(toolResult), "utf8");
    expect(currentModelVisibleBytes).toBeLessThanOrEqual(legacyModelVisibleBytes * 0.3);
  });

  it("publishes an output schema and structured-only result over MCP", async () => {
    const repo = await makeRepo();
    const client = new Client({ name: "workbench-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [workbenchModulePath],
      cwd: repo,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? os.homedir(),
        OPENCLAW_REPO_WORKBENCH_ROOT: repo,
      },
    });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      const readTool = listed.tools.find((tool) => tool.name === "repo_read_many");
      const searchTool = listed.tools.find((tool) => tool.name === "repo_search_many");
      const imageTool = listed.tools.find((tool) => tool.name === "artifact_view_image");
      expect(readTool?.outputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          results: expect.objectContaining({
            type: "array",
            items: expect.objectContaining({
              properties: expect.objectContaining({
                path: expect.any(Object),
                file: expect.objectContaining({
                  properties: expect.objectContaining({
                    bytes: expect.any(Object),
                    sha256: expect.any(Object),
                  }),
                }),
                selectedRange: expect.objectContaining({
                  properties: expect.objectContaining({
                    startLine: expect.any(Object),
                    endLine: expect.any(Object),
                    bytes: expect.any(Object),
                    sha256: expect.any(Object),
                  }),
                }),
                text: expect.any(Object),
                nextStartLine: expect.any(Object),
              }),
            }),
          }),
          omitted: expect.objectContaining({
            type: "array",
            items: expect.objectContaining({
              properties: expect.objectContaining({
                path: expect.any(Object),
                requestedStartLine: expect.any(Object),
                requestedEndLine: expect.any(Object),
                file: expect.any(Object),
                selectedRange: expect.any(Object),
                nextStartLine: expect.any(Object),
              }),
            }),
          }),
          coverage: expect.any(Object),
        }),
      });
      expect(searchTool?.outputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          results: expect.objectContaining({
            type: "array",
            items: expect.objectContaining({
              properties: expect.objectContaining({
                searchedRoots: expect.any(Object),
                scope: expect.any(Object),
                appliedExclusions: expect.any(Object),
                truncated: expect.any(Object),
                omittedItems: expect.any(Object),
                continuation: expect.any(Object),
              }),
            }),
          }),
          exclusionPolicies: expect.any(Object),
          coverage: expect.any(Object),
        }),
      });
      expect(imageTool?.outputSchema).toMatchObject({
        type: "object",
        properties: expect.objectContaining({
          mediaType: expect.any(Object),
          dimensions: expect.any(Object),
          sha256: expect.any(Object),
          bytes: expect.any(Object),
        }),
      });

      const called = await client.callTool({
        name: "repo_read_many",
        arguments: { files: [{ path: "src/alpha.ts", startLine: 1, endLine: 1 }] },
      });
      expect(called.structuredContent).toMatchObject({
        schemaVersion: "openclaw.repo_workbench.read_many.v2",
        results: [
          expect.objectContaining({
            text: "1: export const alpha = 1;",
            file: expect.objectContaining({
              bytes: expect.any(Number),
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            }),
            selectedRange: {
              startLine: 1,
              endLine: 1,
              bytes: Buffer.byteLength("export const alpha = 1;", "utf8"),
              sha256: sha256("export const alpha = 1;"),
            },
          }),
        ],
      });
      expect(called.content).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("returns a bounded workspace artifact as one native image block without duplicating bytes", async () => {
    const repo = await makeRepo();
    const imagePath = path.join(repo, "artifacts", "evidence.png");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await writeImageFixture(imagePath);
    const workbench = await loadWorkbench();

    const result = await workbench.artifactViewImage(
      { path: "artifacts/evidence.png" },
      optionsFor(repo),
    );
    const metadata = result.structuredContent;
    const serializedMetadata = JSON.stringify(metadata);

    expect(metadata).toMatchObject({
      status: "ok",
      path: "artifacts/evidence.png",
      mediaType: "image/png",
      dimensions: { width: 1, height: 1 },
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      bytes: 68,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(serializedMetadata).not.toContain(result.content[0]?.data ?? "__missing__");
    expect(serializedMetadata).not.toContain("base64");

    const client = new Client({ name: "workbench-image-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [workbenchModulePath],
      cwd: repo,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? os.homedir(),
        OPENCLAW_REPO_WORKBENCH_ROOT: repo,
      },
    });
    try {
      await client.connect(transport);
      const called = await client.callTool({
        name: "artifact_view_image",
        arguments: { path: "artifacts/evidence.png" },
      });
      expect(called.structuredContent).toEqual(metadata);
      expect(called.content).toEqual([
        expect.objectContaining({
          type: "image",
          mimeType: "image/png",
          data: result.content[0]?.data,
        }),
      ]);
    } finally {
      await client.close();
    }
  });

  it("rejects image path escapes, unsupported formats, and files over the image budget", async () => {
    const repo = await makeRepo();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-image-outside-"));
    tempDirs.push(outside);
    await writeImageFixture(path.join(outside, "outside.png"));
    await fs.symlink(path.join(outside, "outside.png"), path.join(repo, "src", "outside.png"));
    await fs.writeFile(path.join(repo, "src", "not-image.svg"), "<svg />\n", "utf8");
    await fs.writeFile(
      path.join(repo, "src", "too-large.png"),
      Buffer.alloc(5 * 1024 * 1024 + 1, 0),
    );
    const workbench = await loadWorkbench();

    const relativeEscape = await workbench.artifactViewImage(
      { path: "../outside.png" },
      optionsFor(repo),
    );
    const escaped = await workbench.artifactViewImage(
      { path: "src/outside.png" },
      optionsFor(repo),
    );
    const unsupported = await workbench.artifactViewImage(
      { path: "src/not-image.svg" },
      optionsFor(repo),
    );
    const tooLarge = await workbench.artifactViewImage(
      { path: "src/too-large.png" },
      optionsFor(repo),
    );

    for (const result of [relativeEscape, escaped, unsupported, tooLarge]) {
      expect(result.structuredContent.status).toBe("error");
      expect(result.content).toEqual([]);
    }
    expect(relativeEscape.structuredContent.error).toContain("path escapes repository root");
    expect(escaped.structuredContent.error).toContain("escapes repository root through symlink");
    expect(unsupported.structuredContent.error).toContain("unsupported or invalid raster image");
    expect(tooLarge.structuredContent.error).toContain("image exceeds");
  });

  it("searches and globs in bounded batches", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      {
        queries: [
          { pattern: "alpha", path: "src", maxMatches: 5 },
          { pattern: "does-not-exist", path: "src", maxMatches: 5 },
        ],
      },
      optionsFor(repo),
    );
    const glob = await workbench.repoGlobMany(
      { globs: [{ pattern: "src/**/*.ts", maxResults: 10 }] },
      optionsFor(repo),
    );

    expect(search.results[0].status).toBe("matched");
    expect(search.results[0].items).toContainEqual(
      expect.objectContaining({
        path: "src/alpha.ts",
        line: 1,
        character: 14,
        text: "export const alpha = 1;",
      }),
    );
    expect(search.results[1].status).toBe("no_match");
    expect(search.results[1]).toMatchObject({
      searchedRoots: ["src"],
      appliedExclusions: { policy: "default", count: expect.any(Number) },
      truncated: false,
      omittedItems: 0,
      omittedItemsExact: true,
      continuation: { complete: true, hasMore: false, nextAction: "none" },
    });
    expect(JSON.stringify(search)).not.toContain('"matches"');
    expect(JSON.stringify(search)).not.toContain('"request"');
    expect(glob.results[0].status).toBe("ok");
    expect(glob.results[0].files).toHaveLength(3);
    expect(glob.results[0].files).toEqual(
      expect.arrayContaining(["src/alpha.ts", "src/gamma.ts", "src/unrelated.ts"]),
    );
  });

  it("keeps complete max-batch no-match coverage within the aggregate cap", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      {
        queries: Array.from({ length: 20 }, (_, index) => ({
          pattern: `max-batch-no-match-${index}`,
          path: "src",
          maxMatches: 1,
        })),
      },
      optionsFor(repo),
    );

    expect(Buffer.byteLength(JSON.stringify(search), "utf8")).toBeLessThanOrEqual(
      search.limits.maxResponseBytes,
    );
    expect(search.results).toHaveLength(20);
    expect(search.exclusionPolicies.default).toEqual(expect.arrayContaining(["**/.git/**"]));
    for (const result of search.results) {
      expect(result).toMatchObject({
        status: "no_match",
        searchedRoots: ["src"],
        appliedExclusions: { policy: "default", count: expect.any(Number) },
        truncated: false,
        omittedItems: 0,
        continuation: { complete: true, hasMore: false, nextAction: "none" },
      });
    }
  });

  it("includes hidden authored/config authority and JSON5 while excluding non-source trees", async () => {
    const repo = await makeRepo();
    const included = [
      [".agents/authority.md", "search-authority-marker agents\n"],
      [".codex/policy.toml", "search-authority-marker codex\n"],
      ["config/policy.json5", "{ rule: 'search-authority-marker' }\n"],
    ] as const;
    const excluded = [
      ["packages/example/generated/output.json5", "search-authority-marker generated\n"],
      ["cache/result.json5", "search-authority-marker cache\n"],
      ["packages/example/vendor/library.md", "search-authority-marker vendor\n"],
      ["packages/example/runtime-state/active.json", "search-authority-marker runtime\n"],
      ["packages/example/node_modules/dependency/index.ts", "search-authority-marker dependency\n"],
      [".git/search-authority-marker.txt", "search-authority-marker git\n"],
    ] as const;
    for (const [relativePath, content] of [...included, ...excluded]) {
      const file = path.join(repo, relativePath);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, "utf8");
    }
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      { queries: [{ pattern: "search-authority-marker", path: ".", maxMatches: 20 }] },
      optionsFor(repo),
    );
    const result = search.results[0];

    expect(result).toMatchObject({
      status: "matched",
      searchedRoots: ["."],
      scope: {
        mode: "default_authored_config",
        hiddenIncluded: true,
        ignoreFilesRespected: true,
      },
      appliedExclusions: { policy: "default", count: search.exclusionPolicies.default.length },
      totalItems: included.length,
      returnedItems: included.length,
      omittedItems: 0,
      omittedItemsExact: true,
      truncated: false,
      continuation: { complete: true, hasMore: false, nextAction: "none" },
    });
    expect(result.items?.map((item) => item.path)).toEqual(
      expect.arrayContaining(included.map(([relativePath]) => relativePath)),
    );
    expect(result.items).toHaveLength(included.length);
    expect(search.exclusionPolicies.default).toEqual(
      expect.arrayContaining([
        "**/.git/**",
        "**/node_modules/**",
        "**/generated/**",
        "cache/**",
        "**/vendor/**",
        "**/runtime-state/**",
      ]),
    );
  });

  it("applies an explicit caller glob literally without default widening", async () => {
    const repo = await makeRepo();
    const fixtures = [
      [".agents/authority.md", "literal-glob-marker\n"],
      [".codex/policy.toml", "literal-glob-marker\n"],
      ["config/policy.json5", "{ value: 'literal-glob-marker' }\n"],
      ["src/authority.ts", "export const marker = 'literal-glob-marker';\n"],
    ] as const;
    for (const [relativePath, content] of fixtures) {
      const file = path.join(repo, relativePath);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content, "utf8");
    }
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      {
        queries: [
          { pattern: "literal-glob-marker", path: ".", glob: "src/**/*.ts", maxMatches: 20 },
        ],
      },
      optionsFor(repo),
    );

    expect(search.results[0]).toMatchObject({
      status: "matched",
      scope: {
        mode: "explicit_glob",
        glob: "src/**/*.ts",
        hiddenIncluded: true,
      },
      totalItems: 1,
      returnedItems: 1,
      omittedItems: 0,
      continuation: { complete: true, hasMore: false, nextAction: "none" },
      items: [expect.objectContaining({ path: "src/authority.ts" })],
    });
  });

  it("reports exact per-query omissions and continuation", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "src", "many.md"),
      Array.from({ length: 7 }, (_, index) => `bounded-search-marker ${index}`).join("\n") + "\n",
      "utf8",
    );
    const workbench = await loadWorkbench();

    const search = await workbench.repoSearchMany(
      { queries: [{ pattern: "bounded-search-marker", path: "src", maxMatches: 3 }] },
      optionsFor(repo),
    );

    expect(search.results[0]).toMatchObject({
      status: "matched",
      totalItems: 7,
      returnedItems: 3,
      omittedItems: 4,
      omittedItemsExact: true,
      truncated: true,
      responseTruncated: false,
      aggregateOmittedItems: 0,
      searchComplete: true,
      continuation: {
        complete: false,
        hasMore: true,
        nextAction: "narrow_pattern_or_path",
      },
    });
    expect(search.coverage).toMatchObject({
      returnedItems: 3,
      omittedItems: 4,
      omittedItemsExact: true,
    });
  });

  it("reports bounded git status without mutating the repository", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "src", "beta.ts"), "export const beta = 2;\n", "utf8");
    const workbench = await loadWorkbench();

    const result = await workbench.gitInspectMany(
      {
        requests: [
          { kind: "status", maxBytes: 2000 },
          { kind: "changed_files", maxBytes: 2000 },
        ],
      },
      optionsFor(repo),
    );

    expect(result.results[0]).toMatchObject({
      status: "ok",
      stdout: expect.stringContaining("?? src/beta.ts"),
    });
    expect(result.results[1]).toMatchObject({
      status: "ok",
    });
  });

  it("caps aggregate search output without duplicating match bodies", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    for (let fileIndex = 0; fileIndex < 20; fileIndex += 1) {
      await fs.writeFile(
        path.join(repo, "src", `search-${fileIndex}.md`),
        Array.from(
          { length: 80 },
          (_, lineIndex) => `decision-anchor ${fileIndex}-${lineIndex} ${"x".repeat(70)}`,
        ).join("\n"),
        "utf8",
      );
    }

    const search = await workbench.repoSearchMany(
      {
        queries: Array.from({ length: 8 }, () => ({
          pattern: "decision-anchor",
          path: "src",
          maxMatches: 2_000,
          contextLines: 8,
        })),
      },
      optionsFor(repo),
    );
    const serialized = JSON.stringify(search);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(
      search.limits.maxResponseBytes,
    );
    expect(search.coverage.requestedQueries).toBe(8);
    expect(search.coverage.matchedQueries).toBe(8);
    expect(search.coverage.omittedItems).toBeGreaterThan(0);
    expect(search.coverage.omittedItemsExact).toBe(true);
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responseTruncated: true,
          aggregateOmittedItems: expect.any(Number),
          nextAction: "narrow_pattern_or_path",
        }),
      ]),
    );
    expect(search.results.some((result) => result.aggregateOmittedItems > 0)).toBe(true);
    const expectedItems = 20 * 80 + 19;
    for (const result of search.results) {
      expect(result.totalItems).toBe(expectedItems);
      expect(result.returnedItems + result.omittedItems).toBe(result.totalItems);
      expect(result.omittedItemsExact).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.continuation).toEqual({
        complete: false,
        hasMore: true,
        nextAction: "narrow_pattern_or_path",
      });
    }
    expect(search.coverage.omittedItems).toBe(
      search.results.reduce((total, result) => total + result.omittedItems, 0),
    );
    expect(serialized).not.toContain('"matches"');
    expect(serialized).not.toContain('"request"');
  });

  it("excludes runtime artifacts from read/search by default", async () => {
    const repo = await makeRepo();
    await fs.mkdir(path.join(repo, "artifacts"), { recursive: true });
    await fs.writeFile(path.join(repo, "artifacts", "trace.jsonl"), "{}\n", "utf8");
    const workbench = await loadWorkbench();

    const read = await workbench.repoReadMany(
      {
        files: [{ path: "artifacts/trace.jsonl" }],
      },
      optionsFor(repo),
    );
    const search = await workbench.repoSearchMany(
      {
        queries: [{ pattern: "{}", path: "artifacts", maxMatches: 5 }],
      },
      optionsFor(repo),
    );

    expect(read.results[0]).toMatchObject({
      status: "error",
      error: expect.stringContaining("excluded from workbench access"),
    });
    expect(search.results[0].status).toBe("error");
  });

  it("returns TypeScript hover, definition, and references through read-only LSP helpers", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();

    const hover = await workbench.lspHoverTypescript(
      { file: "src/alpha.ts", line: 1, character: 14 },
      optionsFor(repo),
    );
    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/alpha.ts", line: 2, character: 21 },
      optionsFor(repo),
    );
    const references = await workbench.lspReferencesTypescript(
      { file: "src/alpha.ts", line: 1, character: 14, maxResults: 10 },
      optionsFor(repo),
    );

    expect(hover).toMatchObject({
      status: "ok",
      display: expect.stringContaining("alpha"),
    });
    expect(definition).toMatchObject({
      status: "ok",
      definitions: [expect.objectContaining({ path: "src/alpha.ts", line: 1 })],
    });
    expect(references.status).toBe("ok");
    expect(references.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/alpha.ts", line: 1 }),
        expect.objectContaining({ path: "src/alpha.ts", line: 2 }),
      ]),
    );
  });

  it("resolves cross-file definitions through a bounded TypeScript dependency closure", async () => {
    const repo = await makeRepo();
    const workbench = await loadWorkbench();
    const options = optionsFor(repo);
    options.env.OPENCLAW_REPO_WORKBENCH_LSP_MAX_PROJECT_FILES = "2";

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/gamma.ts", line: 2, character: 22 },
      options,
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 2,
      lspPartial: true,
      projectFileLimitReached: false,
      definitions: [expect.objectContaining({ path: "src/alpha.ts", line: 1 })],
    });
  });

  it("stops TypeScript dependency traversal at the configured file budget", async () => {
    const repo = await makeRepo();
    await fs.writeFile(
      path.join(repo, "src", "chain-root.ts"),
      'import { middle } from "./chain-middle.js";\nexport const root = middle;\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(repo, "src", "chain-middle.ts"),
      'import { leaf } from "./chain-leaf.js";\nexport const middle = leaf;\n',
      "utf8",
    );
    await fs.writeFile(path.join(repo, "src", "chain-leaf.ts"), "export const leaf = 1;\n", "utf8");
    const workbench = await loadWorkbench();
    const options = optionsFor(repo);
    options.env.OPENCLAW_REPO_WORKBENCH_LSP_MAX_PROJECT_FILES = "2";

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/chain-root.ts", line: 2, character: 21 },
      options,
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 2,
      lspPartial: true,
      projectFileLimitReached: true,
      definitions: [expect.objectContaining({ path: "src/chain-middle.ts", line: 2 })],
    });
  });

  it("rejects TypeScript dependencies that escape the workspace through symlinks", async () => {
    const repo = await makeRepo();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-outside-"));
    tempDirs.push(outside);
    await fs.writeFile(path.join(outside, "outside.ts"), "export const outside = 1;\n", "utf8");
    await fs.symlink(path.join(outside, "outside.ts"), path.join(repo, "src", "linked.ts"));
    await fs.writeFile(
      path.join(repo, "src", "symlink-root.ts"),
      'import { outside } from "./linked.js";\nexport const root = outside;\n',
      "utf8",
    );
    const workbench = await loadWorkbench();

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/symlink-root.ts", line: 2, character: 21 },
      optionsFor(repo),
    );

    expect(definition).toMatchObject({
      status: "ok",
      projectMode: "tsconfig_dependency_closure",
      projectFileCount: 1,
      definitions: [expect.objectContaining({ path: "src/symlink-root.ts", line: 1 })],
    });
    expect(definition.definitions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining("outside") }),
      ]),
    );
  });

  it("rejects tsconfig inheritance outside the workspace", async () => {
    const repo = await makeRepo();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workbench-config-"));
    tempDirs.push(outside);
    const externalConfig = path.join(outside, "tsconfig.external.json");
    await fs.writeFile(externalConfig, '{"compilerOptions":{"strict":true}}\n', "utf8");
    await fs.writeFile(
      path.join(repo, "tsconfig.json"),
      JSON.stringify({ extends: externalConfig, include: ["src/**/*.ts"] }) + "\n",
      "utf8",
    );
    const workbench = await loadWorkbench();

    const definition = await workbench.lspDefinitionTypescript(
      { file: "src/gamma.ts", line: 2, character: 22 },
      optionsFor(repo),
    );

    expect(definition).toMatchObject({
      status: "error",
      error: expect.stringContaining("tsconfig.external.json"),
    });
  });
});
