import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerReleaseCommand(program: Command): void {
  const release = program
    .command("release")
    .description("Prepare accepted immutable OpenClaw releases");

  release
    .command("prepare")
    .description("Prepare an accepted release from a settled Coding task")
    .requiredOption("--coding-task <id>", "Settled Coding task ID")
    .option("--json", "Output JSON", false)
    .action(async (opts: { codingTask: string; json?: boolean }) => {
      await runCommandWithRuntime(
        defaultRuntime,
        async () => {
          const [{ prepareAcceptedRelease }, { buildReleasePreparationEnvironment }] =
            await Promise.all([
              import("../../infra/release-preparation.js"),
              import("../../infra/release-preparation-handoff.js"),
            ]);
          const result = await prepareAcceptedRelease({
            codingTaskId: opts.codingTask,
            env: buildReleasePreparationEnvironment(process.env),
          });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          defaultRuntime.log(
            `Accepted release ${result.acceptedReleaseReceiptId} from Coding task ${result.codingTaskId}.`,
          );
        },
        (error) => {
          defaultRuntime.error(String(error));
          defaultRuntime.exit(2);
        },
      );
    });
}
