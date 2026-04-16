# Zero-Candidate Text Search Diagnostic

- Database mode: `full_corpus_proof_db`
- Database name: `model_memory`
- Similarity method: `normalized_search_text_jaccard`
- Sample size: `20`

## Summary

- Top-1 hit rate: 100.0%
- Top-5 hit rate: 100.0%
- Top-10 hit rate: 100.0%
- Median best acceptable rank: 1
- Median score gap (best acceptable minus top wrong): 0.19

### Source breakdown

- AGENTS.md: 10
- docs/help/testing.md: 7
- docs/gateway/configuration.md: 3

### Kind breakdown

- rule: 16
- fact: 4

## Caveats

- Diagnostic only. The search drops class, kind, scope, and decisive-field gates and therefore must not become merge authority.
- The 20-case sample is a manually adjudicated subset of current zero-candidate skips chosen because a legitimate prior match was visible on qualitative review.
- A hit means a legitimate prior object surfaced in the raw text ranking, not that deterministic attach would be safe without structural delta checks.

## Sample cases

### 7463df191ceb

- Case identity: `AGENTS.md::repository guidelines>agent-specific notes::rule_eabbb6f9bb488fd6e6bab059`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_1`
- Payload summary: Multi-agent safety: do not create/apply/drop git stash entries unless explicitly requested. | Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`).
- Manual rationale: Same git-stash safety rule with wrapper drift and minor phrasing variants.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.3864

Top results:

1. [acceptable] score=1 object=f740613e-6c42-5641-b118-19a3a7a5b2cf source=AGENTS.md kind=rule state=active
   - Multi-agent git stash safety | Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`).
2. [acceptable] score=0.8919 object=39716c81-23a4-554f-b92c-81d1a092ae96 source=AGENTS.md kind=rule state=active
   - Multi-agent safety for git stash | Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop `git stash` entries unless explicitly requested (this includes `git pull --rebase --autostash`).
3. [acceptable] score=0.7568 object=8b5d7b1d-95f0-55c9-9d2c-4545723af9e2 source=AGENTS.md kind=rule state=active
   - Multi-agent safety: do not create/modify git stash unless explicitly requested | If needed, keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`).
4. [acceptable] score=0.6667 object=2a55202d-21f9-5d64-8491-a40de6857ac8 source=AGENTS.md kind=rule state=active
   - Multi-agent safety: do not create/apply/drop git stash entries unless explicitly requested. | If explicitly requested, create/apply/drop git stash entries; otherwise keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop git stash entries unless explicitly requested.
5. [acceptable] score=0.6364 object=c707d4a6-1a53-54a7-98cf-d41d0099707d source=AGENTS.md kind=rule state=conflict_hold
   - Multi-agent safety: avoid git stash unless explicitly requested | If not explicitly requested, leave unrelated WIP and avoid cross-cutting state changes. | Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`). | Ability to avoid stash/worktree side effects when collaborating with other agents.
6. [wrong] score=0.6136 object=7321d38d-84cf-526a-b59f-973ebce0e5d5 source=AGENTS.md kind=rule state=active
   - Do not create/apply/drop git stash entries | Avoid creating/applying/dropping `git stash` entries (including `git pull --rebase --autostash`). | Avoid cross-cutting state changes; assume other agents may be working; keep unrelated WIP untouched. | Manage changes without relying on git stash when multiple agents may be active.
7. [wrong] score=0.5294 object=e482ffdf-8b0c-5adb-b053-0d005cb1515b source=AGENTS.md kind=rule state=active
   - Multi-agent safety: git stash | Do not create/apply/drop `git stash` entries unless explicitly requested (including `git pull --rebase --autostash`).
8. [wrong] score=0.3256 object=c5fb1e1c-acc2-54f6-93b4-16a9ecd4adaf source=AGENTS.md kind=rule state=active
   - Multi-agent git safety | Do not create/apply/drop git stash entries, create/apply/drop git worktree checkouts, modify .worktrees/\*, or switch/check out branches unless explicitly requested.
9. [wrong] score=0.3 object=60e6f231-0c29-5a75-8632-c4711d3beb7e source=AGENTS.md kind=rule state=active
   - Multi-agent safety: avoid git worktree changes unless explicitly requested | If not explicitly requested, do not alter git worktree checkouts or `.worktrees/*`. | Do not create/remove/modify `git worktree` checkouts (or edit `.worktrees/*`) unless explicitly requested. | Ability to avoid repository state changes that could conflict with other agents.
10. [wrong] score=0.1429 object=fb7a976e-d80f-5627-b78d-85a95b4844d3 source=AGENTS.md kind=rule state=active

- Plugin release fast path guard | For plugin releases (fast path), keep `openclaw` untouched. | Do not run core `openclaw` publish from the repo root unless explicitly requested.

### 1e37875d6e8f

- Case identity: `AGENTS.md::repository guidelines::rule_f67f93a93d02482c2704962b`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Chat replies: file references must be repo-root relative only | Use repo-root relative file references (e.g., extensions/bluebubbles/src/channel.ts:80). | Never use absolute paths or ~/... in chat reply file references.
- Manual rationale: Same repo-root-relative chat file-reference instruction.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.0714

Top results:

1. [acceptable] score=0.8571 object=f8780804-3a2e-55ba-aaef-366d3dd8efee source=AGENTS.md kind=rule state=active
   - In chat replies, file references must be repo-root relative only; never absolute paths or paths like ~/... | Use repo-root relative file references (e.g. extensions/bluebubbles/src/channel.ts:80). | Do not use absolute paths or ~/... in chat replies.
2. [acceptable] score=0.8519 object=28f04856-2992-5fed-a6a7-6969f131aa81 source=AGENTS.md kind=preference state=active
   - Chat reply file references | In chat replies, file references must be repo-root relative only (example: `extensions/bluebubbles/src/channel.ts:80`); never absolute paths or `~/...`. | Use repo-root relative paths for file references in chat replies.
3. [acceptable] score=0.8519 object=38e8f026-5f46-5da5-844c-c97d8e941fe2 source=AGENTS.md kind=preference state=active
   - GitHub chat file references | In GitHub chat replies, file references must be repo-root relative (no absolute paths or ~/...). | Use repo-root relative paths only, e.g. `extensions/bluebubbles/src/channel.ts:80`.
4. [acceptable] score=0.8462 object=de8384a6-d968-54ff-8d0c-28eeca75cee8 source=AGENTS.md kind=preference state=superseded
   - File references in chat replies | In chat replies, file references must be repo-root relative only; never absolute paths or `~/...`. | Use repo-root relative paths like `extensions/bluebubbles/src/channel.ts:80`.
5. [acceptable] score=0.8276 object=f8a9d7f3-b2e7-543b-be9b-28a05edee096 source=AGENTS.md kind=rule state=active
   - In chat replies, file references must be repo-root relative only; never use absolute paths or ~/... | Use repo-root relative paths only (e.g., extensions/bluebubbles/src/channel.ts:80). | Avoid absolute paths and paths starting with ~/...
6. [wrong] score=0.7857 object=89608ecc-9cda-5484-b2e8-02c5ffa6f507 source=AGENTS.md kind=rule state=active
   - In chat replies, file references must be repo-root relative only; never absolute paths or `~/...`. | Use repo-root relative paths like `extensions/bluebubbles/src/channel.ts:80` and avoid absolute paths or `~/...`.
7. [wrong] score=0.7692 object=26e8acab-21e3-54ac-bb1d-e6da5a152cdc source=AGENTS.md kind=preference state=active
   - File references in chat replies | Use repo-root relative file references only; never use absolute paths or ~/... | Example: `extensions/bluebubbles/src/channel.ts:80`
8. [wrong] score=0.7586 object=97e013f1-a5f7-5f06-bf53-6007f2c5bd68 source=AGENTS.md kind=rule state=active
   - In chat replies, file references must be repo-root relative only (example: `extensions/bluebubbles/src/channel.ts:80`); never absolute paths or `~/...`. | Use repo-root relative paths for file references in chat replies. | Do not use absolute paths or `~/...` in file references in chat replies.
9. [wrong] score=0.7333 object=6f3bd758-f3bc-5254-af43-8febef705597 source=AGENTS.md kind=rule state=active
   - When you reference files in chat replies, use repo-root relative paths only (e.g., extensions/bluebubbles/src/channel.ts:80); never use absolute paths or ~/... | Use repo-root relative file references only (like extensions/bluebubbles/src/channel.ts:80). | Never use absolute paths or ~/... in chat replies file references.
10. [wrong] score=0.7273 object=de446cfd-9c5e-5bab-a19c-a5e6fd218d7c source=AGENTS.md kind=rule state=active

- In chat replies, file references must be repo-root relative only (never absolute paths or ~/...). | Use repo-root relative paths in chat replies (e.g., `extensions/bluebubbles/src/channel.ts:80`) and avoid absolute paths or `~/...`. | Ability to convert a path to repo-root relative form.

### d88815843008

- Case identity: `AGENTS.md::repository guidelines::rule_83e2a6cb39432e4e63f350e1`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: GitHub issue/PR comments: real newlines only | Use literal multiline strings or -F - <<'EOF' (or $'...') for real newlines. | Never embed "\\n" in GitHub issue/PR comments.
- Manual rationale: Same GitHub comment newline footgun with very small wording drift.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1202

Top results:

1. [acceptable] score=0.7273 object=7c12dee6-283f-546a-9c02-fd09ad1c21bc source=AGENTS.md kind=rule state=active
   - GitHub issues/comments/PR comments string formatting | Use literal multiline strings or `-F - <<'EOF'` (or `$'...'`) for real newlines. | Never embed `"\\n"`.
2. [acceptable] score=0.7273 object=fcab991c-dcd4-5ec8-877c-e1a2bdab5085 source=AGENTS.md kind=rule state=active
   - GitHub issue/PR comment multiline strings | Use a literal multiline string or `-F - <<'EOF'` (or `$'...'`) for real newlines. | Never embed `"\\n"`.
3. [acceptable] score=0.7083 object=220bb2ff-d4ca-501b-b9c2-242a25ae3be1 source=AGENTS.md kind=rule state=active
   - For GitHub issues/comments/PR comments, use literal multiline strings or heredocs; never embed "\n". | Use literal multiline strings or -F - <<'EOF' (or $'...') so real newlines are preserved. | Never embed "\\n" in GitHub issues/comments/PR comments.
4. [acceptable] score=0.6667 object=8d0abbb3-c745-5aaf-b749-cb81b117e83d source=AGENTS.md kind=rule state=active
   - For GitHub issues/comments/PR comments with real newlines, use literal multiline strings or heredocs; never embed \n | Use literal multiline strings or -F - <<'EOF' (or $'...') for real newlines. | Do not embed "\\n".
5. [acceptable] score=0.6667 object=fe46b3a8-a367-5d62-87bd-daf7c49cbf5b source=AGENTS.md kind=rule state=active
   - When writing GitHub PR/issue comment bodies with real newlines | Use literal multiline strings or `-F - <<'EOF'` (or $'...') for real newlines; never embed `"\\n"` for newlines.
6. [wrong] score=0.6071 object=81b18201-cbd1-5368-8ed0-0a9ce072545d source=AGENTS.md kind=rule state=active
   - GitHub issue/PR comment newlines | When sending GitHub issues/comments/PR comments with real newlines, use literal multiline strings or a single-quoted heredoc (`-F - <<'EOF'`, or `$'...'` for newlines). | Never embed `"\\n"`.
7. [wrong] score=0.5769 object=17db47a7-4580-5033-b059-44f3a1c62197 source=AGENTS.md kind=rule state=active
   - GitHub issue/PR comment newlines | Use literal multiline strings or single-quoted heredocs (`<<'EOF'`) / `$'...'` for real newlines. | Do not embed `\n` in GitHub comment bodies.
8. [wrong] score=0.5714 object=cbf5cd3e-0fc5-5ea4-9b02-9ae27a4d29f4 source=AGENTS.md kind=rule state=active
   - For GitHub PR/issue comment bodies with real newlines, use literal multiline strings or heredocs; never embed "\\n". | Use literal multiline strings or heredocs like `-F - <<'EOF'` (or `$'...'`) for real newlines; avoid embedding `\\n` escape sequences.
9. [wrong] score=0.5484 object=7e6b772d-7667-5657-9d85-75d4058cf23b source=AGENTS.md kind=rule state=active
   - For GitHub PR/issue comment bodies that need real newlines, use literal multiline strings or a single-quoted heredoc (<<'EOF'); never embed \n. | Use literal multiline strings or a single-quoted heredoc (e.g. -F - <<'EOF', or $'...') for real newlines. | Do not embed "\\n" for newlines in GitHub comment bodies.
10. [wrong] score=0.5484 object=82e1b2cb-4665-57fe-b818-ef5456fb6b26 source=AGENTS.md kind=rule state=active

- When writing GitHub issues/comments/PR comments, use literal multiline strings or heredocs for real newlines; never embed `\n` as a string. | Use literal multiline strings or `-F - <<'EOF'` (or `$'...'`) so newlines are real. | Never embed `"\\n"` in the comment body.

### 40af26b1abcd

- Case identity: `AGENTS.md::repository guidelines::rule_43ab90f9752c4c91c241ebfb`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: GitHub comment footgun: avoid gh ... -b "..." with backticks/shell chars | Use single-quoted heredoc (-F - <<'EOF') when composing GitHub comments via gh. | Do not use gh issue/pr comment -b "..." when the body contains backticks or shell chars.
- Manual rationale: Same gh comment heredoc rule with shell-char wording variants.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.0609

Top results:

1. [acceptable] score=0.625 object=9b224f6a-de22-599d-8547-b5e954b06480 source=AGENTS.md kind=rule state=active
   - GitHub CLI comment body escaping | When body contains backticks or shell chars, use single-quoted heredocs (`-F - <<'EOF'`). | Avoid the `gh issue/pr comment -b "..."` pattern when body contains backticks or shell chars.
2. [acceptable] score=0.6176 object=325ee2ee-61b5-5039-bcfb-8a883ee50dd8 source=AGENTS.md kind=rule state=active
   - gh issue/pr comment -b usage with shell/backticks | Use a single-quoted heredoc (`-F - <<'EOF'`) to avoid escaping corruption. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
3. [acceptable] score=0.5758 object=098ba11a-a3ff-5396-b0a8-f85288f251ef source=AGENTS.md kind=rule state=active
   - GitHub PR/issue comment command usage | When using `gh issue/pr comment`, prefer single-quoted heredoc (`-F - <<'EOF'`). | Never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars.
4. [acceptable] score=0.575 object=a0f4ac61-b957-59b3-b9e6-7c9783dc9f3b source=AGENTS.md kind=rule state=active
   - Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars; always use single-quoted heredoc (`-F - <<'EOF'`) so no command substitution/escaping corruption occurs. | Use single-quoted heredoc (`-F - <<'EOF'`) for GitHub comment bodies containing backticks/shell chars. | Do not use `gh issue/pr comment -b "..."` with bodies containing backticks or shell chars.
5. [acceptable] score=0.5676 object=4872b6d9-a9e3-55a3-bebc-9d80c34fa59d source=AGENTS.md kind=rule state=active
   - When using `gh issue/pr comment -b "..."` for GitHub comment bodies | Always use a single-quoted heredoc (`-F - <<'EOF'`) to avoid escaping corruption. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
6. [wrong] score=0.5641 object=89ac9a48-06f7-55cb-97a9-1074f4d29a19 source=AGENTS.md kind=rule state=active
   - When creating GitHub comments, avoid gh issue/pr comment -b "..." if the body contains backticks or shell chars; use a single-quoted heredoc instead. | Always use single-quoted heredoc (-F - <<'EOF') to prevent escaping/command issues. | Never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars.
7. [wrong] score=0.5526 object=57de52c3-3e7d-5c80-87a5-5a1dacaec8b5 source=AGENTS.md kind=rule state=active
   - When commenting via gh, avoid `-b "..."` if the body contains backticks or shell chars; always use a single-quoted heredoc. | Use `-F - <<'EOF'` (single-quoted heredoc) to prevent escaping/command substitution corruption. | Avoid `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
8. [wrong] score=0.5366 object=7ec4a437-cc46-5732-a719-2499ff37e5c7 source=AGENTS.md kind=rule state=active
   - Avoid using `gh issue/pr comment -b "..."` when the body contains backticks or shell chars; prefer a single-quoted heredoc to prevent escaping/corruption. | Use single-quoted heredoc (`-F - <<'EOF'`) for such bodies. | Do not use `gh issue/pr comment -b "..."` in these cases.
9. [wrong] score=0.5263 object=aa1b3012-fddb-5401-bdb3-382c866e6d5c source=AGENTS.md kind=rule state=active
   - GitHub comment command -b usage with backticks/shell chars | Use single-quoted heredocs (`-F - <<'EOF'`) so no command substitution/escaping corruption occurs. | Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars.
10. [wrong] score=0.5135 object=62f58e88-4719-5bfa-b558-f6f28b9eb76b source=AGENTS.md kind=rule state=active

- Never use `gh issue/pr comment -b "..."` when the body contains backticks or shell chars; always use single-quoted heredoc. | When the comment body contains backticks or shell chars, use single-quoted heredoc form `-F - <<'EOF'` to prevent escaping/command-substitution corruption.

### 480854e886b0

- Case identity: `AGENTS.md::repository guidelines::rule_2e678dfb95e76f7e7e10631b`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: GitHub issue/PR refs: don’t wrap in backticks for auto-linking | Use plain #24643 (optionally add full URL) when you want auto-linking. | Do not wrap issue/PR refs like #24643 in backticks when you want auto-linking.
- Manual rationale: Same GitHub auto-linking rule for issue and PR refs.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1592

Top results:

1. [acceptable] score=0.9259 object=62d8fe25-f2b0-5ad9-9148-da726ceb4b43 source=AGENTS.md kind=rule state=active
   - GitHub linking: don’t wrap issue/PR refs like `#24643` in backticks when you want auto-linking. | Use plain `#24643` (optionally add full URL) for auto-linking. | Do not wrap issue/PR refs like `#24643` in backticks when auto-linking is desired.
2. [acceptable] score=0.8519 object=ec7d26dc-5aa2-5574-a49c-90e2037bf2c3 source=AGENTS.md kind=rule state=active
   - GitHub issue/PR reference formatting for auto-linking | Use plain `#24643` (optionally add full URL). | Don’t wrap issue/PR refs like `#24643` in backticks when you want auto-linking.
3. [acceptable] score=0.8462 object=bc3ea28d-b76f-50ad-94d4-af79a4316bc7 source=AGENTS.md kind=rule state=active
   - GitHub issue/PR auto-linking | Use plain `#24643` (optionally add the full URL) when you want auto-linking. | Do not wrap issue/PR refs like `#24643` in backticks when you want auto-linking.
4. [acceptable] score=0.8214 object=9d542ccd-9029-56b8-af6d-a1c922d212ce source=AGENTS.md kind=rule state=active
   - When referencing GitHub issues/PRs for auto-linking | Use plain `#24643` (optionally add full URL). | Do not wrap issue/PR refs like `#24643` in backticks when you want auto-linking.
5. [acceptable] score=0.7931 object=6309a792-60eb-5094-a562-f9003738b761 source=AGENTS.md kind=rule state=active
   - When linking GitHub issue/PR references, do not wrap refs like #24643 in backticks when you want auto-linking | Use plain #24643 (optionally add a full URL) for auto-linking. | Avoid wrapping issue/PR refs like `#24643` in backticks when you want auto-linking.
6. [wrong] score=0.7667 object=5199b109-1189-57f8-adf3-197c7e32d4c6 source=AGENTS.md kind=rule state=active
   - GitHub linking: don’t wrap issue/PR refs like `#24643` in backticks when you want auto-linking. | Use plain `#24643` (optionally include the full URL). | Do not wrap `#...` issue/PR references in backticks when relying on auto-linking.
7. [wrong] score=0.7407 object=d5eb0be9-e772-546e-9468-a45789f30035 source=AGENTS.md kind=rule state=active
   - Auto-linking issue/PR references | Use plain `#24643` (optionally a full URL) when you want GitHub auto-linking. | Do not wrap issue/PR references like `#24643` in backticks.
8. [wrong] score=0.7333 object=705e9c6b-6dd2-5d62-8d69-4083930bfeef source=AGENTS.md kind=rule state=conflict_hold
   - GitHub issue/PR auto-linking | Use plain `#24643` (optionally add full URL) instead of wrapping the ref in backticks. | Do not wrap refs like `#24643` in backticks when you want auto-linking.
9. [wrong] score=0.7097 object=32e876ed-df79-54fa-87de-1486f3f5b9db source=AGENTS.md kind=rule state=active
   - When linking issue/PR references, do not wrap #NNNN in backticks for auto-linking; use plain #NNNN (or a full URL). | Use plain #NNNN (optionally add a full URL) to enable auto-linking. | Do not wrap issue/PR refs like `#24643` in backticks when you want auto-linking.
10. [wrong] score=0.6774 object=22f8a182-c838-505a-a81e-cd7f0fbd4e56 source=AGENTS.md kind=rule state=active

- When linking GitHub issue/PR refs, don't wrap refs like `#24643` in backticks when you want auto-linking. | Use plain `#24643` (optionally include full URL) instead of wrapping the ref in backticks.

### 229ff7921526

- Case identity: `AGENTS.md::repository guidelines::rule_282aef84b05161eb6568bda9`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Security triage: read SECURITY.md before severity decisions | Before triage/severity decisions, read SECURITY.md to align with OpenClaw's trust model and design boundaries.
- Manual rationale: Same SECURITY.md-before-triage rule.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.0944

Top results:

1. [acceptable] score=0.9444 object=97271931-6cbd-58b2-87a6-680f14d491d0 source=AGENTS.md kind=rule state=active
   - Before triage/severity decisions, read `SECURITY.md` to align with OpenClaw's trust model and design boundaries. | Read `SECURITY.md` before making triage/severity decisions.
2. [acceptable] score=0.8947 object=06afd31c-34d2-5a01-b023-63fb9a8f2f93 source=AGENTS.md kind=rule state=active
   - Security advisory triage alignment | Before triage/severity decisions, read `SECURITY.md` to align with OpenClaw's trust model and design boundaries.
3. [acceptable] score=0.8947 object=273ff03b-4847-5720-bc37-ea038a67a0e0 source=AGENTS.md kind=fact state=active
   - Security advisory analysis: Before triage/severity decisions, read `SECURITY.md` to align with OpenClaw’s trust model and design boundaries.
4. [acceptable] score=0.8947 object=4192b3b6-5337-5f4c-9b90-32653c342c9b source=AGENTS.md kind=rule state=active
   - For security advisory triage/severity decisions, read `SECURITY.md` to align with OpenClaw’s trust model and design boundaries. | Before triage/severity decisions, read `SECURITY.md`.
5. [acceptable] score=0.8947 object=cb3fe85b-392e-5e94-b9ba-0875774b7f03 source=AGENTS.md kind=rule state=active
   - Security advisory analysis | Before triage/severity decisions, read `SECURITY.md` to align with OpenClaw's trust model and design boundaries.
6. [wrong] score=0.85 object=78b1924e-bdc6-534b-a9ab-cb77b080c8e7 source=AGENTS.md kind=preference state=active
   - Security triage prep | Before security triage/severity decisions, read `SECURITY.md` to align with OpenClaw's trust model and design boundaries. | Consult `SECURITY.md` prior to triage/severity decisions.
7. [wrong] score=0.8333 object=65b907e8-2481-5219-b927-590352de939c source=AGENTS.md kind=rule state=active
   - Before security triage/severity decisions, read SECURITY.md to align with trust model and design boundaries. | Read `SECURITY.md` before making triage/severity decisions.
8. [wrong] score=0.7391 object=e353b0ed-d219-5c6a-97a5-df2dfe5eefa8 source=AGENTS.md kind=rule state=active
   - Before triage/severity decisions for security advisories, read SECURITY.md to align with OpenClaw's trust model and design boundaries. | Read SECURITY.md before making triage/severity decisions for security advisories. | Access and review SECURITY.md to align with the trust model and design boundaries.
9. [wrong] score=0.6818 object=c6d2bb97-b6e1-5b1c-94f8-02fde2ae57c3 source=AGENTS.md kind=rule state=active
   - Before triage/severity decisions for security advisories, read SECURITY.md to align with trust model and design boundaries | Read SECURITY.md before triage/severity decisions. | Avoid skipping SECURITY.md review before triage/severity decisions for security advisories.
10. [wrong] score=0.68 object=047a87cd-8b90-58f9-ab6c-4b8c5b25eade source=AGENTS.md kind=rule state=active

- Before triage/severity decisions for security advisories, read `SECURITY.md` to align with OpenClaw's trust model and design boundaries. | Read `SECURITY.md` before making triage/severity decisions. | Do not make triage/severity decisions without aligning to `SECURITY.md`.

### 700ab3d514a7

- Case identity: `AGENTS.md::repository guidelines>docs linking (mintlify)::rule_dddba40ed323f7cd8f8d0a8f`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Docs internal links: root-relative paths and no .md/.mdx extensions | In internal doc links in docs/**/\*.md, use root-relative paths with no .md/.mdx extensions (e.g., [Config](/configuration)). | Do not use .md or .mdx extensions in internal doc links under docs/**/\*.md.
- Manual rationale: Same Mintlify internal-link formatting rule.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1175

Top results:

1. [acceptable] score=0.68 object=8774f6cc-4d0f-5455-bfd4-486b66c07ced source=AGENTS.md kind=rule state=active
   - Internal doc links (Mintlify) | In internal doc links in `docs/**/*.md`, use root-relative paths and no `.md`/`.mdx` (example: `[Config](/configuration)`). | Do not use `.md`/`.mdx` in internal doc links.
2. [acceptable] score=0.6667 object=b31cbadb-852a-5653-93d0-aca2cd6f38bf source=AGENTS.md kind=rule state=active
   - Internal doc links in docs/\*_/_.md must be root-relative and must not include .md/.mdx extensions. | Use root-relative links without `.md`/`.mdx` extensions (e.g. `[Config](/configuration)`). | Do not include `.md`/`.mdx` extensions in internal doc links.
3. [acceptable] score=0.6429 object=f2db1527-c9ad-56a7-b8d3-eae4a20a5410 source=AGENTS.md kind=rule state=active
   - Internal doc links (Mintlify) in docs/**/\*.md | Use root-relative links in `docs/**/_.md`with no`.md`/`.mdx`extension (example:`[Config](/configuration)`). | Do not use non-root-relative links or include `.md`/`.mdx`extensions in internal doc links in`docs/\*\*/_.md`.
4. [acceptable] score=0.6207 object=4fbc43af-3b1c-5916-9eb2-61282cb50078 source=AGENTS.md kind=rule state=active
   - Internal doc links in docs/\*_/_.md must be root-relative with no .md/.mdx extension | Use root-relative links without `.md`/`.mdx` extensions (e.g., [Config](/configuration)). | Avoid including `.md` or `.mdx` extensions in internal doc links.
5. [acceptable] score=0.6207 object=ab55df8b-dd5b-51fb-9e27-a3d9e79690e9 source=AGENTS.md kind=rule state=conflict_hold
   - Internal doc links in `docs/**/*.md` must be root-relative, with no `.md`/`.mdx` (example: `[Config](/configuration)`). | Use root-relative paths without `.md`/`.mdx` extensions for internal `docs/**/*.md` links. | Do not include `.md`/`.mdx` extensions in internal links in `docs/**/*.md`.
6. [wrong] score=0.5625 object=25148d4a-64a9-5b38-98d2-bb92ca871e06 source=AGENTS.md kind=rule state=active
   - Docs internal links in docs/\*_/_.md must be root-relative and omit .md/.mdx extensions | Use root-relative links and avoid .md/.mdx in link targets (example: `[Config](/configuration)`). | Do not use relative paths that include `.md` or `.mdx` extensions in internal doc links.
7. [wrong] score=0.56 object=013e1386-4d0c-5c94-a085-df103b5fde12 source=AGENTS.md kind=rule state=active
   - Internal doc links in docs/**/\*.md | Use root-relative internal doc links in `docs/**/\*.md`and omit`.md`/`.mdx`extensions. | Do not include`.md`/`.mdx` extensions in internal doc links.
8. [wrong] score=0.5556 object=7ca83700-38f1-504b-80f9-2f69b980c7a9 source=AGENTS.md kind=rule state=conflict_hold
   - Docs internal links in docs/\*_/_.md | Use root-relative internal links and omit `.md`/`.mdx` extensions. | Do not include `.md` or `.mdx` extensions in internal doc links; internal links must be root-relative.
9. [wrong] score=0.5385 object=d305e7c3-e0e9-5ba0-8c73-654e3dafe0f1 source=AGENTS.md kind=rule state=active
   - Mintlify internal doc links in `docs/**/*.md` | Use root-relative paths without `.md`/`.mdx` extensions (example: `[Config](/configuration)`).
10. [wrong] score=0.5135 object=471a55cb-2f47-59b5-9bd4-991753ddf168 source=AGENTS.md kind=rule state=conflict_hold

- In `docs/**/*.md` Mintlify internal doc links, use root-relative paths with no `.md`/`.mdx` extension (example: `[Config](/configuration)`). | When linking internally in `docs/**/*.md`, use root-relative paths and omit `.md`/`.mdx` extensions (e.g., `[Config](/configuration)`). | Ability to format Mintlify internal documentation links according to repo conventions.

### a226c604cd03

- Case identity: `AGENTS.md::repository guidelines>docs i18n (zh-cn)::rule_565a38e86b5a10702df6d642`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Docs i18n: don’t edit docs/zh-CN/** unless explicitly asked; edit English then run docs-i18n pipeline | Edit English docs, then adjust glossary (docs/.i18n/glossary.zh-CN.json), run scripts/docs-i18n, and apply targeted fixes only if instructed. | Do not edit docs/zh-CN/** directly unless the user explicitly asks.
- Manual rationale: Same docs i18n pipeline rule with minor wrapper differences.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.5455

Top results:

1. [acceptable] score=0.8182 object=47f4a8d0-cdc2-54dc-ad85-25151cbe48e7 source=AGENTS.md kind=rule state=active
   - Do not edit docs/zh-CN/** unless the user explicitly asks; update English docs first and then run the docs-i18n pipeline. | Update English docs first, adjust glossary (`docs/.i18n/glossary.zh-CN.json`), run `scripts/docs-i18n`, then apply targeted fixes only if instructed. | Do not edit `docs/zh-CN/**` unless the user explicitly asks.
2. [acceptable] score=0.7647 object=a372b39f-fda2-57c7-b7d2-73cd93c0ee5a source=AGENTS.md kind=rule state=active
   - Do not edit docs/zh-CN/** unless the user explicitly asks; update English docs → adjust glossary → run scripts/docs-i18n → apply targeted fixes only if instructed. | If updating zh-CN docs, follow the pipeline: update English docs, adjust glossary (`docs/.i18n/glossary.zh-CN.json`), run `scripts/docs-i18n`, then apply targeted fixes only if instructed. | Do not edit `docs/zh-CN/**` unless the user explicitly asks.
3. [acceptable] score=0.7143 object=47a30382-5eb9-5383-8e6b-6e2302cd62df source=AGENTS.md kind=rule state=active
   - Editing generated docs i18n (zh-CN) | Update English docs first, adjust glossary (`docs/.i18n/glossary.zh-CN.json`), run `scripts/docs-i18n`, and apply targeted fixes only if instructed. | Do not edit `docs/zh-CN/**` unless the user explicitly asks.
4. [acceptable] score=0.3824 object=01fa971c-a1ca-5c0b-b3f0-0a2e192b1d83 source=AGENTS.md kind=rule state=active
   - Do not edit generated docs/zh-CN/** unless explicitly asked | Leave `docs/zh-CN/**`unchanged unless the user explicitly asks. | Do not edit`docs/zh-CN/\*\*` unless explicitly instructed.
5. [acceptable] score=0.3235 object=da3490ab-35cd-53ea-ac39-85715fe07fa1 source=AGENTS.md kind=rule state=active
   - Editing generated Chinese docs | Do not edit `docs/zh-CN/**` unless the user explicitly asks.
6. [wrong] score=0.2727 object=7c6bbef1-cf8a-56aa-a639-8f54bda7e6ad source=AGENTS.md kind=rule state=conflict_hold
   - `docs/zh-CN/**` is generated; do not edit unless the user explicitly asks. | Do not edit files under `docs/zh-CN/**` unless the user explicitly requests it. | Ability to distinguish generated documentation files and comply with edit restrictions.
7. [wrong] score=0.1404 object=d55f5214-d561-5531-a0e1-c72c98ced7c7 source=AGENTS.md kind=rule state=conflict_hold
   - GitHub searching with gh | Don’t limit to the first 500 results; keep going until the last page unless instructed to look only at the most recent. | Do not cap search at the first 500 issues or PRs when wanting to search all.
8. [wrong] score=0.14 object=2a55202d-21f9-5d64-8491-a40de6857ac8 source=AGENTS.md kind=rule state=active
   - Multi-agent safety: do not create/apply/drop git stash entries unless explicitly requested. | If explicitly requested, create/apply/drop git stash entries; otherwise keep unrelated WIP untouched and avoid cross-cutting state changes. | Do not create/apply/drop git stash entries unless explicitly requested.
9. [wrong] score=0.1333 object=323cce93-9068-5609-9b4b-5392742f3064 source=AGENTS.md kind=fact state=active
   - Plugin dependency placement: Keep plugin-only deps in the extension package.json; do not add them to the root package.json unless core uses them.
10. [wrong] score=0.1333 object=4f65f98b-f492-5aad-8594-1defdbadb8ea source=AGENTS.md kind=rule state=active

- Keep plugin-only deps in the extension package.json; do not add them to root package.json unless core uses them | Put plugin-only dependencies in the extension `package.json`. | Do not add plugin-only deps to the root `package.json` unless core uses them.

### d9dfbfc1ee50

- Case identity: `AGENTS.md::repository guidelines>coding style & naming conventions::rule_34c67c9d0913f7e0c68cb2b4`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: After refactors affecting lazy-loading/module boundaries: run build and check INEFFECTIVE_DYNAMIC_IMPORT | After refactors that touch lazy-loading/module boundaries, run pnpm build and check for [INEFFECTIVE_DYNAMIC_IMPORT] warnings before submitting.
- Manual rationale: Same post-build dynamic-import warning check rule.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.5826

Top results:

1. [acceptable] score=0.7826 object=03bcf0f1-c316-508f-9a41-54dc6ff157d8 source=AGENTS.md kind=rule state=active
   - Dynamic import verification after refactors | After refactors touching lazy-loading/module boundaries, run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings before submitting.
2. [acceptable] score=0.6667 object=1f7250e3-364a-58da-a05b-eb775d4c8a25 source=AGENTS.md kind=rule state=active
   - After refactors touching lazy-loading/module boundaries, verify dynamic imports by running `pnpm build` and checking for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings. | Run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings before submitting.
3. [wrong] score=0.2 object=30505f7c-f81c-502f-be87-e8090178fbcd source=docs/help/testing.md kind=rule state=active
   - Default test gate before push | Run `pnpm build && pnpm check && pnpm test` before push.
4. [wrong] score=0.1724 object=cc0e6736-f8f9-5e74-8f6c-80a9d2897f63 source=docs/help/testing.md kind=rule state=active
   - Default full test gate | Run `pnpm build && pnpm check && pnpm test` as the expected-before-push full gate.
5. [wrong] score=0.1667 object=3d628807-8c9e-52b6-b46c-3eb25a9eb260 source=docs/help/testing.md kind=rule state=active
   - Expected before-push testing workflow | Run the full gate (pnpm build && pnpm check && pnpm test) as the expected before-push testing workflow.
6. [wrong] score=0.1613 object=571675ba-16a8-5c60-9e8c-b10bc6db9bb0 source=docs/help/testing.md kind=fact state=active
   - Testing gate command: Most days: run the full gate before push as `pnpm build && pnpm check && pnpm test`.
7. [wrong] score=0.1591 object=0d927ceb-f130-5f58-90df-9d6fffbcd9b1 source=AGENTS.md kind=reference state=active
   - Before tagging/publishing, run node --import tsx scripts/release-check.ts, pnpm release:check, and pnpm test:install:smoke (or set OPENCLAW_INSTALL_SMOKE_SKIP_NONROOT=1 for non-root). | c4a70d60-9373-5b7b-b76a-ad0e7bd14ffb
8. [wrong] score=0.1458 object=04f8b22f-87ce-54da-8fac-703629e650d1 source=AGENTS.md kind=rule state=active
   - In production code paths, do not mix await import("x") with static import ... from "x" for the same module; use a dedicated _.runtime.ts boundary for lazy loading. | If you need lazy loading, create a dedicated `_.runtime.ts`boundary and dynamically import that boundary from lazy callers only. | Do not mix`await import("x")`and static`import ... from "x"` for the same module in production code paths.
9. [wrong] score=0.1429 object=88b9738d-4688-5fd8-b192-e1b2bfc5b85c source=docs/help/testing.md kind=preference state=active
   - Default full gate before push | Use `pnpm build && pnpm check && pnpm test` before pushing. | default full gate before push
10. [wrong] score=0.1429 object=c71bb912-93b9-5518-8a13-ff981c2fcd68 source=AGENTS.md kind=rule state=active

- In production code paths, don’t mix await import("x") and static import ... from "x" for the same module; use a dedicated _.runtime.ts boundary for lazy loading. | If you need lazy loading, create a dedicated `_.runtime.ts`boundary and dynamically import that boundary from lazy callers only. | Avoid mixing`await import("x")`and static`import ... from "x"` for the same module in production code paths.

### 418dd7015a19

- Case identity: `AGENTS.md::repository guidelines>coding style & naming conventions::rule_5b79eb6877949ef825171a6d`
- Source: `AGENTS.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Dynamic import guardrail: avoid mixing await import and static import for same module | If you need lazy loading, create a dedicated \*.runtime.ts boundary (that re-exports from x) and dynamically import that boundary from lazy callers only. | Do not mix await import("x") and static import ... from "x" for the same module in production code paths.
- Manual rationale: Same dynamic import guardrail against mixing lazy and static imports.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.6545

Top results:

1. [acceptable] score=0.8 object=04f8b22f-87ce-54da-8fac-703629e650d1 source=AGENTS.md kind=rule state=active
   - In production code paths, do not mix await import("x") with static import ... from "x" for the same module; use a dedicated _.runtime.ts boundary for lazy loading. | If you need lazy loading, create a dedicated `_.runtime.ts`boundary and dynamically import that boundary from lazy callers only. | Do not mix`await import("x")`and static`import ... from "x"` for the same module in production code paths.
2. [acceptable] score=0.7805 object=c71bb912-93b9-5518-8a13-ff981c2fcd68 source=AGENTS.md kind=rule state=active
   - In production code paths, don’t mix await import("x") and static import ... from "x" for the same module; use a dedicated _.runtime.ts boundary for lazy loading. | If you need lazy loading, create a dedicated `_.runtime.ts`boundary and dynamically import that boundary from lazy callers only. | Avoid mixing`await import("x")`and static`import ... from "x"` for the same module in production code paths.
3. [acceptable] score=0.7333 object=479d80cc-53a1-57b0-8c76-30b34a88205c source=AGENTS.md kind=rule state=active
   - In production code paths, don't mix await import("x") and static import ... from "x" for the same module when lazy-loading; use a dedicated _.runtime.ts boundary imported by lazy callers only. | If you need lazy loading, create a dedicated `_.runtime.ts`boundary (re-exporting from`x`) and dynamically import that boundary from lazy callers only. | Do not mix `await import("x")`and static`import ... from "x"` for the same module in production code paths.
4. [wrong] score=0.1455 object=2570ec45-a739-5166-b8f5-6c8105ccbdf4 source=docs/gateway/configuration.md kind=rule state=active
   - Environment variable sources for OpenClaw | If present, read env vars from the parent process plus `.env` in the current working directory and `~/.openclaw/.env`, and do not override existing env vars from those sources.
5. [wrong] score=0.1406 object=53f612d5-ca36-51a3-9a4a-b4df961bdacc source=docs/gateway/configuration.md kind=rule state=active
   - Use `config.patch` instead of `config.apply` for partial updates | Use `config.patch` for partial updates (or `openclaw config set` for single keys) instead of `config.apply`. | Do not use `config.apply` when you only need to update part of the configuration, since it replaces the entire config and restarts the Gateway in one step.
6. [wrong] score=0.1373 object=03bcf0f1-c316-508f-9a41-54dc6ff157d8 source=AGENTS.md kind=rule state=active
   - Dynamic import verification after refactors | After refactors touching lazy-loading/module boundaries, run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings before submitting.
7. [wrong] score=0.1333 object=879dc3ed-e285-58e2-b4ba-93df923f128f source=AGENTS.md kind=rule state=active
   - High-confidence-only answers | Verify in code and respond with high-confidence answers only. | Do not guess.
8. [wrong] score=0.1273 object=1f7250e3-364a-58da-a05b-eb775d4c8a25 source=AGENTS.md kind=rule state=active
   - After refactors touching lazy-loading/module boundaries, verify dynamic imports by running `pnpm build` and checking for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings. | Run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings before submitting.
9. [wrong] score=0.1268 object=9adecfc2-874c-5a08-93cd-82a0fbf59a33 source=docs/gateway/configuration.md kind=rule state=active
   - Behavior of `config.apply` vs `config.patch` (and CLI alternatives) | Use `config.patch` for partial updates, or use `openclaw config set` for single keys; use `config.apply` only when you intend to replace the entire config. | Do not use `config.apply` when you only need a partial update, since it replaces the entire config. | Ability to choose the correct RPC/command for full replacement vs partial or single-key updates.
10. [wrong] score=0.1268 object=c861e46e-c91f-5f1e-a146-b454738d6043 source=docs/help/testing.md kind=rule state=conflict_hold

- Node 24+ VM forks fallback | On Node 24+, rely on OpenClaw’s automatic fallback from Vitest `vmForks` to regular `forks` to avoid `ERR_VM_MODULE_LINK_FAILURE` / module linking errors. | Do not assume `vmForks` will always be used on Node 24+; override only when needed. | If you need to override, set `OPENCLAW_TEST_VM_FORKS=0` (force `forks`) or `OPENCLAW_TEST_VM_FORKS=1` (force `vmForks`).

### aadce2289ad1

- Case identity: `docs/help/testing.md::testing>test suites (what runs where)>e2e (gateway smoke)::fact_78d43f721f3e7e7cf8832e3c`
- Source: `docs/help/testing.md`
- Kind: `fact`
- Trace pass: `rerun_1`
- Payload summary: E2E suite command, runtime defaults, and overrides: The E2E suite (`pnpm test:e2e`) uses `vitest.e2e.config.ts` and `src/**/*.e2e.test.ts`, uses `vmForks` for faster file startup, adaptive workers (CI: 2-4, local: 4-8), runs in silent mode by default; it can be overridden with `OPENCLAW_E2E_WORKERS` and `OPENCLAW_E2E_VERBOSE=1`.
- Manual rationale: Same E2E suite command/config/workers claim.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.3857

Top results:

1. [acceptable] score=0.619 object=91e727ef-0d5b-552f-8752-91cda839ef94 source=docs/help/testing.md kind=fact state=conflict_hold
   - E2E suite command/config/workers: E2E suite uses `pnpm test:e2e` with config `vitest.e2e.config.ts`, runs `src/**/*.e2e.test.ts`, defaults to silent mode, and uses adaptive workers (CI 2-4, local 4-8) with overrides `OPENCLAW_E2E_WORKERS` and `OPENCLAW_E2E_VERBOSE`.
2. [acceptable] score=0.5778 object=449a9afd-1a22-513e-a35d-77d0b826dd7d source=docs/help/testing.md kind=fact state=active
   - E2E (gateway smoke) test suite runtime defaults: E2E gateway smoke runs with `pnpm test:e2e` using `vitest.e2e.config.ts`; defaults to Vitest `vmForks`, uses adaptive workers (CI: 2-4, local: 4-8), and runs in silent mode by default.
3. [acceptable] score=0.5102 object=d7a4c2a7-325c-5ad5-b8d2-86e78f1a0955 source=docs/help/testing.md kind=rule state=active
   - E2E gateway smoke suite | Run `pnpm test:e2e` for the E2E gateway smoke suite. | Use adaptive workers (CI 2-4, local 4-8) and note it runs in silent mode by default; override with `OPENCLAW_E2E_WORKERS=<n>` or `OPENCLAW_E2E_VERBOSE=1`.
4. [acceptable] score=0.3958 object=c1656377-8e01-5543-a559-f863b625e32b source=docs/help/testing.md kind=fact state=active
   - E2E suite command and config: E2E suite command is `pnpm test:e2e`, using `vitest.e2e.config.ts`, running `src/**/*.e2e.test.ts`, and running in silent mode by default; it supports overrides for worker count and verbose output.
5. [wrong] score=0.2333 object=b68ec78b-5660-5060-bde8-44153a6ac6a8 source=docs/help/testing.md kind=rule state=active
   - Live suite Layer 2 configuration | For Layer 2 gateway + dev agent smoke, use `pnpm test:live` (or `OPENCLAW_LIVE_TEST=1`). It uses the default modern allowlist, and can be narrowed via `OPENCLAW_LIVE_GATEWAY_MODELS="provider/model"` (or comma list) and `OPENCLAW_LIVE_GATEWAY_PROVIDERS` (comma allowlist).
6. [wrong] score=0.2321 object=8cc7c051-f4fa-5de7-ab5b-ae379f341c8e source=docs/help/testing.md kind=fact state=active
   - Unit / integration (default) test suite: Runs `pnpm test` with config `scripts/test-parallel.mjs` (vitest.unit.config.ts, vitest.extensions.config.ts, vitest.gateway.config.ts); runs in CI; no real keys required; designed to be fast and stable.
7. [wrong] score=0.2143 object=8f6f9728-140b-509a-8017-ba6d056d22d0 source=docs/help/testing.md kind=fact state=active
   - Live suite command and behavior: Live suite command is `pnpm test:live` (sets `OPENCLAW_LIVE_TEST=1`), runs `src/**/*.live.test.ts`, reads `~/.profile` to pick up missing API keys, and is not CI-stable by design.
8. [wrong] score=0.1846 object=d32f8e70-347f-50b2-b018-c1a5fe1fbf78 source=docs/help/testing.md kind=fact state=active
   - Live direct model completion (no gateway) suite enablement: The live direct model completion (no gateway) test is `src/agents/models.profiles.live.test.ts`, and it runs when `OPENCLAW_LIVE_MODELS` is set (otherwise it skips); enable via `pnpm test:live` or `OPENCLAW_LIVE_TEST=1`, and set `OPENCLAW_LIVE_MODELS=modern` (or `all`, alias for modern) to actually run it.
9. [wrong] score=0.1607 object=15a9d830-68e6-52b9-85a7-62124f18e536 source=docs/help/testing.md kind=rule state=active
   - Unit/integration tests | Use `pnpm test` for unit/integration. | Do not require real keys for unit/integration tests. | Run `pnpm test` to execute `vitest.unit.config.ts`, `vitest.extensions.config.ts`, and `vitest.gateway.config.ts` in CI without real keys.
10. [wrong] score=0.1607 object=70e07c1b-860a-5740-a09e-2614b0301097 source=docs/help/testing.md kind=fact state=active

- Live tests enabling and key sourcing: `pnpm test:live` runs with live tests enabled by default (sets `OPENCLAW_LIVE_TEST=1`) and live runs source `~/.profile` to pick up missing API keys.

### 8f8c484adf15

- Case identity: `docs/help/testing.md::testing>quick start::rule_9fa49b077c8adffa027205e7`
- Source: `docs/help/testing.md`
- Kind: `rule`
- Trace pass: `rerun_1`
- Payload summary: Daily gate command before pushing | Run the full gate (`pnpm build && pnpm check && pnpm test`) most days before pushing.
- Manual rationale: Same default full-gate-before-push guidance.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.2353

Top results:

1. [acceptable] score=0.7059 object=571675ba-16a8-5c60-9e8c-b10bc6db9bb0 source=docs/help/testing.md kind=fact state=active
   - Testing gate command: Most days: run the full gate before push as `pnpm build && pnpm check && pnpm test`.
2. [acceptable] score=0.5294 object=34453d0c-1495-5a3b-9219-6b6ec8dadf8f source=docs/help/testing.md kind=rule state=active
   - Full test gate before pushing | Use `pnpm build && pnpm check && pnpm test` as the expected full gate before pushing.
3. [acceptable] score=0.5 object=cc0e6736-f8f9-5e74-8f6c-80a9d2897f63 source=docs/help/testing.md kind=rule state=active
   - Default full test gate | Run `pnpm build && pnpm check && pnpm test` as the expected-before-push full gate.
4. [acceptable] score=0.5 object=ed6a4c2f-c7f9-584b-8b6e-3b67ebf2de33 source=docs/help/testing.md kind=preference state=active
   - Daily CI/test workflow | Use the full gate before push: `pnpm build && pnpm check && pnpm test`. | full_gate_before_push
5. [acceptable] score=0.4737 object=3d628807-8c9e-52b6-b46c-3eb25a9eb260 source=docs/help/testing.md kind=rule state=active
   - Expected before-push testing workflow | Run the full gate (pnpm build && pnpm check && pnpm test) as the expected before-push testing workflow.
6. [wrong] score=0.4706 object=88b9738d-4688-5fd8-b192-e1b2bfc5b85c source=docs/help/testing.md kind=preference state=active
   - Default full gate before push | Use `pnpm build && pnpm check && pnpm test` before pushing. | default full gate before push
7. [wrong] score=0.4375 object=30505f7c-f81c-502f-be87-e8090178fbcd source=docs/help/testing.md kind=rule state=active
   - Default test gate before push | Run `pnpm build && pnpm check && pnpm test` before push.
8. [wrong] score=0.4211 object=4c9d4d20-4fed-5c15-b6fd-5946a698d62a source=docs/help/testing.md kind=preference state=active
   - Full CI gate before push | Use pnpm build && pnpm check && pnpm test as the full expected gate before push. | pnpm build && pnpm check && pnpm test
9. [wrong] score=0.35 object=8ae2163c-6ffe-53f8-bf1b-1d15ba8c3818 source=docs/help/testing.md kind=rule state=active
   - Pre-push CI gate | Use `pnpm build && pnpm check && pnpm test` as the full pre-push gate. | None
10. [wrong] score=0.2439 object=046aa314-ad72-5151-9156-8220990d134d source=docs/help/testing.md kind=rule state=active

- When running the test suite before pushing | Use `pnpm build && pnpm check && pnpm test` for the full pre-push gate; run `pnpm test:coverage` when you change a lot, and run `pnpm test:e2e` or a narrowed `pnpm test:live` for targeted work. | Access to the relevant scripts/commands (build, check, test, coverage, e2e, live) and, for live tests, real credentials.

### bcfcc93d1478

- Case identity: `docs/help/testing.md::testing>test suites (what runs where)>live (real providers + real models)::fact_5e9c427da71dd00365de513b`
- Source: `docs/help/testing.md`
- Kind: `fact`
- Trace pass: `rerun_1`
- Payload summary: Live tests credential sourcing and key rotation: Live runs source credentials from `~/.profile` to pick up missing API keys and support provider-specific API key rotation via `*_API_KEYS` (comma/semicolon format) or `*_API_KEY_1`, `*_API_KEY_2` (e.g., `OPENAI_API_KEYS`, `ANTHROPIC_API_KEYS`, `GEMINI_API_KEYS`), plus per-live override via `OPENCLAW_LIVE_*_KEY`; tests retry on rate limit responses.
- Manual rationale: Same live-credential sourcing and key-rotation behavior.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.2562

Top results:

1. [acceptable] score=0.4667 object=cec1d130-ceae-5042-b468-61b1b9128806 source=docs/help/testing.md kind=fact state=active
   - Live API key rotation and retries: Live tests retry on rate limit responses and support provider-specific API key rotation via `*_API_KEYS` or `*_API_KEY_1`/`*_API_KEY_2`, with per-live overrides via `OPENCLAW_LIVE_*_KEY`.
2. [acceptable] score=0.4043 object=cea5a3a4-f532-5f23-9c93-aa7bc14513c6 source=docs/help/testing.md kind=fact state=active
   - Live test API keys and rate-limit retries: Live tests source API keys from env vars like `*_API_KEYS` / `*_API_KEY_1` / `*_API_KEY_2` (or per-live override `OPENCLAW_LIVE_*_KEY`), and tests retry on rate limit responses.
3. [acceptable] score=0.3556 object=32b03114-a937-500c-9939-c9f3192ad4c1 source=docs/help/testing.md kind=fact state=conflict_hold
   - Live test configuration behavior: Live tests source `~/.profile` to pick up missing API keys, and tests retry on rate limit responses.
4. [acceptable] score=0.3333 object=a55be222-191e-53b9-beaf-359290f51946 source=docs/help/testing.md kind=fact state=active
   - Live credential sourcing: Live tests source credentials from `~/.profile` to pick up missing API keys.
5. [acceptable] score=0.32 object=70e07c1b-860a-5740-a09e-2614b0301097 source=docs/help/testing.md kind=fact state=active
   - Live tests enabling and key sourcing: `pnpm test:live` runs with live tests enabled by default (sets `OPENCLAW_LIVE_TEST=1`) and live runs source `~/.profile` to pick up missing API keys.
6. [wrong] score=0.2105 object=8f6f9728-140b-509a-8017-ba6d056d22d0 source=docs/help/testing.md kind=fact state=active
   - Live suite command and behavior: Live suite command is `pnpm test:live` (sets `OPENCLAW_LIVE_TEST=1`), runs `src/**/*.live.test.ts`, reads `~/.profile` to pick up missing API keys, and is not CI-stable by design.
7. [wrong] score=0.2 object=fadc31b4-0d36-56be-b965-4862c33615a2 source=docs/help/testing.md kind=fact state=active
   - Live tests credentials source and selection: Live runs source credentials from ~/.profile by default and can select models/providers via OPENCLAW_LIVE_MODELS and OPENCLAW_LIVE_PROVIDERS allowlists.
8. [wrong] score=0.1864 object=fb5d25bf-0d97-518c-9cf1-9bd222f7d88a source=docs/help/testing.md kind=rule state=active
   - Live tests execution and keys | Run `pnpm test:live` for live tests. | Do not rely on CI stability for live tests; expect real networks and provider quotas/outages. | `pnpm test:live` sets `OPENCLAW_LIVE_TEST=1` and sources API keys from `~/.profile`.
9. [wrong] score=0.1692 object=262cc0c2-a675-5df4-bc15-94d89e7cef6e source=docs/help/testing.md kind=fact state=conflict_hold
   - Profile store/config for live tests: Live tests use the profile store at ~/.openclaw/credentials/ (preferred) and config at ~/.openclaw/openclaw.json or via OPENCLAW_CONFIG_PATH; you can rely on env keys only if you source ~/.profile before running, or use Docker runners that mount ~/.profile into the container.
10. [wrong] score=0.1667 object=2885a5fd-3783-5ffe-b1fb-9f42aa1306e3 source=docs/help/testing.md kind=rule state=active

- Credential handling for live tests | Never commit credentials; provide credentials for live tests via the profile store or local config/env as described (profile store: ~/.openclaw/credentials/ preferred; config: ~/.openclaw/openclaw.json or OPENCLAW_CONFIG_PATH; optionally rely on env keys by sourcing ~/.profile or using Docker runners that can mount ~/.profile).

### e4ff91168289

- Case identity: `docs/help/testing.md::testing>live: model smoke (profile keys)::fact_7199ff3c3213422d715ec69e`
- Source: `docs/help/testing.md`
- Kind: `fact`
- Trace pass: `rerun_1`
- Payload summary: Live model smoke layers: Live model tests are split into two layers: direct model completion (no gateway) and a gateway+dev agent smoke that validates meaningful responses and tool/image probes.
- Manual rationale: Same two-layer live model smoke split.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.2114

Top results:

1. [acceptable] score=0.4242 object=9fe78fe9-3b3f-55eb-9e90-5ada852549ed source=docs/help/testing.md kind=fact state=active
   - Live test layers: Live tests are split into Layer 1 direct model completion (src/agents/models.profiles.live.test.ts) and Layer 2 gateway + dev agent smoke (src/gateway/gateway-models.profiles.live.test.ts).
2. [acceptable] score=0.4211 object=e3530a8e-83a9-5536-8b05-b7198d3c05c2 source=docs/help/testing.md kind=fact state=active
   - Live tests layer split: Live tests are split into two layers: Layer 1 direct model completion (no gateway) in `src/agents/models.profiles.live.test.ts`, and Layer 2 gateway + dev agent smoke (what “@openclaw” actually does) in `src/gateway/gateway-models.profiles.live.test.ts`.
3. [acceptable] score=0.3793 object=b603bf56-1ef9-5861-b7fa-a182361b8b1e source=docs/help/testing.md kind=fact state=active
   - Live model smoke layer split: Live model smoke is split into Layer 1 (direct model completion without gateway) and Layer 2 (gateway + dev agent smoke).
4. [acceptable] score=0.2564 object=43fa8976-b1e3-5b60-88f5-752be798f521 source=docs/help/testing.md kind=rule state=active
   - Live model smoke layer separation | Isolate failures using the two layers | Layer 1 direct model completion and Layer 2 full gateway+agent pipeline to validate different failure modes
5. [acceptable] score=0.2449 object=0f1a11dd-fb49-50d8-8b2f-0fe56681912f source=docs/help/testing.md kind=rule state=active
   - Layer 1 vs Layer 2 live test enablement | Layer 1 live model completion (no gateway) uses `src/agents/models.profiles.live.test.ts` and is enabled only when `OPENCLAW_LIVE_MODELS` is set; otherwise it skips. | Layer 2 live gateway smoke uses `src/gateway/gateway-models.profiles.live.test.ts` and validates the full gateway+agent pipeline including tool/image probes.
6. [wrong] score=0.2128 object=e69dd974-8c0c-55c2-9fde-5354e59c798e source=docs/help/testing.md kind=fact state=conflict_hold
   - Layer 2 live smoke behavior (gateway + dev agent smoke): Layer 2 gateway+agent live smoke spins up an in-process gateway, creates/patches an `agent:dev:*` session, and runs tool probes (`read`, optional `exec+read`) plus an image probe expecting the model to return `cat <CODE>`.
7. [wrong] score=0.2051 object=b38f494b-c257-572d-9280-91e53cf86a03 source=docs/help/testing.md kind=fact state=active
   - Live gateway smoke test model set: Set OPENCLAW_LIVE_GATEWAY_MODELS to a provider-spanning tool-calling plus image-capable model set and run pnpm test:live src/gateway/gateway-models.profiles.live.test.ts.
8. [wrong] score=0.2045 object=36461ef4-6c5e-5bb9-aff7-470f01d4b182 source=docs/help/testing.md kind=fact state=active
   - Live gateway smoke: Run gateway smoke with tools + image by setting OPENCLAW_LIVE_GATEWAY_MODELS to a modern cross-provider model matrix (including tool calling + image probes) and running `pnpm test:live src/gateway/gateway-models.profiles.live.test.ts`.
9. [wrong] score=0.2 object=fad2e3a9-23fc-5938-8bc3-cfff1af073bf source=docs/help/testing.md kind=rule state=active
   - Live model smoke layer 1 (direct model completion) | To run live model smoke layer 1 (direct model completion, no gateway), set `OPENCLAW_LIVE_MODELS=modern` (or `all`) and run `pnpm test:live` (or `OPENCLAW_LIVE_TEST=1` if invoking Vitest directly).
10. [wrong] score=0.1795 object=0bd402bd-0b2e-5ee6-a009-9daad6ff35db source=docs/help/testing.md kind=fact state=active

- Live gateway smoke probes and test file: The live gateway smoke is `src/gateway/gateway-models.profiles.live.test.ts` and includes a read probe, an exec+read probe, and an image probe when supported.

### 91530462f717

- Case identity: `docs/help/testing.md::testing>live: model matrix (what we cover)>baseline: tool calling (read + optional exec)::rule_8803dfefb47bcdd7510b7e17`
- Source: `docs/help/testing.md`
- Kind: `rule`
- Trace pass: `rerun_1`
- Payload summary: Live smoke model matrix coverage | Include at least one tools-capable model per provider family and include at least one image-capable model to exercise the image probe. | tools-capable and image-capable models available for each provider family during live smoke
- Manual rationale: Same live model-matrix coverage rule for tools plus image.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.2797

Top results:

1. [acceptable] score=0.7241 object=3ac2db64-81b5-501d-8818-78f07da9d9a8 source=docs/help/testing.md kind=rule state=active
   - Live gateway model matrix coverage | Use the model matrix to include at least one tools-capable model per provider family and include at least one image-capable model to exercise the image probe. | Select at least one tools-capable model per provider family and at least one image-capable model for OPENCLAW_LIVE_GATEWAY_MODELS.
2. [acceptable] score=0.6897 object=4bb7ea6c-318c-57f2-aa98-0b6c0643ae55 source=docs/help/testing.md kind=rule state=active
   - For live gateway smoke, include at least one tools-capable model per provider family and include at least one image-capable model to exercise the image probe. | Ensure OPENCLAW_LIVE_GATEWAY_MODELS includes at least one tools-capable model per provider family and at least one image-capable model to exercise the image probe.
3. [acceptable] score=0.5455 object=e22d1cc6-a94b-5e27-b648-2d68845ebb86 source=docs/help/testing.md kind=rule state=active
   - For live gateway model-matrix smoke, include tool-calling coverage and at least one image-capable model to exercise the image probe. | Include tool-calling coverage and at least one image-capable model in OPENCLAW_LIVE_GATEWAY_MODELS (vision-capable variants) for the image probe. | Tool-calling-capable models and at least one image-capable model enabled in OPENCLAW_LIVE_GATEWAY_MODELS.
4. [acceptable] score=0.5172 object=5a4d3b1c-efca-5e26-8524-0877e64836df source=docs/help/testing.md kind=rule state=active
   - Vision coverage for live gateway | Include at least one image-capable model in OPENCLAW_LIVE_GATEWAY_MODELS to exercise the image probe.
5. [acceptable] score=0.4828 object=9e1e97f9-d41f-579b-9aea-5565fc5d430a source=docs/help/testing.md kind=fact state=active
   - Image-capable model requirement for live gateway image probe: Include at least one image-capable model in `OPENCLAW_LIVE_GATEWAY_MODELS` to exercise the image probe.
6. [wrong] score=0.4444 object=bf4e0046-f4b6-543f-ab04-abc0a9d15ee3 source=docs/help/testing.md kind=rule state=active
   - Include image-capable models in OPENCLAW_LIVE_GATEWAY_MODELS for live model matrix smoke test | Include at least one image-capable model in OPENCLAW_LIVE_GATEWAY_MODELS (e.g., Claude/Gemini/OpenAI vision-capable variants) to exercise the image probe.
7. [wrong] score=0.4286 object=91942563-fc38-5c1e-8593-c21782706dcb source=docs/help/testing.md kind=rule state=active
   - Live gateway smoke matrix tool-calling coverage | Include at least one tool-calling model per provider family.
8. [wrong] score=0.4054 object=1c4c3bd3-ee20-5273-943d-15cddee1966f source=docs/help/testing.md kind=rule state=active
   - Baseline live matrix provider coverage | Include at least one tool-calling capable model per provider family: OpenAI, Anthropic, Google, Z.AI, and MiniMax. | Model selections that support tool calling for each provider family.
9. [wrong] score=0.3824 object=5a248228-b8d2-54f4-b140-42e90286a3db source=docs/help/testing.md kind=rule state=active
   - Live model matrix baseline model selection | Pick at least one tools-capable model per provider family (OpenAI, Anthropic, Google, Z.AI, MiniMax) for the live model matrix baseline.
10. [wrong] score=0.3548 object=32723415-ae40-5d46-8443-d3d55ac80593 source=docs/help/testing.md kind=rule state=active

- Include at least one tool-calling-capable baseline model per provider family in OPENCLAW_LIVE_GATEWAY_MODELS. | Include at least one tool-calling-capable baseline model per provider family in OPENCLAW_LIVE_GATEWAY_MODELS.

### bcd2391a338b

- Case identity: `docs/help/testing.md::testing>credentials (never commit)::rule_0ec4b28b41694187496e1933`
- Source: `docs/help/testing.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Avoid committing credentials for live tests | Do not commit credentials; let live tests discover credentials the same way the CLI does, using the profile store (~/.openclaw/credentials/) and optionally ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH). | Access to profile store credentials (~/.openclaw/credentials/) or config path (OPENCLAW_CONFIG_PATH).
- Manual rationale: Same live-test credential handling rule.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.3217

Top results:

1. [acceptable] score=0.6452 object=096c0f61-d8df-5f20-a637-8c253aa1d603 source=docs/help/testing.md kind=rule state=active
   - Credentials handling for live tests | Never commit credentials. Live tests discover credentials the same way the CLI does, using profile store ~/.openclaw/credentials/ (preferred) and/or ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH).
2. [acceptable] score=0.4857 object=f88e5225-9826-50da-abd7-36f4ff18611e source=docs/help/testing.md kind=fact state=active
   - Credentials discovery and local paths for live tests: Live tests discover credentials the same way the CLI does; profile keys are stored in ~/.openclaw/credentials/ and config in ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH).
3. [acceptable] score=0.4318 object=f5f98b07-33cd-5753-b75d-b5a64f6f9a2c source=docs/help/testing.md kind=rule state=active
   - Credentials must never be committed; live tests discover credentials using the same flow as the CLI with the profile store and config path/env var. | Use the profile store at ~/.openclaw/credentials/ and config at ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH) so live tests discover credentials the same way as the CLI. | Never commit credentials. | Local credential/profile configuration accessible to live tests.
4. [acceptable] score=0.3636 object=79ba850b-288b-584e-865e-50d11b080df8 source=docs/help/testing.md kind=fact state=conflict_hold
   - Live test credential/config storage paths: Profile store for live tests is `~/.openclaw/credentials/` and config is `~/.openclaw/openclaw.json` (or `OPENCLAW_CONFIG_PATH`).
5. [acceptable] score=0.3333 object=1b8b0a62-8415-526b-8e55-62388a6bf61a source=docs/help/testing.md kind=fact state=active
   - Live test credential profile store and config path: Profile store: ~/.openclaw/credentials/. Config: ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH).
6. [wrong] score=0.3235 object=0927dc7f-4d32-5363-bb2b-25664494800b source=docs/help/testing.md kind=fact state=conflict_hold
   - Where live test credentials and config are stored: Live tests use profile store at `~/.openclaw/credentials/` and config at `~/.openclaw/openclaw.json` (or `OPENCLAW_CONFIG_PATH`).
7. [wrong] score=0.3125 object=2885a5fd-3783-5ffe-b1fb-9f42aa1306e3 source=docs/help/testing.md kind=rule state=active
   - Credential handling for live tests | Never commit credentials; provide credentials for live tests via the profile store or local config/env as described (profile store: ~/.openclaw/credentials/ preferred; config: ~/.openclaw/openclaw.json or OPENCLAW_CONFIG_PATH; optionally rely on env keys by sourcing ~/.profile or using Docker runners that can mount ~/.profile).
8. [wrong] score=0.3056 object=b30246e1-7a7f-5f10-887e-23cc1b6960a5 source=docs/help/testing.md kind=rule state=active
   - Keep live credentials out of the repo | Store profile keys in ~/.openclaw/credentials/ (preferred) and config in ~/.openclaw/openclaw.json (or use OPENCLAW_CONFIG_PATH).
9. [wrong] score=0.3 object=3728e437-e979-5a79-bded-f36c864a042a source=docs/help/testing.md kind=fact state=active
   - Live tests credential behavior: Live tests discover credentials the same way the CLI does.
10. [wrong] score=0.2857 object=126478b9-53cc-5346-b7da-478d100163e8 source=docs/help/testing.md kind=fact state=active

- Credential lookup locations: Provider credential lookup uses the profile store at ~/.openclaw/credentials/ (preferred) and config at ~/.openclaw/openclaw.json or OPENCLAW_CONFIG_PATH.

### 33097656b061

- Case identity: `docs/help/testing.md::testing>adding regressions (guidance)::rule_a272d18843d1e18ea7ec5676`
- Source: `docs/help/testing.md`
- Kind: `rule`
- Trace pass: `rerun_2`
- Payload summary: Adding regressions discovered in live provider/model issues | Add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation); if inherently live-only, keep the live test narrow and opt-in via env vars. | Ability to create CI-safe regression (mock/stub or request-shape capture) and/or env-gated narrow live tests.
- Manual rationale: Same guidance on adding regressions after live provider/model issues.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1281

Top results:

1. [acceptable] score=0.7174 object=43ff40f3-93c1-5285-ba8c-4941529d8fbe source=docs/help/testing.md kind=rule state=active
   - Adding regressions from live provider/model issues | Add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation). | If it’s inherently live-only (rate limits, auth policies), keep the live test narrow and opt-in via env vars.
2. [acceptable] score=0.7045 object=7b61d8bb-eb05-5c2a-9079-5e8c6aea9bc4 source=docs/help/testing.md kind=rule state=active
   - When adding regressions after a live provider/model issue, prefer a CI-safe regression when possible; otherwise keep the live test narrow and env-gated. | Add a CI-safe regression if possible; otherwise keep the live test narrow and opt-in via env vars. | Mock/stub provider or capture the exact request-shape transformation.
3. [acceptable] score=0.6939 object=affd4617-3fe4-5e9b-8f77-5413969beb7c source=docs/help/testing.md kind=rule state=active
   - When adding regressions, prefer CI-safe mock/stub or captured request-shape transformation; keep live-only tests narrow and opt-in via env vars. | Add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation). If inherently live-only (rate limits/auth), keep the live test narrow and opt-in via env vars. | Ability to implement mock/stub or capture request-shape transformations; ability to gate live tests behind env vars.
4. [acceptable] score=0.6429 object=a1ab18fe-16e7-5a0c-94a1-7177b606d9b1 source=docs/help/testing.md kind=rule state=conflict_hold
   - Adding regressions for provider/model issues | When adding regressions for provider/model issues, prefer CI-safe mock/stub regressions or request-shape capture; if inherently live-only, keep the live test narrow and opt-in via env vars.
5. [acceptable] score=0.6364 object=18432d70-c7ac-58ce-985c-198138dcaad1 source=docs/help/testing.md kind=rule state=conflict_hold
   - Adding regressions after live fixes | When you fix a provider/model issue discovered in live, add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation). If inherently live-only (rate limits, auth policies), keep the live test narrow and opt-in via env vars. | Be able to implement either a CI-safe regression (mock/stub or captured request-shape transformation) or restrict live tests via env vars.
6. [wrong] score=0.5893 object=e57a3fd7-508c-51cd-b513-b2ad5252db12 source=docs/help/testing.md kind=rule state=conflict_hold
   - Adding regressions after live provider/model fixes | When you fix a provider/model issue discovered in live: add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation); if inherently live-only (rate limits/auth policies), keep the live test narrow and opt-in via env vars; prefer targeting the smallest layer that catches the bug.
7. [wrong] score=0.5833 object=662b3a76-4768-55d6-ad02-1eaa31175d8b source=docs/help/testing.md kind=rule state=conflict_hold
   - Adding regressions after fixing live provider/model issues | Add a CI-safe regression if possible (mock/stub provider, or capture the exact request-shape transformation). | If the issue is inherently live-only (rate limits, auth policies), do not rely on CI-safe mocks; keep the live test narrow and opt-in via env vars. | Ability to target the smallest layer that catches the bug. Prefer targeting the smallest layer that catches the bug.
8. [wrong] score=0.2632 object=a5c81983-38d2-5313-b05c-8f20bfb10036 source=docs/help/testing.md kind=rule state=active
   - When adding regressions, target the smallest layer that catches the bug. | If the bug is in provider request conversion/replay, add a direct models test; if the bug is in gateway session/history/tool pipeline, add a gateway live smoke or a CI-safe gateway mock test.
9. [wrong] score=0.1765 object=c5e5a10f-7dea-5294-9bd7-9246459c8a1d source=docs/help/testing.md kind=rule state=active
   - Running live tests with real credentials | When debugging real providers/models with real credentials, run the live suite via `pnpm test:live` (and narrow via allowlist env vars).
10. [wrong] score=0.1698 object=379f6934-c3f0-5120-b131-05a09517ff88 source=docs/help/testing.md kind=rule state=active

- Live test allowlist env vars | To narrow live tests, use live allowlist env vars such as `OPENCLAW_LIVE_MODELS` and `OPENCLAW_LIVE_GATEWAY_MODELS`. | Set the relevant `OPENCLAW_LIVE_*` environment variables with an allowlist value.

### 5a6712776634

- Case identity: `docs/gateway/configuration.md::configuration>config hot reload>reload modes::fact_7f6d833c0c17e1f3b567194b`
- Source: `docs/gateway/configuration.md`
- Kind: `fact`
- Trace pass: `rerun_1`
- Payload summary: Gateway config hot reload behavior for hybrid mode: In `hybrid` reload mode (default), the Gateway hot-applies safe config changes instantly and automatically restarts for critical ones.
- Manual rationale: Same hybrid-mode hot reload behavior.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1758

Top results:

1. [acceptable] score=0.6 object=71256a06-22bc-509d-a679-25c6d4e21856 source=docs/gateway/configuration.md kind=rule state=active
   - Config hot reload `hybrid` mode behavior | Use `hybrid` (default) to hot-apply safe changes instantly while automatically restarting the Gateway for critical changes.
2. [acceptable] score=0.5625 object=e1cb73a5-dcb3-5347-a6a4-28a2206ee368 source=docs/gateway/configuration.md kind=fact state=active
   - Hybrid hot reload mode behavior: In `hybrid` hot reload mode (default), hot-applies safe changes instantly and automatically restarts for critical ones; restart-required changes include `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) and `discovery`, `canvasHost`, `plugins`.
3. [acceptable] score=0.475 object=827f8a60-18ac-5e15-8d81-19e2ac59a88c source=docs/gateway/configuration.md kind=rule state=active
   - Config hot reload hybrid mode | Assume `hybrid` (default) hot-applies safe changes instantly and automatically restarts for critical ones. | Do not expect all changes to avoid restarts in `hybrid`; gateway-critical settings may trigger an automatic restart. | Configure using an appropriate reload mode (`hybrid`, `hot`, `restart`, or `off`) to match desired behavior.
4. [acceptable] score=0.4483 object=93704543-7ecd-5cfe-ab23-bc8bf58dc815 source=docs/gateway/configuration.md kind=rule state=active
   - Hybrid reload behavior for critical vs safe changes | In `hybrid` mode, rely on safe changes being hot-applied instantly and critical changes triggering an automatic Gateway restart.
5. [acceptable] score=0.4483 object=af166c5e-fe93-51e6-8d1f-c01b63b1d292 source=docs/gateway/configuration.md kind=fact state=active
   - Config hot reload behavior and reload modes: The Gateway watches ~/.openclaw/openclaw.json and applies changes automatically for most settings. Reload modes include hybrid (default), hot, restart, and off.
6. [wrong] score=0.4242 object=06b0555b-156a-5ea2-8f96-9602de5808b8 source=docs/gateway/configuration.md kind=rule state=conflict_hold
   - Config hot reload hybrid mode | When using `hybrid` (default), rely on hot-apply for safe changes and automatic restarts for critical changes. | Do not assume all changes hot-apply instantly; critical changes trigger a restart in `hybrid` mode.
7. [wrong] score=0.3846 object=6a1ab9fc-815a-556b-a309-050d679c5b8b source=docs/gateway/configuration.md kind=rule state=active
   - Config hot reload via `gateway.reload.mode` | Use `gateway.reload` mode (`hybrid` default, `hot`, `restart`, `off`) to control restart behavior for config changes.
8. [wrong] score=0.3793 object=49d7b31d-c478-5f46-aaeb-81a96e32b52d source=docs/gateway/configuration.md kind=fact state=superseded
   - Config hot reload behavior and reload modes: The Gateway watches ~/.openclaw/openclaw.json and hot-applies most settings automatically; reload modes are hybrid (default), hot, restart, and off.
9. [wrong] score=0.3793 object=70471ee6-2844-5f29-bb51-4543a20f1b12 source=docs/gateway/configuration.md kind=fact state=conflict_hold
   - Config hot reload behavior: The Gateway watches ~/.openclaw/openclaw.json and applies changes automatically (no manual restart needed for most settings).
10. [wrong] score=0.3448 object=813351d6-f353-5c74-97f9-6060be6c2162 source=docs/gateway/configuration.md kind=fact state=active

- Hot reload behavior for most settings: The Gateway watches ~/.openclaw/openclaw.json and applies changes automatically for most settings, without a manual restart.

### 4768592df3f5

- Case identity: `docs/gateway/configuration.md::configuration>config hot reload>what hot-applies vs what needs a restart::rule_9af72a04af91ec2bf8dd3aef`
- Source: `docs/gateway/configuration.md`
- Kind: `rule`
- Trace pass: `rerun_1`
- Payload summary: Config hot reload restart requirements | When editing config hot reload, expect a restart to be needed for `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) and infrastructure fields (`discovery`, `canvasHost`, `plugins`). | Do not assume changes to `gateway.*` or infrastructure fields will hot-apply without a restart. | Separate changes into those that can hot-apply vs those that require restart: `gateway.*` and infrastructure fields require restart, while most other fields can hot-apply.
- Manual rationale: Same restart-required field guidance in hot reload.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.0831

Top results:

1. [acceptable] score=0.5217 object=e8995751-48cd-54e6-a550-16df7b37adfa source=docs/gateway/configuration.md kind=fact state=active
   - Fields requiring restart during hot reload: During hot reload, changes to `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) require a restart, and changes to `discovery`, `canvasHost`, and `plugins` require a restart; most other config fields do not.
2. [acceptable] score=0.5091 object=b3ad0ed0-9944-538b-ade7-77fba26f2adc source=docs/gateway/configuration.md kind=rule state=active
   - Which config changes require restart in hot reload | Restart the gateway when changing gateway._ (port, bind, auth, tailscale, TLS, HTTP) or infrastructure fields (discovery, canvasHost, plugins). | Do not assume a restart will not be triggered when modifying gateway._ or infrastructure fields. | Treat gateway.reload and gateway.remote as exceptions that do not trigger a restart.
3. [acceptable] score=0.4909 object=64225398-59d3-513d-b6f0-08bba1149976 source=docs/gateway/configuration.md kind=rule state=conflict_hold
   - Restart required fields during config hot reload (hybrid) | Plan for a restart when changing gateway.\* (port, bind, auth, tailscale, TLS, HTTP) and infrastructure fields discovery, canvasHost, and plugins (except gateway.reload and gateway.remote). | Do not expect a restart-triggering change in those fields to hot-apply without downtime.
4. [acceptable] score=0.4909 object=efe67500-1465-5f1d-a499-fe3c87a901d1 source=docs/gateway/configuration.md kind=rule state=conflict_hold
   - Hot reload vs restart requirements for config changes | Use hot-apply for most config fields; plan a restart for gateway server and specified infrastructure fields in hybrid mode. | Do not assume changes to `gateway.*`, `discovery`, `canvasHost`, or `plugins` will be sufficient without restart in hybrid mode. | Know which config keys require restart: `gateway.*` and (`discovery`, `canvasHost`, `plugins`).
5. [acceptable] score=0.4412 object=f32156b2-727f-5114-87c8-085627b03e97 source=docs/gateway/configuration.md kind=rule state=active
   - Hybrid hot reload: which fields hot-apply vs require restart | In `hybrid` mode, treat most fields as hot-applying without downtime, but expect a restart for `gateway.*` (ports, bind, auth, tailscale, TLS, HTTP) and for `discovery`, `canvasHost`, and `plugins`. | Do not expect changes to `gateway.*` (server settings) or the infrastructure items `discovery`, `canvasHost`, and `plugins` to avoid a restart. | Knowledge of which config fields are restart-required in `hybrid` mode, including the special exceptions `gateway.reload` and `gateway.remote` that do not trigger a restart.
6. [wrong] score=0.4386 object=ce5575f7-741f-5ced-aec7-e9c4b3ad660f source=docs/gateway/configuration.md kind=rule state=active
   - In hybrid hot-reload mode, which config changes require a restart | Expect restarts for `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) and for infrastructure fields `discovery`, `canvasHost`, and `plugins`; other listed categories hot-apply without downtime. | Awareness of the restart-required field categories in `hybrid` mode
7. [wrong] score=0.4237 object=f6fedd39-5b8a-5d16-a95a-a10ec3e5c455 source=docs/gateway/configuration.md kind=rule state=active
   - What requires restart vs hot-apply | When changing gateway._ (server settings) or infrastructure categories (discovery, canvasHost, plugins), plan for a restart; other categories can usually be hot-applied. | Do not assume hot reload will avoid a restart for gateway._ or infrastructure (discovery, canvasHost, plugins). | Identify which config fields fall under gateway.\* or infrastructure to determine restart requirements.
8. [wrong] score=0.3585 object=59b65005-77e8-58c8-bb9e-81ca82e944e2 source=docs/gateway/configuration.md kind=rule state=active
   - Hot-applies vs restart-required config categories | Treat changes to `gateway.*` (gateway server) and infrastructure fields (`discovery`, `canvasHost`, `plugins`) as requiring a Gateway restart; most other listed categories can hot-apply without downtime.
9. [wrong] score=0.283 object=59712d8e-eb2b-5e77-9b94-82380ae16523 source=docs/gateway/configuration.md kind=rule state=active
   - Config hot reload restart requirements | In hybrid mode, plan restarts only for `gateway.*` (server category) and for `discovery`, `canvasHost`, and `plugins`; most other fields hot-apply automatically.
10. [wrong] score=0.2759 object=e1cb73a5-dcb3-5347-a6a4-28a2206ee368 source=docs/gateway/configuration.md kind=fact state=active

- Hybrid hot reload mode behavior: In `hybrid` hot reload mode (default), hot-applies safe changes instantly and automatically restarts for critical ones; restart-required changes include `gateway.*` (port, bind, auth, tailscale, TLS, HTTP) and `discovery`, `canvasHost`, `plugins`.

### 87076f826ab8

- Case identity: `docs/gateway/configuration.md::configuration>config rpc (programmatic updates)::rule_828eac884ae0bf3757a16df3`
- Source: `docs/gateway/configuration.md`
- Kind: `rule`
- Trace pass: `rerun_1`
- Payload summary: config.patch partial updates | Apply JSON merge patch semantics: merge objects recursively, delete keys with null, and replace arrays.
- Manual rationale: Same config.patch JSON merge patch semantics.
- Best acceptable rank: 1
- Hits: top1=true top5=true top10=true
- Score gap vs top wrong: 0.1218

Top results:

1. [acceptable] score=0.5833 object=4ab4b574-c3d2-5606-bac3-beada538852b source=docs/gateway/configuration.md kind=preference state=active
   - Use config.patch for partial updates | Use config.patch for partial updates: merge recursively (JSON merge patch semantics), delete keys when the value is null, and replace arrays. | config.patch partial update semantics
2. [acceptable] score=0.5652 object=d7b2b3a3-5d10-5c89-9ecc-b30fc5a8cb82 source=docs/gateway/configuration.md kind=rule state=active
   - config.patch merge behavior | Use JSON merge patch semantics for partial updates: objects merge recursively, null deletes a key, and arrays replace.
3. [acceptable] score=0.5 object=660e6ac4-2043-50e6-a41f-10c478f1bf13 source=docs/gateway/configuration.md kind=fact state=active
   - config.patch JSON merge patch semantics: Objects merge recursively; null deletes a key; arrays replace.
4. [acceptable] score=0.4828 object=029d06b9-f07f-5ba6-8200-bddb65a758a7 source=docs/gateway/configuration.md kind=rule state=active
   - Partial config updates use JSON merge patch semantics | Do not assume full replacement when sending partial updates; instead, apply JSON merge patch semantics: objects merge recursively, null deletes a key, and arrays replace.
5. [acceptable] score=0.4643 object=7d78f756-8f20-5754-aa35-c7cf4dd3a41d source=docs/gateway/configuration.md kind=rule state=active
   - config.patch JSON merge patch semantics | Implement JSON merge patch semantics for config.patch: merge objects recursively, treat null as deleting keys, and replace arrays. | Support recursive object merging, null-as-delete, and array replacement semantics for config.patch.
6. [wrong] score=0.4615 object=62ce1583-9323-5295-88e4-e8e3dfbd0224 source=docs/gateway/configuration.md kind=fact state=active
   - config.patch semantics: Merges a partial update into the existing config using JSON merge patch semantics: objects merge recursively, null deletes a key, and arrays replace.
7. [wrong] score=0.4615 object=65faa69b-9e65-5293-aa37-acc585565718 source=docs/gateway/configuration.md kind=fact state=active
   - Config.patch partial update semantics: Merges a partial update into the existing config using JSON merge patch semantics: objects merge recursively, null deletes a key, and arrays replace.
8. [wrong] score=0.4194 object=4b109f2a-fe56-52df-946e-361c29b4dc3a source=docs/gateway/configuration.md kind=rule state=active
   - config.patch merge semantics | When using config.patch, supply partial updates under JSON merge patch semantics: objects merge recursively, null deletes a key, and arrays replace. | Understand that arrays are replaced rather than merged.
9. [wrong] score=0.3929 object=f118fe71-7b1c-5788-9958-ece4db9f3716 source=docs/gateway/configuration.md kind=rule state=active
   - config.patch JSON merge patch semantics | Use JSON merge patch semantics: objects merge recursively, null deletes a key, and arrays replace. | Avoid assuming other merge behavior for arrays or null values.
10. [wrong] score=0.2903 object=ebf1080c-5c93-5c26-a700-8c3a5d1e63a1 source=docs/gateway/configuration.md kind=rule state=active

- Semantics of config RPCs | Use `config.patch` for partial updates and `openclaw config set` for single keys; use `config.apply` only when you intend to replace the entire config.
