---
summary: "Durable pack for the route-bound Chief agent that shares the main workspace but has its own operating contract."
title: "Chief"
---

# Chief

`chief` is a distinct live agent even though it shares the main workspace with
`main`.

## Durable pack

1. [Identity](/agents/chief/Identity)
2. [Startup](/agents/chief/Startup)
3. [Tools](/agents/chief/Tools)
4. [Permissions](/agents/chief/Permissions)
5. [Skills](/agents/chief/Skills)
6. [Status](/agents/chief/Status)

## Runtime note

- runtime surface: `/root/.openclaw/agents/chief/agent`
- runtime surface alias: `/home/node/.openclaw/agents/chief/agent`
- workspace surface: shared `/root/.openclaw/workspace`
- workspace surface alias: shared `/home/node/.openclaw/workspace`
- runtime compatibility files are currently shared from the main workspace pack
