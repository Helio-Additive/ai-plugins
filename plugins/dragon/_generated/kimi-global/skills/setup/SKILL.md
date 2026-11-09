---
name: setup
description: Optionally troubleshoot the Helio Dragon connection using the host OAuth flow.
---

Use this skill when the user asks to connect, authenticate, or troubleshoot Helio Dragon access.

The host handles OAuth during plugin installation. This skill is optional troubleshooting, not an extra onboarding login. If reconnection is needed, direct the user to the host's consent flow; do not require another login after successful installation. Discover authorization endpoints from the selected MCP resource rather than hardcoding them. Do not ask for, accept, store, or suggest passwords, manually copied authorization codes, or other credentials.

After consent, use `dragon_catalog` for a read-only access check only when the user asks to verify access. Report the exact service error. For an expired or invalid credential, use the host reconnect flow. A scope or policy denial requires service configuration; a missing route requires gateway configuration. Reconnecting alone does not fix either. Do not retry with substitute credentials.
