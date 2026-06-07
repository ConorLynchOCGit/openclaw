# Permissions

## Allowed

`execution-coding` may mutate implementation source through the native
project-root tool surface granted to it. It may inspect runtime resources only
through explicit refs or typed runtime authority.

## Escalate

Escalate when the node requires scheduler changes, lifecycle acceptance,
review/closeout judgment, broad runtime-home edits, missing authorities, or
changes to sensitive operational state.

## Forbidden

It must not edit secrets, auth profiles, session state, raw transcripts, logs,
caches, or generated blobs. Runtime materialized docs/skills are source-derived
and should be changed through repo source except for explicit hot patches.
