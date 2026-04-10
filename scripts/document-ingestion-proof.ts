import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createDocumentReadTool } from "../src/agents/tools/document-read-tool.js";

const execFileAsync = promisify(execFile);

type ProofCaseResult = {
  id: string;
  status: "passed" | "failed";
  detail: string;
  extra?: Record<string, unknown>;
};

async function loadSimpleDotEnv(filePath: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entries: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

async function detectRuntimeContainerName() {
  const explicit = process.env.OPENCLAW_RUNTIME_CONTAINER?.trim();
  if (explicit) {
    return explicit;
  }

  const { stdout } = await execFileAsync("docker", [
    "ps",
    "--filter",
    "label=com.docker.compose.project.working_dir=/root/services/openclaw",
    "--filter",
    "label=com.docker.compose.service=openclaw-gateway",
    "--format",
    "{{.Names}}",
  ]);
  const detected = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return detected || "openclaw-openclaw-gateway-1";
}

async function runImportedDocRuntimeCase(params: {
  runtimeContainerName: string;
  workspaceDir: string;
  path: string;
  chunkLines: number;
  mode: "incomplete" | "complete";
}) {
  const script = `
import { createOpenClawTools } from '/app/dist/openclaw-tools.runtime.js';
const workspaceDir = process.argv[1];
const targetPath = process.argv[2];
const chunkLines = Number(process.argv[3]);
const mode = process.argv[4];
const tools = createOpenClawTools({ workspaceDir });
const tool = tools.find((entry) => entry.name === 'document_read');
if (!tool) {
  throw new Error('document_read not found');
}
const started = await tool.execute('runtime-proof-start', {
  action: 'start',
  path: targetPath,
  chunkLines,
});
const sessionId = String(started.details?.sessionId);
if (mode === 'incomplete') {
  const earlyVerify = await tool.execute('runtime-proof-verify-early', {
    action: 'verify',
    sessionId,
  });
  process.stdout.write(JSON.stringify({
    started: started.details ?? null,
    verify: earlyVerify.details ?? null,
  }));
  process.exit(0);
}
while (true) {
  const status = await tool.execute('runtime-proof-status', {
    action: 'status',
    sessionId,
  });
  const missing = status.details?.coverage?.missingChunkIndexes;
  if (!Array.isArray(missing) || missing.length === 0) {
    break;
  }
  await tool.execute('runtime-proof-next', {
    action: 'next',
    sessionId,
  });
}
const verified = await tool.execute('runtime-proof-verify', {
  action: 'verify',
  sessionId,
});
process.stdout.write(JSON.stringify({
  started: started.details ?? null,
  verify: verified.details ?? null,
}));
process.exit(0);
  `;
  const { stdout } = await execFileAsync("docker", [
    "exec",
    params.runtimeContainerName,
    "node",
    "--input-type=module",
    "-e",
    script,
    params.workspaceDir,
    params.path,
    String(params.chunkLines),
    params.mode,
  ]);
  return JSON.parse(stdout) as {
    started: Record<string, unknown> | null;
    verify: Record<string, unknown> | null;
  };
}

async function main() {
  const repoRoot = process.cwd();
  const repoDotEnv = await loadSimpleDotEnv(path.join(repoRoot, ".env"));
  const runtimeContainerName = await detectRuntimeContainerName();
  const workspaceRoot =
    process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
    repoDotEnv.OPENCLAW_WORKSPACE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw", "workspace");
  const runtimeWorkspaceDir = "/home/node/.openclaw/workspace";
  const proofRoot = path.join(workspaceRoot, ".openclaw", "document-ingestion-proof");
  const fixturesRoot = path.join(proofRoot, "fixtures");
  await fs.mkdir(fixturesRoot, { recursive: true });
  const tool = createDocumentReadTool(workspaceRoot);

  const results: ProofCaseResult[] = [];

  const addCase = async (id: string, run: () => Promise<Record<string, unknown>>) => {
    try {
      const extra = await run();
      results.push({ id, status: "passed", detail: "ok", extra });
    } catch (error) {
      results.push({
        id,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await addCase("small-file-complete", async () => {
    const relativePath = ".openclaw/document-ingestion-proof/fixtures/small.md";
    await fs.writeFile(path.join(workspaceRoot, relativePath), "# title\nbody\n", "utf8");
    const started = await tool.execute("start-small", { action: "start", path: relativePath });
    const sessionId = String((started.details as { sessionId: string }).sessionId);
    await tool.execute("chunk-small", { action: "next", sessionId });
    const verified = await tool.execute("verify-small", { action: "verify", sessionId });
    return {
      sessionId,
      verifyStatus: (verified.details as { status?: string }).status,
    };
  });

  await addCase("large-file-repeatability", async () => {
    const relativePath = ".openclaw/document-ingestion-proof/fixtures/large.md";
    const content = Array.from({ length: 1200 }, (_, index) => `row ${index + 1}`).join("\n");
    await fs.writeFile(path.join(workspaceRoot, relativePath), content, "utf8");
    const sessionIds: string[] = [];
    for (let runIndex = 0; runIndex < 3; runIndex += 1) {
      const started = await tool.execute(`start-large-${runIndex}`, {
        action: "start",
        path: relativePath,
        chunkLines: 150,
      });
      const sessionId = String((started.details as { sessionId: string }).sessionId);
      sessionIds.push(sessionId);
      while (true) {
        const status = await tool.execute(`status-large-${runIndex}`, {
          action: "status",
          sessionId,
        });
        const coverage = (
          status.details as { coverage?: { complete?: boolean; missingChunkIndexes?: number[] } }
        ).coverage;
        if (coverage?.complete === true || (coverage?.missingChunkIndexes?.length ?? 0) === 0) {
          break;
        }
        await tool.execute(`next-large-${runIndex}`, { action: "next", sessionId });
      }
      const verified = await tool.execute(`verify-large-${runIndex}`, {
        action: "verify",
        sessionId,
      });
      if ((verified.details as { status?: string }).status !== "complete") {
        throw new Error(`verify status was ${(verified.details as { status?: string }).status}`);
      }
    }
    return { sessionIds };
  });

  await addCase("long-line-byte-fallback", async () => {
    const relativePath = ".openclaw/document-ingestion-proof/fixtures/long-line.md";
    await fs.writeFile(
      path.join(workspaceRoot, relativePath),
      `head\n${"x".repeat(20_000)}\n`,
      "utf8",
    );
    const started = await tool.execute("start-long-line", {
      action: "start",
      path: relativePath,
      maxLineBytes: 2048,
      chunkBytes: 4096,
    });
    return {
      chunkingMode: (started.details as { chunkingMode?: string }).chunkingMode,
    };
  });

  await addCase("mixed-line-endings", async () => {
    const relativePath = ".openclaw/document-ingestion-proof/fixtures/mixed.txt";
    await fs.writeFile(path.join(workspaceRoot, relativePath), "a\r\nb\nc\rd", "utf8");
    const started = await tool.execute("start-mixed", {
      action: "start",
      path: relativePath,
      chunkLines: 2,
    });
    return {
      lineEnding: (started.details as { lineEnding?: string }).lineEnding,
    };
  });

  await addCase("change-during-read-detected", async () => {
    const relativePath = ".openclaw/document-ingestion-proof/fixtures/changing.md";
    const fullPath = path.join(workspaceRoot, relativePath);
    await fs.writeFile(fullPath, "one\ntwo\nthree\nfour\n", "utf8");
    const started = await tool.execute("start-changing", {
      action: "start",
      path: relativePath,
      chunkLines: 2,
    });
    const sessionId = String((started.details as { sessionId: string }).sessionId);
    await fs.writeFile(fullPath, "one\ntwo\nthree\nfour\nfive\n", "utf8");
    let errorMessage = "";
    try {
      await tool.execute("next-changing", { action: "next", sessionId });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    if (!/stale/i.test(errorMessage)) {
      throw new Error(`expected stale error, got ${errorMessage || "<none>"}`);
    }
    return { errorMessage };
  });

  await addCase("imported-doc-incomplete-before-full-coverage", async () => {
    const result = await runImportedDocRuntimeCase({
      runtimeContainerName,
      workspaceDir: runtimeWorkspaceDir,
      path: "imports/engineering_repo/content/docs/memory-system/README.md",
      chunkLines: 120,
      mode: "incomplete",
    });
    if (result.verify?.status !== "incomplete") {
      throw new Error(
        `expected incomplete verify before reading all chunks, got ${String(result.verify?.status)}`,
      );
    }
    return {
      sessionId: result.started?.sessionId,
      earlyVerifyStatus: result.verify?.status,
      missingChunkIndexes: result.verify?.coverage?.missingChunkIndexes,
    };
  });

  await addCase("imported-doc-complete-in-runtime", async () => {
    const result = await runImportedDocRuntimeCase({
      runtimeContainerName,
      workspaceDir: runtimeWorkspaceDir,
      path: "imports/engineering_repo/content/docs/memory-system/README.md",
      chunkLines: 120,
      mode: "complete",
    });
    if (result.verify?.status !== "complete") {
      throw new Error(`imported doc verify status was ${String(result.verify?.status)}`);
    }
    return {
      sessionId: result.started?.sessionId,
      verifyStatus: result.verify?.status,
      chunkCount: result.verify?.fingerprint?.expectedChunkCount,
      sha256: result.verify?.fingerprint?.sha256,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    workspaceRoot,
    runtimeContainerName,
    runtimeWorkspaceDir,
    results,
  };
  const reportPath = path.join(proofRoot, `report-${Date.now()}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
