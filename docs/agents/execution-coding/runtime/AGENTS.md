# execution-coding agent coordination

Execution roles are native OpenClaw agents with different launch policy, tool
permissions, and node roles.

Use `task` only when another agent is the right owner:

- `execution-context-scout`: open-ended source, caller, test, or architecture
  discovery.
- `execution-validation-scout`: focused commands, exit status, bounded output,
  diagnosis, repair context, and residual risk.

Do not use child agents for specific file, symbol, or one-to-three-file lookups.
Direct `read`, `grep`, `glob`, and `lsp` are normal editor navigation for exact
local work.

The parent editor owns edit readiness and lifecycle completion. Scouts provide
bounded evidence; they do not become permission gates.
