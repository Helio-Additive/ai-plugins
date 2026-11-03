# Maintainer instructions

This directory is a local multi-provider plugin package. Keep source files and
generated provider packages consistent.

## Source of truth

- Edit `plugin.jsonnet`, `mcp.jsonnet`, `skills/**/*.mdx`, and `assets/`.
- Do not hand-edit `vendors/`; run `just make` after source changes and commit
  the regenerated outputs alongside the source change.
- `vendors/openai/` is the installable OpenAI package. `vendors/anthropic/`
  intentionally contains only the shared rendered skills until a provider
  manifest is explicitly specified.
- `.agents/plugins/marketplace.json` is shared local-marketplace integration
  and must point to `./vendors/openai`.

## Dragon safety contract

- Preserve the six skills and their lifecycle: setup, tool discovery, prepare,
  start, check, and output download.
- Preparation may register and validate G-code but must never start a run.
  Starting requires an explicit request and the exact prepared plan identity.
- Do not invent catalog IDs, bounds, output URLs, OAuth clients, scopes, or
  substitute credentials. Never add PAT handling to package skills.
- `SLICE`, `PARSED_GCODE`, and `USER` are descriptive caller-input labels, not
  proof. The MCP verifies exact catalog IDs and registered G-code mappings;
  agents must obtain run facts from existing slicer/reader output or explicit
  user input rather than fabricating them or building another parser.
- Assess may omit slice statistics and environment fields so backend defaults
  apply. An explicit environment override needs the original slot-0 first-layer
  bed temperature and known original chamber mode. Enhance needs an existing
  slicer/reader or user-supplied object-layer count; advanced limits require
  all four speed/flow bounds only when explicitly selected or forced by a
  0.2 mm nozzle, layer height below 0.2 mm, or a reference mapping.
- Use `dragon_catalog` to discover exact printer and material catalog IDs. Its
  required `resource` is `printers` or `materials`; pagination defaults to
  `page: 1` and `page_size: 100` (maximum 100). Follow
  `resource.pageInfo.hasNextPage`; use returned IDs, names, Bambu Studio
  alternatives, and current metadata rather than inventing a fuzzy matcher.
- Match OAuth client/scopes to the companion gateway/Auth source contract.
  Draft configuration may target its companion proposed policy, but must identify
  deployment dependencies and must not claim deployed registration or login.
  Reuse existing infrastructure; never invent values without a policy change.

## Required checks

Run `just make` and `just validate` after package changes. `just validate`
checks generated package structure, six-skill coverage, marketplace alignment,
and registration-safe OAuth configuration. Hosted OAuth and Dragon API behavior
remain separate live-environment checks.
