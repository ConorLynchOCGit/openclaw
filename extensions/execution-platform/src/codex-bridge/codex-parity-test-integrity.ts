import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MainRepoHashManifest } from "./main-repo-change-evidence.ts";

export type CodexParityTestFileIntegrity = {
  fileRef: string;
  exists: boolean;
  vitestEnvironment: "jsdom" | "node" | "other" | "missing";
  skippedSuiteCount: number;
  skippedTestCount: number;
  focusedTestCount: number;
  assertionCount: number;
  activeTestCount: number;
};

export type CodexParityTestIntegritySnapshot = {
  artifactKind: "codex_parity_test_integrity_snapshot";
  snapshotId: string;
  files: CodexParityTestFileIntegrity[];
  rawTestContentStored: false;
};

export type CodexParityTestIntegrityDecision = {
  artifactKind: "codex_parity_test_integrity_decision";
  status: "accepted" | "blocked";
  reasonCodes: string[];
  beforeSnapshotId: string;
  afterSnapshotId: string;
  touchedTestFileRefs: string[];
  rawTestContentStored: false;
};

function isTestFile(fileRef: string): boolean {
  return /\.(?:test|spec)\.[cm]?[tj]sx?$/u.test(fileRef);
}

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

function readVitestEnvironment(content: string): CodexParityTestFileIntegrity["vitestEnvironment"] {
  const match = content.match(/@vitest-environment\s+([a-z0-9_-]+)/iu);
  if (!match) {
    return "missing";
  }
  return match[1] === "jsdom" || match[1] === "node" ? match[1] : "other";
}

async function inspectTestFile(
  repoRoot: string,
  fileRef: string,
): Promise<CodexParityTestFileIntegrity> {
  const content = await readFile(path.join(repoRoot, fileRef), "utf8").catch(() => null);
  if (content === null) {
    return {
      fileRef,
      exists: false,
      vitestEnvironment: "missing",
      skippedSuiteCount: 0,
      skippedTestCount: 0,
      focusedTestCount: 0,
      assertionCount: 0,
      activeTestCount: 0,
    };
  }
  const skippedSuiteCount = countMatches(content, /\bdescribe\.skip\s*\(/gu);
  const skippedTestCount = countMatches(content, /\b(?:it|test)\.skip\s*\(/gu);
  const focusedTestCount = countMatches(content, /\b(?:describe|it|test)\.only\s*\(/gu);
  const declaredTestCount = countMatches(content, /\b(?:it|test)\s*\(/gu);
  const assertionCount = countMatches(content, /\bexpect\s*\(/gu);
  return {
    fileRef,
    exists: true,
    vitestEnvironment: readVitestEnvironment(content),
    skippedSuiteCount,
    skippedTestCount,
    focusedTestCount,
    assertionCount,
    activeTestCount: Math.max(0, declaredTestCount - skippedTestCount),
  };
}

export async function createCodexParityTestIntegritySnapshot(input: {
  repoRoot: string;
  manifest: MainRepoHashManifest;
  snapshotId: string;
}): Promise<CodexParityTestIntegritySnapshot> {
  const testFiles = input.manifest.files
    .map((file) => file.fileRef)
    .filter(isTestFile)
    .slice(0, 300);
  return {
    artifactKind: "codex_parity_test_integrity_snapshot",
    snapshotId: input.snapshotId,
    files: await Promise.all(testFiles.map((fileRef) => inspectTestFile(input.repoRoot, fileRef))),
    rawTestContentStored: false,
  };
}

export function decideCodexParityTestIntegrity(input: {
  before: CodexParityTestIntegritySnapshot;
  after: CodexParityTestIntegritySnapshot;
  changedFileRefs?: string[];
}): CodexParityTestIntegrityDecision {
  const beforeByFile = new Map(input.before.files.map((file) => [file.fileRef, file]));
  const touchedTestFileRefs = (input.changedFileRefs ?? [])
    .filter(isTestFile)
    .filter((fileRef, index, refs) => refs.indexOf(fileRef) === index)
    .slice(0, 80);
  const touchedTestFiles = new Set(touchedTestFileRefs);
  const reasonCodes: string[] = [];
  for (const after of input.after.files) {
    const before = beforeByFile.get(after.fileRef);
    const touched = touchedTestFiles.has(after.fileRef);
    if (touched && (after.skippedSuiteCount > 0 || after.skippedTestCount > 0)) {
      reasonCodes.push(`touched_test_has_skip:${after.fileRef}`);
    }
    if (touched && after.focusedTestCount > 0) {
      reasonCodes.push(`touched_test_has_only:${after.fileRef}`);
    }
    if (touched && after.fileRef.startsWith("ui/") && after.vitestEnvironment !== "jsdom") {
      reasonCodes.push(`touched_ui_test_requires_jsdom:${after.fileRef}`);
    }
    if (!before) {
      if (after.skippedSuiteCount > 0 || after.skippedTestCount > 0) {
        reasonCodes.push(`test_skip_introduced:${after.fileRef}`);
      }
      if (after.focusedTestCount > 0) {
        reasonCodes.push(`test_only_introduced:${after.fileRef}`);
      }
      continue;
    }
    if (after.skippedSuiteCount > before.skippedSuiteCount) {
      reasonCodes.push(`describe_skip_introduced:${after.fileRef}`);
    }
    if (after.skippedTestCount > before.skippedTestCount) {
      reasonCodes.push(`test_skip_introduced:${after.fileRef}`);
    }
    if (after.focusedTestCount > before.focusedTestCount) {
      reasonCodes.push(`test_only_introduced:${after.fileRef}`);
    }
    if (before.vitestEnvironment === "jsdom" && after.vitestEnvironment === "node") {
      reasonCodes.push(`vitest_environment_downgraded:${after.fileRef}`);
    }
    if (after.activeTestCount < before.activeTestCount) {
      reasonCodes.push(`active_test_count_dropped:${after.fileRef}`);
    }
    if (after.assertionCount < before.assertionCount) {
      reasonCodes.push(`assertion_count_dropped:${after.fileRef}`);
    }
  }
  return {
    artifactKind: "codex_parity_test_integrity_decision",
    status: reasonCodes.length === 0 ? "accepted" : "blocked",
    reasonCodes: reasonCodes.length === 0 ? ["test_integrity_accepted"] : reasonCodes,
    beforeSnapshotId: input.before.snapshotId,
    afterSnapshotId: input.after.snapshotId,
    touchedTestFileRefs,
    rawTestContentStored: false,
  };
}
