import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  loadSimpleDotEnv,
  resolveDocumentImports,
  statImportPath,
  type ResolvedDocumentImport,
} from "./lib/document-imports.js";

const execFileAsync = promisify(execFile);
const runtimeContainerName =
  process.env.OPENCLAW_RUNTIME_CONTAINER || "openclaw-upgrade-2026324-openclaw-gateway-1";

type PathStat = Awaited<ReturnType<typeof statImportPath>>;

type ImportHealth = {
  id: string;
  sourcePath: string;
  workspacePath: string;
  workspaceAbsolutePath: string;
  runtimeAbsolutePath: string;
  mode: string;
  readOnlyExpected: boolean;
  source: PathStat;
  hostWorkspacePlaceholder: PathStat;
  importedRuntimeView: PathStat;
  readable: boolean;
  writableFromRuntime: boolean;
  propagation: {
    tested: boolean;
    status: "skipped" | "ok" | "failed";
    detail: string;
  };
  health: "ok" | "failed";
};

async function dockerExecRead(filePath: string) {
  await execFileAsync("docker", [
    "exec",
    runtimeContainerName,
    "sh",
    "-lc",
    `test -r ${JSON.stringify(filePath)}`,
  ]);
}

async function dockerStatPath(filePath: string): Promise<PathStat> {
  const { stdout } = await execFileAsync("docker", [
    "exec",
    runtimeContainerName,
    "node",
    "-e",
    `
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const target = process.argv[1];
try {
  const stat = fs.statSync(target);
  const result = {
    exists: true,
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: undefined,
  };
  if (stat.isFile()) {
    result.sha256 = createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  }
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  if (error && typeof error === "object" && error.code === "ENOENT") {
    process.stdout.write(JSON.stringify({
      exists: false,
      type: "missing",
      size: 0,
      mtimeMs: 0,
    }));
    process.exit(0);
  }
  throw error;
}
    `,
    filePath,
  ]);
  return JSON.parse(stdout) as PathStat;
}

async function dockerReadText(filePath: string) {
  const { stdout } = await execFileAsync("docker", [
    "exec",
    runtimeContainerName,
    "node",
    "-e",
    `
const fs = require("node:fs");
const target = process.argv[1];
process.stdout.write(fs.readFileSync(target, "utf8"));
    `,
    filePath,
  ]);
  return stdout;
}

async function dockerExecWriteShouldFail(filePath: string) {
  try {
    await execFileAsync("docker", [
      "exec",
      runtimeContainerName,
      "sh",
      "-lc",
      `printf test > ${JSON.stringify(filePath)}`,
    ]);
    await execFileAsync("docker", [
      "exec",
      runtimeContainerName,
      "sh",
      "-lc",
      `rm -f ${JSON.stringify(filePath)}`,
    ]).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function verifyPropagation(
  importEntry: ResolvedDocumentImport,
): Promise<ImportHealth["propagation"]> {
  if (importEntry.id !== "probe-docs" || importEntry.sourceType !== "directory") {
    return {
      tested: false,
      status: "skipped",
      detail: "probe update propagation is only exercised through the dedicated probe import",
    };
  }

  const probeFileName = "live-propagation-probe.txt";
  const sourceProbePath = path.join(importEntry.sourcePath, probeFileName);
  const importedProbePath = path.posix.join(importEntry.runtimeAbsolutePath, probeFileName);
  const marker = `probe-${Date.now()}`;
  await fs.mkdir(importEntry.sourcePath, { recursive: true });
  await fs.writeFile(sourceProbePath, `${marker}\n`, "utf8");
  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        const imported = await dockerReadText(importedProbePath);
        if (imported.includes(marker)) {
          return {
            tested: true,
            status: "ok",
            detail: `observed probe content at runtime path ${importedProbePath}`,
          };
        }
      } catch {
        // wait for mount visibility
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
      tested: true,
      status: "failed",
      detail: `probe update did not appear at runtime path ${importedProbePath} within timeout`,
    };
  } finally {
    await fs.rm(sourceProbePath, { force: true });
  }
}

function readableWritablePass(params: {
  readOnlyExpected: boolean;
  writableFromRuntime: boolean;
  propagation: ImportHealth["propagation"];
}) {
  const writePass = params.readOnlyExpected ? !params.writableFromRuntime : true;
  const propagationPass = params.propagation.status !== "failed";
  return writePass && propagationPass;
}

async function main() {
  const repoRoot = process.cwd();
  const repoDotEnv = await loadSimpleDotEnv(path.join(repoRoot, ".env"));
  const workspaceRoot =
    process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
    repoDotEnv.OPENCLAW_WORKSPACE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw", "workspace");
  const imports = await resolveDocumentImports({
    repoRoot,
    workspaceRoot,
    env: process.env,
  });

  const report: {
    generatedAt: string;
    repoRoot: string;
    workspaceRoot: string;
    runtimeContainerName: string;
    imports: ImportHealth[];
  } = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    workspaceRoot,
    runtimeContainerName,
    imports: [],
  };

  for (const entry of imports) {
    const source = await statImportPath(entry.sourcePath);
    const hostWorkspacePlaceholder = await statImportPath(entry.workspaceAbsolutePath);
    const importedRuntimeView = await dockerStatPath(entry.runtimeAbsolutePath);
    await dockerExecRead(entry.runtimeAbsolutePath);
    const writableTarget =
      entry.sourceType === "file"
        ? entry.runtimeAbsolutePath
        : path.posix.join(entry.runtimeAbsolutePath, ".write-check");
    const writableFromRuntime = await dockerExecWriteShouldFail(writableTarget);
    const propagation = await verifyPropagation(entry);
    report.imports.push({
      id: entry.id,
      sourcePath: entry.sourcePath,
      workspacePath: entry.workspacePath,
      workspaceAbsolutePath: entry.workspaceAbsolutePath,
      runtimeAbsolutePath: entry.runtimeAbsolutePath,
      mode: entry.mode,
      readOnlyExpected: entry.readOnly,
      source,
      hostWorkspacePlaceholder,
      importedRuntimeView,
      readable: true,
      writableFromRuntime,
      propagation,
      health:
        importedRuntimeView.exists &&
        readableWritablePass({ readOnlyExpected: entry.readOnly, writableFromRuntime, propagation })
          ? "ok"
          : "failed",
    });
  }

  const manifestPath = path.join(
    workspaceRoot,
    "imports",
    "_metadata",
    "document-imports-manifest.json",
  );
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${manifestPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
