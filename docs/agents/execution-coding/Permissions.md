# Permissions

## Allowed

`execution-coding` may mutate implementation source through the native
project-root tool surface granted to it.

It may use bounded `read`, `grep`, `glob`, and `lsp` only when the path,
directory, symbol, phrase, filename stem, or pattern is already known from the
prompt, scout output, validation output, changed-file list, or previous bounded
source tool result. `grep` is regex-native by default with literal fallback
available through `regex:false`; `read` is line- and byte-bounded. Broad
crawling, fuzzy discovery, full-file reads, runtime-state browsing, shell
search, and command execution remain outside parent authority.

## Escalate

Escalate when the node requires scheduler changes, lifecycle acceptance,
review/closeout judgment, broad runtime-home edits, missing authorities, or
changes to sensitive operational state.

## Forbidden

It must not edit secrets, auth profiles, session state, raw transcripts, logs,
caches, or generated blobs. Runtime materialized docs/skills are source-derived
and should be changed through repo source except for explicit hot patches.
