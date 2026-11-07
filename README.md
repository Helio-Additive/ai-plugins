# ai-plugins

Helio Additive AI plugins, with native provider marketplaces and one shared build toolchain.

## Layout

- `plugins/dragon/` — Dragon thermal workflow skills and generated bundles.
- `plugins/slicing/` — slicing plugin skills and generated bundles.
- `assets/` — shared branding images, copied into every generated bundle.
- `.agents/plugins/marketplace.json` — one local marketplace listing both plugins,
  using `./plugins/dragon/_generated/test` and
  `./plugins/slicing/_generated/test`. Generate these optional local bundles before
  installing from the marketplace. Authentication happens on installation.
- `.claude-plugin/marketplace.json` — generated Claude Code marketplace, listing
  each plugin's committed `_generated/anthropic` bundle.
- `lib/build.ts` — discovers YAML specs, checks build inputs, and generates bundles.
- `lib/_generated/` — schema-generated document and plugin-spec types.
- `schemas/` — the plugin-spec schema and pinned published Agent Plugins schemas.
- `scripts/` — root build and type-generation entrypoints.
- `AGENTS.md` — repository-wide maintainer instructions.
- `package.json`, `bun.lock`, `tsconfig.json`, `Makefile`, and `justfile` — root tooling.

Plugin metadata and MCP/OAuth settings live in each `plugins/<plugin>/spec.yaml`,
checked against `schemas/plugin-spec.schema.json` before any output is replaced.
Each plugin owns its `skills/**/*.mdx`; branding
assets live only in root `assets/` and are copied into generated packages.
All files under a plugin's `_generated/` are generated build output; do not edit
them directly. Production bundles are committed; `_generated/test/` is Git-ignored.

## Generate both plugins

Install [Bun](https://bun.sh) and [Just](https://just.systems). From this root:

```sh
bun install --frozen-lockfile
just make
bun run typecheck
bun run test
```

The root package also exposes `bun run build`; `make`
is an alternative to `just make`. There are no per-plugin dependency installs.

### Install in Claude Code

From the repository root, build the bundles and add this local marketplace:

```sh
just make
claude plugin marketplace add ./
claude plugin install helioadditive-dragon@helioadditive-plugins
claude plugin install helioadditive-slicing@helioadditive-plugins
claude plugin list
```

These commands register the marketplace and install the plugins in your user
settings. Start a new Claude Code session, or run `/reload-plugins` in an existing
one, then use `/mcp` to connect and authenticate each server. Use the host's OAuth
flow; no token or client secret belongs in this repository.

Claude loads `.claude-plugin/plugin.json`, `.mcp.json`, and `skills/` from each
`_generated/anthropic` bundle. Its only MCP configuration is `.mcp.json`; the root
portable manifest is not the native Claude entrypoint. Both plugins use the
dedicated public `claude-plugin` client; Dragon explicitly requests scope `dragon`
and slicing explicitly requests scope `slicing`. That client is restricted to the
two nightly `/anthropic/` resources, separate from generic clients and OpenAI.

The matching nightly Auth registration permits Claude's hosted callback
`https://claude.ai/api/mcp/auth_callback` and Claude Code's
`http://localhost:<port>/callback`. Auth's `http://localhost/callback` loopback
template permits a variable port while keeping the literal host and path fixed.
No fixed callback port or client secret needs to be packaged. Deploy and reload
that Auth policy and the matching gateway client metadata before using these builds;
existing installations must re-authenticate to use the new client.

To inspect the installed components without asking the model to run a workflow:

```sh
claude plugin details helioadditive-dragon
claude plugin details helioadditive-slicing
```

You can check the packages and catalog without installing them:

```sh
claude plugin validate plugins/dragon/_generated/anthropic --strict
claude plugin validate plugins/slicing/_generated/anthropic --strict
claude plugin validate . --strict
```

Normal installation and public-directory submission are different checks. License,
privacy-policy, and other directory-review requirements must be resolved before
public submission; local installation does not establish approval or live OAuth/API
behavior. Claude's marketplace always uses the committed Anthropic bundles, not
the opt-in OpenAI `_generated/test` bundles.

### Schema-generated types

`just make` regenerates TypeScript types from the pinned Agent Plugins 1.0.0
schemas and the project-owned plugin-spec schema before building bundles.
Run `bun run generate:types` to regenerate only
the types. This is an offline step after installing dependencies.

The builders import `AgentPluginsManifest` from `lib/_generated/plugin.ts` and
`AgentPluginsMCPConfiguration` from `lib/_generated/mcp.ts` directly and construct
documents with `satisfies`. There are no handwritten manifest, MCP, or presentation
interfaces. Plugin inputs use `PluginSpec`, generated from `schemas/plugin-spec.schema.json`.

### Per-plugin specs

Each non-hidden directory immediately under `plugins/` must contain `spec.yaml`.
The build discovers these directories in name order; there is no TypeScript registry
to update. Each spec declares:

- `name`, `version`, and `description` for portable identity.
- `displayName`, `shortDescription`, `longDescription`, and `defaultPrompts` for
  OpenAI's presentation extension.
- `mcp.openai` and `mcp.anthropic`, each containing an HTTPS `url`, public OAuth
  `clientId`, and optional `scopes`. Omitted scopes preserve provider defaults.

The YAML files include a language-server schema comment for editor support. The
build also validates the parsed YAML against that schema using Ajv, rejects
duplicate plugin names and invalid endpoints, and reports the offending spec.
Unknown fields are rejected, so misspellings cannot silently change defaults.
Do not store tokens or client secrets in a spec.

Every bundle has root `plugin.json`. OpenAI and test bundles use `mcp.json`;
Anthropic bundles use only the native `.mcp.json`. OpenAI presentation metadata
is under `plugin.json`'s `extensions.com.openai.interface`; skills are discovered
from `skills/` without a manifest path override. MCP uses `streamable-http` with
OAuth under each server's `extensions.com.openai.auth`, following OpenAI's docs.
The Anthropic bundle retains `.claude-plugin/plugin.json` for its native installer,
with native files projected from the shared definitions.

The published MCP schema currently omits server-level `extensions` even though
OpenAI documents that authentication layout. The builder uses the generated MCP
core plus the generated plugin's generic extension-object shape; it does not patch
the schema or claim those extra server fields pass strict 1.0.0 schema validation.
See `schemas/README.md` for source URLs and this upstream discrepancy.

The generator builds JSON from TypeScript, converts MDX to Markdown while retaining skill
frontmatter, and copies assets into each provider bundle. Normal builds generate
only `openai` and `anthropic`, using the endpoints and OAuth settings in each spec.
**Both plugins currently target nightly services at `https://mcp3.helioadditive.com`**
for testing. Their provider-specific route paths and registered clients/scopes are
preserved: `/openai/<plugin>` for OpenAI and `/anthropic/<plugin>` for Anthropic.
The matching gateway routes and OAuth resource registrations must be deployed
before testing the new Anthropic paths. Before official publication, update the spec URLs to the production
services, regenerate, and verify live authentication and tool workflows. These
nightly-targeted bundles are not an official production release.
The former `localhost` and `orbstack` bundles are no longer generated.

### Optional local test bundle

Opt in to test bundles using each plugin's `mcp.openai.url` from its spec:

```sh
GENERATE_TEST=true just make
```

This adds a complete OpenAI-compatible `_generated/test/` bundle for each plugin.
With the current specs, Slicing uses `https://mcp3.helioadditive.com/openai/slicing`
and Dragon uses `https://mcp3.helioadditive.com/openai/dragon`. The test bundles
inherit the OpenAI OAuth settings, skills, and assets as well as the endpoints.

For a custom server, optionally supply an exact endpoint override:

```sh
GENERATE_TEST=true MCP_TEST_URL=https://test.example.invalid/mcp just make
```

`MCP_TEST_URL` is the **exact endpoint**, used unchanged for both plugins; no plugin
path is appended. A bare host deliberately overrides both URLs with that bare host;
omit the variable to retain the per-plugin OpenAI routes. HTTP and HTTPS
URLs are supported, but embedded credentials and URL fragments are rejected. Do not
put tokens or secrets in the URL. The normal OAuth client IDs and scopes remain
unchanged, and production bundles never use this override. The portable format
leaves callback selection to the host; register the callback used by its connection
flow with your OAuth provider and verify login after migration.

`MCP_TEST_URL` alone does nothing. An explicitly empty or invalid override with
`GENERATE_TEST=true` fails before any output is replaced. A normal `just make`
removes any previous test bundle. Test output is Git-ignored and must not be committed.

Each plugin is fully rendered before its `_generated/` directory is replaced, so a
rendering error preserves that plugin's previous outputs. Successful builds
remove all stale files and bundles inside `_generated/`. Commit source changes and
regenerated production outputs together, never local test output.

To add another plugin, create `plugins/<name>/spec.yaml` and `skills/`, reuse root
`assets/`, and add its OpenAI marketplace entry. The Claude marketplace entry is
generated automatically from the spec.
The shared generator discovers the new spec automatically; there are no per-plugin
scripts, TypeScript configuration modules, or Jsonnet dependencies.

Build and TypeScript checks do not establish hosted
OAuth login or live MCP/API behavior.
