import { parseArgs } from "node:util";
import {
  buildMemorySoakTelemetrySummary,
  renderMemorySoakTelemetryDailyBrief,
  renderMemorySoakTelemetryOperatorSummary,
  readMemorySoakTelemetryEvents,
  writeMemorySoakTelemetrySummaryArtifacts,
} from "../extensions/memory-middleware/src/memory-soak-telemetry.js";

type CliOptions = {
  sinceDate?: string;
  format: "json" | "summary" | "daily";
  writeArtifacts: boolean;
};

function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "since-date": { type: "string" },
      format: { type: "string" },
      "write-artifacts": { type: "boolean", default: true },
      "no-write-artifacts": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const format = values.format?.trim().toLowerCase();
  if (format && format !== "json" && format !== "summary" && format !== "daily") {
    throw new Error(`Unsupported --format value: ${values.format}`);
  }

  return {
    ...(values["since-date"] ? { sinceDate: values["since-date"].trim() } : {}),
    format: (format as CliOptions["format"] | undefined) ?? "json",
    writeArtifacts: (values["write-artifacts"] ?? true) && !(values["no-write-artifacts"] ?? false),
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const events = await readMemorySoakTelemetryEvents(
    options.sinceDate ? { sinceDate: options.sinceDate } : undefined,
  );
  const summary = buildMemorySoakTelemetrySummary({
    events,
    generatedAt,
  });
  const operatorSummary = renderMemorySoakTelemetryOperatorSummary(summary);
  const dailyBrief = renderMemorySoakTelemetryDailyBrief(summary);
  const artifacts = options.writeArtifacts
    ? await writeMemorySoakTelemetrySummaryArtifacts({
        summary,
      })
    : undefined;

  if (options.format === "summary") {
    process.stdout.write(`${operatorSummary}\n`);
    return;
  }

  if (options.format === "daily") {
    process.stdout.write(`${dailyBrief}\n`);
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt,
        sinceDate: options.sinceDate,
        summary,
        operatorSummary,
        dailyBrief,
        ...(artifacts ? { artifacts } : {}),
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
