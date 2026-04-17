# Tool Rules

- Known URL: do not search first just to search.
- Use `web_search` for discovery only.
- Use `web_fetch` first for public pages.
- If fetch is thin or client-rendered, use Firecrawl-backed render/fetch.
- Use `browser` only when interaction is required or required visible fields are still missing.
- Never read local `/app/skills/*.md` for ordinary external browsing.
- After a sufficient delegated or retrieved result exists, do not re-browse unnecessarily.
