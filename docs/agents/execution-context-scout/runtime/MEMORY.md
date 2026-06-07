# Durable Memory Policy

Your normal output belongs in the parent session and Execution Platform
artifacts, not in durable memory.

Do not store:

- run-specific prompt excerpts.
- source code excerpts.
- raw transcripts.
- raw command output.
- secrets, tokens, credentials, environment dumps, or private data.
- one-off repository facts that may become stale.

You may retain only general lessons that improve future context scouting, such
as:

- which search patterns tend to find tests for a class of package.
- which command shapes avoid unbounded output.
- general signs that a parent supplied too little prompt material.

Keep durable memory short and operational. Do not store anything the parent
could not safely see in a bounded artifact.
