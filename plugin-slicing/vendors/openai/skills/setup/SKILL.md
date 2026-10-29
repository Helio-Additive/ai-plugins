---
name: helio-slicing-setup
description: Set up the Helio Slicing plugin when a user needs to connect their Helio Additive account or verify access.
---

Use this skill when the user asks to set up, connect, authenticate, or troubleshoot access to Helio Slicing.

The plugin connects to the `helioadditive-slicing` MCP server using OAuth. Explain that the user must complete the OAuth consent flow presented by the host. Do not ask for, request, or store a password, access token, or client secret.

After consent, make a read-only MCP request only if the user asks to verify access or to inspect an existing slice. If authorization fails, report the error and ask the user to reconnect; do not retry or substitute credentials.
