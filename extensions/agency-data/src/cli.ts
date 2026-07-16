import type { Command } from "commander";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { importOwnedXMetricsCsv } from "./x-csv-import.js";

type ImportOptions = {
  approved?: boolean;
  tenant: string;
  subjectType: "company" | "person";
  subjectId: string;
  account: string;
};

export function registerAgencyDataCli(program: Command): void {
  const command = program
    .command("agency-data")
    .description("Operate the canonical Agency Data analytics store");
  command
    .command("import-x-csv")
    .argument("<file>", "bounded owned-X metrics CSV")
    .requiredOption("--tenant <id>", "tenant identifier")
    .requiredOption("--subject-type <type>", "company or person")
    .requiredOption("--subject-id <id>", "canonical subject identifier")
    .requiredOption("--account <id>", "canonical X account identifier")
    .option("--approved", "confirm operator approval for this import", false)
    .action(async (file: string, options: ImportOptions) => {
      if (options.subjectType !== "company" && options.subjectType !== "person") {
        throw new Error("--subject-type must be company or person.");
      }
      const result = await importOwnedXMetricsCsv({
        filePath: file,
        approved: options.approved === true,
        stateDir: resolveStateDir(),
        tenantId: options.tenant,
        subject: { entityType: options.subjectType, entityId: options.subjectId },
        accountId: options.account,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });
}
