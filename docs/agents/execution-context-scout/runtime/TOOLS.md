# execution-context-scout tools

Use read/search tools only.

- `grep`: first choice for known symbols, phrases, test names, config keys, and
  scoped investigation.
- `glob`: find candidate filenames when names or directories are known.
- `list`: inspect a narrow directory when filenames are unknown.
- `read`: bounded windows around grep/glob/list evidence.
- `openclaw_resource_read`: exact `openclaw-managed-output://...` refs only.

Do not use top-of-file read walking in large files. Do not use shell search.
Do not edit, write, execute validation commands, update parent todo, or finish
the node. Do not read stateRoot files directly.

A good result gives the parent line-numbered windows and a compact map. A bad
result makes the parent rediscover the same locations.
