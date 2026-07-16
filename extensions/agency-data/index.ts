import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { registerAgencyDataCli } from "./src/cli.js";
import { resolveAgencyDataStateDir } from "./src/store.js";
import { createAgencyDataTools } from "./src/tools.js";

export default definePluginEntry({
  id: "agency-data",
  name: "Agency Data",
  description: "Read-only marketing analytics tools backed by append-only canonical JSONL.",
  register(api) {
    const stateDir = resolveAgencyDataStateDir(resolveStateDir());
    for (const tool of createAgencyDataTools(stateDir)) {
      api.registerTool(tool, { name: tool.name });
    }
    api.registerCli(
      ({ program }) => {
        registerAgencyDataCli(program);
      },
      {
        descriptors: [
          {
            name: "agency-data",
            description: "Inspect or explicitly backfill canonical marketing analytics",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
});
