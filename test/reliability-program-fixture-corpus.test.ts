import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const SOURCE_COMMIT = "41ec19868b13c463cfdcde264fa1857c3e05d29c";
const SCHEMA_VERSION = "openclaw.reliability.fixture-corpus.v1";
const CORRECTED_SPEC_CONTENT_SHA256 =
  "4054b07070ba51ec10e8649d9bc1d02ee9df4ed6558acab12fc013f55d5a94a3";

const RUNTIME_IDS = [
  "FX-LIFE-01",
  "FX-LIFE-02",
  "FX-RESTART-01",
  "FX-RESTART-02",
  "FX-CONT-01",
  "FX-CONT-02",
  "FX-CONT-03",
  "FX-CONT-04",
  "FX-PROVIDER-01",
  "FX-WT-01",
  "FX-WT-02",
  "FX-FS-01",
  "FX-READ-01",
  "FX-TASKFLOW-01",
  "FX-DOCTOR-01",
  "FX-X-RETRY-01",
  "FX-WRITE-01",
  "FX-GBRAIN-01",
  "FX-AUTH-01",
  "FX-TOPOLOGY-01",
  "FX-BACKUP-01",
  "FX-WT-TELEMETRY-01",
] as const;

const CODING_IDS = [
  "FX-CODE-01",
  "FX-CODE-02",
  "FX-CODE-03",
  "FX-VALID-01",
  "FX-DIFF-01",
  "FX-CHILD-01",
  "FX-CREVIEW-01",
  "FX-CREVIEW-02",
] as const;

const nonEmptyString = z.string().trim().min(1);
const relativePath = nonEmptyString.refine((value) => !path.isAbsolute(value), {
  message: "path must be repository-relative",
});

const fixtureEntrySchema = z.object({
  id: nonEmptyString,
  nativeOwner: z.object({
    repository: z.enum(["openclaw", "gbrain-support-image"]),
    component: nonEmptyString,
    surfaces: z.array(relativePath).min(1),
    sourceAuthority: z
      .object({
        checkout: z.literal("/srv/openclaw-next/src/gbrain"),
        origin: z.literal("https://github.com/garrytan/gbrain.git"),
        commit: z.literal("c13dab0e474a06dbcf75c9b5ec102c3070820cbc"),
        tree: z.literal("573ac91a2db801930c572d2cc83bb64a05fd8334"),
        dockerfilePath: z.literal("Dockerfile.openclaw"),
        dockerfileSha256: z.literal(
          "51d3ae2f419f7a39b0aaa789825b5b09e8bc1698054c33de6efd935c5936d457",
        ),
        livePackageSha256: z.literal(
          "f3c9e442c5fb27d659b90fd7e19dd228c06ce1d8c45485abae5c99d91cb43bc7",
        ),
        liveImageDigest: z.literal(
          "sha256:8b6c5a0f8eedacdd5f6781d837ca44adf3285c735578039464942cca5ab31cd5",
        ),
        liveImageRevisionLabel: z.literal("c13dab0e"),
        observedLiveContainers: z.tuple([
          z.literal("openclaw-next-gbrain-autopilot"),
          z.literal("openclaw-next-gbrain-mcp"),
        ]),
      })
      .optional(),
  }),
  phaseGate: z.object({
    implementationPhase: z.enum(["Phase 1", "Phase 2", "Phase 3", "Phase 4C"]),
    focusedGate: z.enum(["G1", "G2", "G3", "G4C"]),
    candidateGate: z.literal("G5"),
    liveGate: z.literal("G6"),
  }),
  scenario: z.object({
    input: nonEmptyString,
    steps: z.array(nonEmptyString).min(2),
  }),
  expectedObservableOutcomes: z.array(nonEmptyString).min(2),
  negativeAssertions: z.array(nonEmptyString).min(2),
  existingPassingControlTestPaths: z.array(relativePath),
  intendedOwningTargetTest: z.object({
    repository: z.enum(["openclaw", "gbrain-support-image"]),
    path: relativePath,
  }),
  nativeRouterTargetPath: relativePath.optional(),
  nativeTestCommand: nonEmptyString,
  evidenceTargets: z.object({
    candidate: relativePath,
    live: relativePath,
  }),
  baselineState: z.object({
    classification: z.enum(["partial", "missing_exact_fixture"]),
    gap: nonEmptyString,
  }),
});

const fixtureCorpusSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  corpus: z.enum(["runtime", "coding"]),
  authority: z
    .object({
      sourceCommit: z.literal(SOURCE_COMMIT),
      sourceTree: nonEmptyString,
      baselineProgramSpecCommit: z.literal("cdc3c11e575eb6067de18333ee88133ba9b903dd"),
      correctedProgramSpecContentSha256: z.literal(CORRECTED_SPEC_CONTENT_SHA256),
      programSpecSection: z.literal("12"),
      proofLockGate: z.literal("G0"),
    })
    .strict(),
  entries: z.array(fixtureEntrySchema).min(1),
});

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const fixtureRoot = path.join(repoRoot, "test/fixtures/reliability-program");

function readCorpus(name: "runtime" | "coding") {
  const raw = fs.readFileSync(path.join(fixtureRoot, `${name}.json`), "utf8");
  return {
    corpus: fixtureCorpusSchema.parse(JSON.parse(raw)),
    raw,
  };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("reliability program fixture corpus", () => {
  test("is schema-valid, unique, complete, native-routed, and source-frozen", () => {
    const runtime = readCorpus("runtime");
    const coding = readCorpus("coding");
    const entries = [...runtime.corpus.entries, ...coding.corpus.entries];

    expect(runtime.corpus.corpus).toBe("runtime");
    expect(coding.corpus.corpus).toBe("coding");
    expect(runtime.corpus.entries).toHaveLength(22);
    expect(coding.corpus.entries).toHaveLength(8);
    expect(sorted(runtime.corpus.entries.map((entry) => entry.id))).toEqual(sorted(RUNTIME_IDS));
    expect(sorted(coding.corpus.entries.map((entry) => entry.id))).toEqual(sorted(CODING_IDS));

    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of entries) {
      const targetPath = entry.intendedOwningTargetTest.path;
      const routerTargetPath = entry.nativeRouterTargetPath ?? targetPath;
      expect(entry.nativeTestCommand).toBe(`node scripts/test-projects.mjs ${routerTargetPath}`);
      expect(entry.evidenceTargets.candidate).toContain(`/G5/${entry.id}.json`);
      expect(entry.evidenceTargets.live).toContain(`/G6/${entry.id}.json`);

      for (const controlPath of entry.existingPassingControlTestPaths) {
        expect(fs.existsSync(path.join(repoRoot, controlPath)), controlPath).toBe(true);
      }

      expect(entry.expectedObservableOutcomes).not.toContain("");
      expect(entry.negativeAssertions).not.toContain("");
    }

    const gbrain = runtime.corpus.entries.find((entry) => entry.id === "FX-GBRAIN-01");
    expect(gbrain?.nativeOwner.repository).toBe("gbrain-support-image");
    expect(gbrain?.nativeOwner.sourceAuthority?.commit).toBe(
      "c13dab0e474a06dbcf75c9b5ec102c3070820cbc",
    );
    expect(gbrain?.nativeOwner.sourceAuthority?.liveImageRevisionLabel).toBe("c13dab0e");
    expect(gbrain?.baselineState.classification).toBe("partial");

    const serialized = `${runtime.raw}\n${coding.raw}`.toLowerCase();
    for (const productSpecificTerm of ["american atomics", "conor lynch"]) {
      expect(serialized).not.toContain(productSpecificTerm);
    }
  });
});
