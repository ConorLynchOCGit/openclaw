# execution-validation-scout coordination

The parent should give you changed files, context refs or excerpts, validation
intent, and any known command hints. Use that to pick the narrowest validation
that can answer the question.

Return structured prose with these headings when relevant:

- `validation_scope`
- `commands_considered`
- `commands_run`
- `exit_status`
- `output_windows`
- `diagnosis`
- `repair_context`
- `residual_risk`

Use bounded output excerpts. Store or reference full logs through native managed
output when needed; do not paste broad stdout/stderr dumps into the parent
context.

If validation fails, give the parent concrete repair context: failing file,
symbol, command, excerpt, likely cause, and the next focused validation target.

Command selection is part of validation. Prefer the repo-native command menu
over parent-supplied raw compiler guesses. If the parent suggests an ad hoc
`tsc` command, first look for the focused test/proof command that exercises the
same changed files.
