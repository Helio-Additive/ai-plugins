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
  and retain native Anthropic compatibility files. The `kimi-global`
  (`helioadditive.com`) and `kimi-china` (`helioam.cn`) vendors emit only Kimi's native
  `kimi.plugin.json` into `_generated/kimi-global/` and `_generated/kimi-china/`; Kimi manifests
  have no OAuth client/scope fields, so `mcp.kimi-global` and `mcp.kimi-china` are URL-only.
  Do not add `clientId`/`scopes` for Kimi, and do not reintroduce a single `kimi` vendor. See `schemas/README.md` for
  schema provenance and the upstream MCP authentication-schema discrepancy.

## Generated output

- Never hand-edit `lib/_generated/` or `plugins/*/_generated/`. Run `just make`;
  commit regenerated types and production bundles with source changes.
- `GENERATE_TEST=true MCP_TEST_URL=<base URL> MCP_TEST_VENDOR=<openai|anthropic> just make` also builds Git-ignored
  test bundles, appending each spec's predefined `testPath` (`/slicing` or `/dragon`)
  with the selected vendor prefix (`openai`, `anthropic`, `kimi-global`, or `kimi-china`; both Kimi ids use the `/kimi` route prefix). Never commit test bundles or redirect production to the test URL.
  Normal builds remove test output.
- Keep the root `.agents/plugins/marketplace.json` Git-installable, listing each
  committed `./plugins/<plugin>/_generated/codex` bundle. Native Codex packages
  use the declared OpenAI endpoint/OAuth settings and are independent of test flags.
- Preserve local/test installation through the ignored `.cache/codex-local-marketplace`.
  OpenAI test builds copy the test packages into this self-contained catalog;
  the default local Codex installer copies the native production packages here. Other builds remove it. Never commit this catalog or its packages.
  `just install codex` uses this catalog; `just install claude` keeps its existing root catalog.
- Keep the root `.claude-plugin/marketplace.json` Git-installable, listing each
  committed `./plugins/<plugin>/_generated/anthropic` bundle. Preserve local/test
  installation through the ignored `.cache/claude-local-marketplace` (generated with
  `MCP_TEST_VENDOR=anthropic`), as for Codex. Do not hand-edit either; commit the root
  catalog alongside regenerated production output and never commit the local one.

## Checks and safety

After source or generator changes, run `just make`, `bun run typecheck`, and `bun run test`.
Local checks do not establish hosted OAuth or API behavior.
Preserve registered OAuth contracts and explicit consent for actions that create
work. Never invent IDs, results, or credentials, or package tokens/client secrets.
OpenAI and Codex use the product-specific host declared in each spec. Claude and Kimi Global use `mcp.helioadditive.com`, and Kimi China uses its regional host. Do not publish
official plugins until production URLs and live authentication/workflows are verified
and publication is authorized.
