---
name: start-dragon-run
description: Start a confirmed Helio Dragon Assess or Enhance plan exactly once.
---

Use this skill when the user has requested Assess/Enhance execution and a prepared plan is ready, with any planner-required confirmations supplied. The original execution request authorizes starting; do not ask for permission again merely because preparation has finished. A prepare-only request does not authorize execution.

1. Inspect `start_dragon_run` input schema and use the exact `identity` supplied to preparation and retained in its response; never substitute a backend operation ID or reconstruct an identity.
2. Before starting, repeat meaningful reference substitutions, warnings, and any account or quota information returned by the planner when that context is not already fresh in the conversation.
3. Call start once. Never silently retry creation after an ambiguous response: use `get_dragon_run` with the known plan/run identity to recover its state.
4. Report the returned run identity and current state. A creation acknowledgement is not completion.
5. Poll only when asked, or when the user has requested monitoring; use `check-dragon-run` for that follow-up.

Do not create a separate simulation before optimization, modify source G-code, or automatically print an optimized artifact.
