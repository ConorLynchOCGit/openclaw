Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
ClawHub: https://clawhub.ai/xobi667/ui-ux-pro-max
Installed: 2026-04-27 UTC
Adaptation:

- copied upstream `.claude/skills/ui-ux-pro-max/SKILL.md`
- copied upstream `src/ui-ux-pro-max/{data,scripts,templates}`
- copied upstream `README.md`, `LICENSE`, and `skill.json`
- excluded repo metadata and marketplace/plugin wrappers from runtime install

Risk: medium
Reason:

- no credential-grab or outbound exfiltration red flags were found in reviewed skill files
- includes local file persistence and CLI/template machinery, so installation is limited to the bounded skill assets above
