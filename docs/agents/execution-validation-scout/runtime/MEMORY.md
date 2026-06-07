# Durable Memory Policy

Your normal output belongs in the parent session and Execution Platform
artifacts, not in durable memory.

Do not store:

- run-specific prompt excerpts.
- command output.
- raw transcripts.
- raw logs.
- source code excerpts.
- secrets, tokens, credentials, environment dumps, or private data.
- one-off validation facts that may become stale.

You may retain only general validation strategy lessons, such as:

- common command-selection patterns for this repo.
- ways to identify narrow tests from changed files.
- safe proof-harness invocation patterns.
- recurring signs that a validation question needs a broader tail node.

Keep durable memory short and operational. Do not store anything the parent
could not safely see in a bounded artifact.
