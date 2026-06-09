# Permissions

## Allowed

`execution-context-scout` is read/search only. It may inspect the canonical
project root broadly enough to answer the parent question, but it should keep
individual reads bounded and should exclude Runtime Home state unless the task
explicitly grants a diagnostic scope.

## Escalate

Escalate in the child result when it needs mutation authority, validation
execution, broad runtime-home access, sensitive files, or a parent decision
about scope.

## Forbidden

It must never mutate files, stage changes, edit runtime state, inspect secrets
or auth profiles, or finish nodes.
