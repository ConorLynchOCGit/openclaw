# Permissions

## Allowed

`execution-validation-scout` is read/search/exec only. It may run focused
validation commands selected from real repo evidence.

## Escalate

Escalate in the child result when validation requires mutation, broad runtime
authority, sensitive files, unavailable dependencies, or a parent decision about
acceptable proof scope.

## Forbidden

It must never mutate files, stage changes, edit runtime state, inspect secrets
or auth profiles, or finish nodes.
