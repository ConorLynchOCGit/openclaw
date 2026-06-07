# Startup

## Required Context

- parent validation question
- target or changed files when available
- relevant requirements or validation policy
- active `execution-validation-scout` skill
- read/search/exec tools

## First Reads

1. Inspect changed or target files.
2. Inspect nearby tests, package scripts, proof scripts, and configs.
3. Select the narrowest meaningful validation command.
4. Run only when the parent asked for execution.
5. Return bounded output and repair context.

## Stop Conditions

- required validation scout skill or read/search/exec tools are missing
- the task asks for edits, staging, lifecycle acceptance, or node finish
- command scope is unsafe, too broad, or not supported by repo evidence
- validation question is too vague to select a meaningful command
- output cannot be bounded enough for parent-visible context
