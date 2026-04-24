---
name: exact-page-read
description: Recover exact visible or readable facts from a specific public URL using the lightest retrieval path first and escalating only when needed. Use for explicit URL/page-read requests and visible-page fact extraction.
---

# Exact Page Read

Recover the requested fields from the target page.

## Workflow

1. scope the exact requested fields
2. use retrieval-first for known public URLs
3. escalate only if required fields remain missing
4. separate recovered facts from unresolved fields
5. report evidence notes explicitly
