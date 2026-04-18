# Browsing Routing Spec

Purpose: define the default browsing path now that Brave search, Firecrawl-backed fetch/render, and browser escalation are all live.

## Routing Order

- If the target URL is already known, go directly to retrieval. Do not search first just to search.
- Use `web_search` for discovery only when the target page or source is not already known.
- Use `web_fetch` first for simple public static pages, articles, docs, or other shallow pages.
- If fetch output is thin, shell-like, obviously client-rendered, or missing expected page content, switch to the Firecrawl-backed extraction/render path.
- Use browser only when the page needs clicks, expansion, pagination, login/session state, or render/fetch still fails.

## Static / shallow pages

- Prefer `web_fetch`.
- Do not escalate to browser first for trivial static or clearly public non-interactive pages.
- If the fetch output already contains the needed answer, summarize it and stop.

## JS-heavy rendered pages

- Do not conclude a page is empty from a thin fetch alone.
- If the page looks client-rendered or fetch returns only shell content, use the Firecrawl-backed extraction/render path.
- If Firecrawl-style extraction still does not expose the needed content, escalate to browser.

## Interactive / login / click paths

- Use browser when the task requires:
  - clicks
  - expansion
  - pagination
  - login or session state
  - multi-step rendered navigation
- Keep browser as escalation, not the default first move for simple public retrieval.

## Failure rules

- If one retrieval path is thin or wrong, try the next appropriate escalation path before concluding failure.
- Never report a JS-heavy page as empty unless rendered extraction or browser evidence also supports that conclusion.
- Do not read local `/app/skills/*.md` as part of ordinary web browsing unless the task explicitly asks for local skill docs or tool help.

## Anti-patterns to avoid

- Searching for a URL that is already known.
- Going browser-first on trivial static pages.
- Declaring a page empty from one thin fetch.
- Re-browsing the same page repeatedly after a useful extraction already exists.
- Reading local skill docs during ordinary public-page retrieval.

## Evidence / caching rule

- When a useful extraction is obtained, prefer summarizing or saving the result instead of re-browsing unnecessarily.
- Re-browse only when the first extraction is clearly incomplete, ambiguous, or stale relative to the task.
- In final reasoning, favor the strongest available evidence in this order:
  - direct rendered page evidence
  - successful Firecrawl/render extraction
  - successful plain fetch
  - search snippets

## Agent-facing short form

- Known URL: do not search first just to search.
- Discovery needed: use `web_search`.
- Simple public page: use `web_fetch`.
- Thin or client-rendered fetch: use Firecrawl-backed render/extraction.
- Clicks, pagination, login, or failed render path: use browser.
- Never call a JS-heavy page empty from thin fetch alone.
- Do not read local `/app/skills/*.md` during ordinary web browsing.
