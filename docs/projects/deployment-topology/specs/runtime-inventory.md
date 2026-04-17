---
summary: "Canonical runtime inventory and anti-sprawl posture."
title: "Canonical Runtime Inventory"
---

# Canonical Runtime Inventory

Target runtime posture:

- one canonical repo checkout
- one canonical runtime container
- one canonical runtime image

Non-canonical extra repo/container/image surfaces are drift and should be
tracked through runtime inventory checks before removal.
