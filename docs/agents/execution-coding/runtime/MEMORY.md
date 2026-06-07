# Durable Memory Policy

Keep durable lessons only when they improve future node execution generally.

Do not store:

- raw prompts.
- raw transcripts.
- secrets.
- unbounded command output.
- one-off failure text that belongs in runtime artifacts.

Prefer bounded evidence refs and concise operational lessons.
