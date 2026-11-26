# Plugin schemas

## Plugin source specs

`plugin-spec.schema.json` is this project's schema for `plugins/<plugin>/spec.yaml`.
It defines per-plugin identity, presentation text, suggested prompts, and
provider-specific endpoints/public OAuth registrations (the `kimi-global` and `kimi-china` targets are URL-only: Kimi's
plugin manifest has no OAuth client or scope fields). It is a source
configuration schema, not a replacement for the published output schemas below.

`scripts/generate-types.ts` generates `lib/_generated/plugin-spec.ts` from it.
The build parses YAML with Bun and checks it against the schema with Ajv before
writing output. Unknown fields, missing required values, invalid endpoints, and
duplicate plugin names fail the build. Every non-hidden plugin directory must
have a spec; a missing spec is not silently skipped.

## Agent Plugins schema snapshots

These are unmodified, version-pinned copies of the published Agent Plugins 1.0.0
JSON Schemas linked from OpenAI's
[packaging documentation](https://developers.openai.com/plugins/build/plugins):

- [`plugin.schema.json`](agent-plugins/1.0.0/plugin.schema.json):
  https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- [`mcp.schema.json`](agent-plugins/1.0.0/mcp.schema.json):
  https://agent-plugins.org/schemas/1.0.0/mcp.schema.json

The Agent Plugins project licenses its schemas under the Apache License 2.0
([upstream licensing](https://github.com/agentplugins/agent-plugins-spec/blob/v1.0.0/LICENSE.md)).
[`agent-plugins/LICENSE`](agent-plugins/LICENSE) is a copy of that licence. It
covers these two schema files and the types generated from them,
`lib/_generated/plugin.ts` and `lib/_generated/mcp.ts`. The snapshots have the
same JSON content as the upstream `v1.0.0` files and differ only in whitespace.
Everything else in this repository is under the root [`LICENSE`](../LICENSE).

`scripts/generate-types.ts` uses `json-schema-to-typescript` to generate committed
types in `lib/_generated/`. No schema downloads are needed during generation.
Run `bun run generate:types` on its own, or `just make` to regenerate types and
build plugin bundles together. To adopt an upstream schema change, review and
update these snapshots deliberately, rebuild, and run the TypeScript check.
Do not edit generated type files by hand.

## Format boundaries

The builders use only the generated document types and emit root `plugin.json`.
OpenAI/test bundles use portable `mcp.json`; Anthropic bundles emit only native
`.mcp.json` for their MCP configuration. `kimi-global` and `kimi-china` bundles emit only `kimi.plugin.json`
(documented at https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html),
with no `$schema`, since Kimi publishes none. OpenAI presentation metadata lives under
`extensions.com.openai.interface`, not a separate top-level interface contract.
Extension contents are intentionally open-ended in the generated plugin type.
The project-owned input spec selects the metadata values the builder puts there;
it does not redefine or replace the upstream document contracts.

The pinned MCP schema supports `stdio`, `streamable-http`, and `sse`. However,
[OpenAI's authentication documentation](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication)
puts OAuth settings under each server's `extensions.com.openai.auth`, while the
published 1.0.0 MCP schema has no `extensions` property and forbids additional
server properties. The builder follows OpenAI's documented layout, combining the
generated HTTP server type with the generated plugin type's generic extension
namespace shape. It does not mutate these snapshots or add a project-owned schema.
This checks core structure in TypeScript, but the authentication extension does
not pass strict validation against the unmodified upstream MCP schema.

Registered OAuth client IDs, resource routes, and scopes are retained. Portable
OAuth callbacks are selected by the host rather than a packaged `callbackUrl`.
Host login still requires live verification against the registered callbacks.

For Claude's native installer, the Anthropic bundle retains compatibility
`.claude-plugin/plugin.json` and `.mcp.json` files projected from the same portable
identity and connection data, without parallel handwritten document types.

Types enforce structural constraints at compile time. JSON Schema constraints
such as string patterns and lengths, filesystem containment, URL semantics, and
reserved environment-variable names are not fully expressible in TypeScript.
There is no runtime schema validator for the generated plugin/MCP documents.
Runtime schema checks apply only to this project's YAML input specs.
