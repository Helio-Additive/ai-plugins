# Maintainer instructions

This repo builds multiple plugins from shared tooling. Keep plugin-specific data
in each plugin's sources, not in the generator.

## Sources

- `plugins/<plugin>/spec.yaml`: metadata and MCP/OAuth settings, following
  `schemas/plugin-spec.schema.json`. Specs are discovered automatically.
- `plugins/<plugin>/skills/**/*.mdx`: skill sources. Preserve each plugin's
  workflow, confirmation gates, and artifact safety; keep service-specific rules here.
- Root `assets/`: shared branding. Do not add plugin-local source assets.
- `lib/build.ts`: shared generation. Use schema-generated document types from
  `lib/_generated/`; do not add handwritten document interfaces.
- Keep OpenAI metadata/auth in their documented `extensions.com.openai` locations
  and retain native Anthropic compatibility files. See `schemas/README.md` for
  schema provenance and the upstream MCP authentication-schema discrepancy.

## Generated output

- Never hand-edit `lib/_generated/` or `plugins/*/_generated/`. Run `just make`;
  commit regenerated types and production bundles with source changes.
- `GENERATE_TEST=true MCP_TEST_URL=<base URL> MCP_TEST_VENDOR=<openai|anthropic> just make` also builds Git-ignored
  test bundles, appending each spec's predefined `testPath` (`/slicing` or `/dragon`)
  with the selected vendor prefix. Never commit test bundles or redirect production to the test URL.
  Normal builds remove test output.
- Keep one root `.agents/plugins/marketplace.json`, listing each plugin's
  `./plugins/<plugin>/_generated/test` bundle.
- Root `.claude-plugin/marketplace.json` is generated from specs and lists
  `./plugins/<plugin>/_generated/test` bundles (generate with `MCP_TEST_VENDOR=anthropic` for Claude) for native Claude installation.
  Do not hand-edit it; commit it alongside regenerated production output.

## Checks and safety

After source or generator changes, run `just make`, `bun run typecheck`, and `bun run test`.
Local checks do not establish hosted OAuth or API behavior.
Preserve registered OAuth contracts and explicit consent for actions that create
work. Never invent IDs, results, or credentials, or package tokens/client secrets.
Specs currently target nightly services at `mcp3.helioadditive.com`. Do not publish
official plugins until production URLs and live authentication/workflows are verified
and publication is authorized.
