# ai-plugins

Helio Additive AI plugins, with native provider marketplaces and one shared build toolchain.

## Layout

- `plugins/dragon/` — Dragon thermal workflow skills and generated bundles.
- `plugins/scripting/` — skills-only GraphQL client generation templates; no MCP or OAuth registration.
- `plugins/slicing/` — slicing plugin skills and generated bundles.
- `assets/` — shared branding images, copied into every generated bundle.
- `.agents/plugins/marketplace.json` — one local marketplace listing all plugins,
  using `./plugins/dragon/_generated/test` and
  `./plugins/slicing/_generated/test`. Generate these optional local bundles before
  installing from the marketplace. MCP plugin authentication happens on installation; scripting has no MCP authentication.
- `.claude-plugin/marketplace.json` — generated Claude Code marketplace, listing
  each plugin's Git-ignored `_generated/test` bundle (generate with vendor `anthropic`).
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

Install Nix and Devbox, then run `devbox shell` from this root. The root
`devbox.json` and `devbox.lock` pin Bun, Just, Node and Make. Inside that shell:

```sh
bun install --frozen-lockfile
just make
bun run typecheck
bun run test
```

The root package also exposes `bun run build`; `make`
is an alternative to `just make`. There are no per-plugin dependency installs.

### Local installation prerequisites

Use an existing authorized host login and Helio account, Bun, Just, and a plugin-capable
OpenAI host or Claude Code. Install dependencies with `bun install --frozen-lockfile`.
These bundles contact nightly services, even when installed from a local folder.
Do not approve new OAuth grants or unexpected permissions as part of unattended testing.

### One-command local installation

```sh
just install codex
# Or:
just install claude
```

The selected host generates Nightly test bundles at `https://mcp3.helioadditive.com`
with vendor `openai` or `anthropic`, then replaces only the two named Helio plugins
and the `helioadditive-plugins` marketplace with this checkout. Claude operations
use user scope and preserve plugin data. Unrelated marketplaces/plugins are left
alone; additional installed plugins in the Helio marketplace cause the installer to stop.
Codex reads its plugin inventory with `--marketplace helioadditive-plugins`, so an
unrelated stale marketplace does not prevent installation. It re-adds the local
marketplace idempotently; only the specific CLI error for a different existing
source triggers removal and replacement of `helioadditive-plugins`. It does not
use Codex's global marketplace inventory, which also fails on stale registrations.
Claude skips missing entries based on successful JSON inventory reads. Unexpected
CLI or parse failures stop the command. The final action installs slicing, with no trailing list.
Dependencies must already be installed. Unsupported host arguments are rejected.
Switching hosts replaces the shared test folder; restart/reload the selected host.

For isolated testing, prefix the command with
`CLAUDE_CONFIG_DIR=/private/tmp/helio-local-plugin-test` for Claude, or use a newly
created temporary `CODEX_HOME` for Codex. Do not use the normal user configuration
for automated tests. Installation may request OAuth; do not approve new grants
unattended.

Run `python3 scripts/check-codex-install.py` for the opt-in Codex installer
regression check (Python 3.11+, Bun, Just and Codex required). It uses temporary
homes and inert local plugins without MCP servers, covering fresh/repeated installs,
source replacement, stale unrelated catalogs, preservation of unrelated settings
and plugin caches, and failure cases. Its fixture build is a marker only; run
`just make`, `bun run typecheck`, and `bun run test` separately for repository checks.
CLI behavior was verified against Codex 0.167.0. If future CLI versions change
the source-conflict diagnostic, installation stops rather than guessing whether
to remove a registration. This check does not establish hosted OAuth or MCP access.

OpenAI manifests now use the coordinated Nightly client `openai-plugin`, preserving
per-plugin `slicing`/`dragon` scopes and `/openai/` resources. The local callback
remains `http://127.0.0.1/callback` with a host-selected port; the existing hosted
callback contract is `https://chatgpt.com/connector_platform_oauth_redirect`.
This repository's specs currently target Nightly even in committed production-format
bundles. Production/staging Auth retains older IDs: changing spec URLs to those
environments requires matching their client registrations, not reusing this Nightly
client blindly. Coordinated policy: [DevOps PR #4584](https://github.com/Helio-Additive/devops/pull/4584).
DevOps deployment and coordinated consumer rollout are pending;
existing Nightly OpenAI users must reconnect after the cutover. Package validation
does not establish live client registration. Claude retains `claude-plugin` and its
recorded live **Unknown client** blocker.

### Install in the OpenAI app

Generate the local bundles from this checkout first (normal builds remove them):

```sh
GENERATE_TEST=true MCP_TEST_URL=https://mcp3.helioadditive.com MCP_TEST_VENDOR=openai just make
```

1. Open the ChatGPT desktop app with this repository as the working project.
   This checkout already supplies `.agents/plugins/marketplace.json`; its plugin
   paths resolve from the repository root. If explicit registration is needed,
   run `codex plugin marketplace add "$PWD"` from this root.
2. Restart the app, open the Plugins tab / Plugins Directory, and select the
   **Helio-Additive Plugins** marketplace. Open each Helio plugin and install it.
3. Follow the host's browser authentication redirect. Review the destination and
   permissions before consenting; new persistent grants require user approval.
   Never paste credentials into chat or repository files.
4. Start a new chat and run the read-only smoke test below.

This is the app flow supported by [official packaging guidance](https://developers.openai.com/plugins/build/plugins)
and [plugin usage guidance](https://learn.chatgpt.com/docs/plugins), not a completed
local UI test. Direct inspection of the installed OpenAI app was denied by the
computer-use tool. The exact in-app marketplace-add control, install button label,
and redirect screens could not be verified; do not infer them from these steps.
Marketplace authentication is configured as `ON_INSTALL`; successful login and
MCP access still need live verification.

CLI alternative (syntax checked against installed CLI help):

```sh
codex plugin marketplace add "$PWD"
codex plugin add helioadditive-dragon@helioadditive-plugins
codex plugin add helioadditive-slicing@helioadditive-plugins
codex plugin list
```

### Install in Claude Code

From the repository root, build the bundles and add this local marketplace:

```sh
GENERATE_TEST=true MCP_TEST_URL=https://mcp3.helioadditive.com MCP_TEST_VENDOR=anthropic just make
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
`_generated/test` bundle generated with `MCP_TEST_VENDOR=anthropic`. Its only MCP configuration is `.mcp.json`; the root
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
behavior. Both root marketplaces point to `_generated/test`. The shared test folder contains
only the selected vendor's format: regenerate with `anthropic` before Claude
installation and with `openai` before OpenAI installation. Switching vendors replaces
that folder; do not run both local installations against it concurrently. A normal
build removes it, so regenerate before using either local marketplace.

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
- `testPath`, the predefined provider-neutral test route for this plugin (a single
  path segment such as `/slicing` or `/dragon`).

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

All three variables are required to opt in. Supply the base MCP URL without a route:

```sh
GENERATE_TEST=true MCP_TEST_URL=https://mcp3.helioadditive.com MCP_TEST_VENDOR=openai just make
```

This adds a vendor-specific `_generated/test/` bundle for each plugin.
The generator appends each plugin's predefined `testPath` from its spec:
Slicing uses `https://mcp3.helioadditive.com/openai/slicing` and Dragon uses
`https://mcp3.helioadditive.com/openai/dragon`. Set `MCP_TEST_VENDOR` to `openai` or `anthropic` to select both the route prefix and package format.
Anthropic test output includes `.claude-plugin/plugin.json` and `.mcp.json` with
its registered Claude client/scopes; OpenAI test output uses `.codex-plugin/plugin.json`
and its existing loopback callback configuration. Production output is unchanged. These routes are plugin-specific source data, not a mapping
hardcoded in the shared generator.

`MCP_TEST_URL` is a **base URL**, not an exact endpoint. HTTP and HTTPS are supported,
including custom ports and an optional trailing slash. Paths, queries, embedded
credentials, and URL fragments are rejected. Do not put tokens or secrets in the
URL. The test bundles inherit the selected vendor’s OAuth settings, skills, and assets; registered
client IDs and scopes remain unchanged. Production bundles retain the provider
URLs in the specs and never use this base URL. The portable format
leaves callback selection to the host; register the callback used by its connection
flow with your OAuth provider and verify login after migration.

`MCP_TEST_URL` alone does nothing. A missing, empty, or invalid base URL with
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

Local OpenAI test bundles use `.codex-plugin/plugin.json` and `.mcp.json`, without
root `plugin.json`: desktop runtime 0.166.0-alpha.5.1 otherwise loads skills but
fails to discover MCP servers. Production portable and Anthropic bundles are unchanged.
The compatibility MCP file preserves spec client IDs and scopes and requests
`http://127.0.0.1/callback`. The host selects its local port; honoring the exact
path requires issuer-response support advertised by authorization discovery.

After generating OpenAI test bundles, run `python3 scripts/check-host-parser.py`
for an isolated installed-host discovery check (no login, installation or tool calls).
Set `HELIO_HOST_BINARY` to override the desktop binary location. Missing binaries
exit 77 with UNAVAILABLE; normal unit tests alone do not establish host compatibility.

Run `python3 scripts/check-host-callback.py` after generating OpenAI test output.
This opt-in offline regression installs copied fixtures only in temporary homes and
uses a loopback mock with captured Nightly discovery metadata (2026-11-07).
With issuer-response support true, the explicit legacy callback preserves exact
`/callback` with a dynamic port. Missing/false issuer support retains a suffix.
The check requires the installed host and permission to bind a loopback listener;
a missing host exits 77. It never completes authorization or issues tokens/grants.

### Read-only smoke test and troubleshooting

After authentication, ask: “Use Helio slicing to list available printer profiles
only. Do not create a job, upload a file, or start slicing.” A successful profile
response establishes authenticated read access; skill discovery alone does not.
For Claude, `/mcp` is the interactive connection entrypoint; inspect the server and
follow its authentication prompt. Stop before granting new access unless approved.

- Missing OpenAI MCP servers: regenerate test bundles and run
  `python3 scripts/check-host-parser.py`; verify the marketplace points to this
  checkout and `_generated/test` exists. Normal builds delete those directories.
- Claude already has `helioadditive-plugins`: `claude plugin marketplace list`
  distinguishes a Git source from this local directory. Do not replace an existing
  marketplace blindly. Test independently with `CLAUDE_CONFIG_DIR` pointing to a
  temporary directory; prefix **every** marketplace/install/list command with it.
  This isolates host configuration and does not reuse the existing OAuth login.
- `ENOTFOUND mcp3.helioadditive.com` means DNS resolution failed before OAuth.
  Compare a supported escalated read-only host check before diagnosing service
  DNS: this test failed in the sandbox but reached the service when escalated.
  Do not change network/security settings or bypass an escalation denial.
- Validation can pass while reporting missing license/privacy metadata for public
  directory submission. Local installation does not establish publication readiness.

### Local verification record (2026-11-07)

Baseline: `899411e` (merged discovery/authentication PR #6); production bundles
were retained. Claude Code 2.1.319 successfully added this worktree marketplace
and installed both plugins in `/private/tmp/helio-local-plugin-test` using
`CLAUDE_CONFIG_DIR`. `plugin list` showed both enabled and read from this checkout's
Anthropic directories. Both bundles passed `claude plugin validate <path> --strict`;
the root marketplace passed validation. Existing user plugins were already enabled
from a Git marketplace and were left unchanged.

The default sandbox's Claude health checks returned `ENOTFOUND` for the nightly
Anthropic endpoints. Follow-up default-context `curl -I` requests reached both
`https://mcp3.helioadditive.com/anthropic/slicing` and `/anthropic/dragon`, returning
HTTP 401 with protected-resource metadata challenges. A supported escalated
`claude mcp get plugin:helioadditive-slicing:helioadditive-slicing` reached slicing
and reported **Needs authentication**. The equivalent escalated Dragon check
also reported **Needs authentication**. This is execution-context-dependent network
behavior, not evidence of a service DNS outage. No network settings were changed.

No OAuth consent, authenticated tool discovery, or read-only profile call was
completed. The next user step is to open Claude's `/mcp` and review authentication
for the Helio server. Public client `claude-plugin` requests `slicing` or `dragon`
respectively against the nightly service. No consent screen was reached, so the
exact authorization destination and displayed permissions remain unverified;
stop there for user approval before establishing a new persistent grant.
OpenAI CLI syntax was checked; desktop installation and live authentication were
not tested because direct app inspection was denied by the computer-use tool.

Follow-up local marketplace correction: both root catalogs now reference test folders.
After generating with `MCP_TEST_VENDOR=anthropic`, both plugins were reinstalled in
`CLAUDE_CONFIG_DIR=/private/tmp/helio-local-plugin-test` from this worktree. This
checks local package installation only; it does not establish authenticated access.

Latest manual authentication evidence (2026-11-07): the browser authorization
request reached `https://auth3.helioadditive.com/oauth/authorize` with client
`claude-plugin`, scope `slicing`, resource
`https://mcp3.helioadditive.com/anthropic/slicing`, and a dynamic
`http://localhost:<port>/callback`. Auth displayed **Unknown client**. This confirms
the expected client ID is sent, but the live authorization server did not recognize
it for that request. The intended registration described above is not verified as
active. An earlier request using `generic-agent` instead displayed **Invalid redirect
URI**; switching back to that client is not an established fix. Read-only inspection
of the deployed Auth client registry/configuration is needed next. Registration or
policy changes and deployment require separate authorization. Consent, callback
acceptance, token exchange, and authenticated tool access remain unverified.

Installer coverage: the full Claude replacement command passed in an isolated
configuration. Codex 0.167.0 passed the isolated installer regression above using
inert local fixtures, including the reported stale `helio-devops` failure and
repeated installations. Unit tests cover sequencing and command failures for both
hosts. Authenticated end-to-end access remains unverified.

Scripting uses `skills/graphql-scripting/SKILL.mdx` as its discoverable entrypoint;
MDX supporting templates become Markdown in generated bundles. Its schema workflow
uses a validated SDL snapshot with explicit freshness metadata. Local marketplace generation still
uses the existing vendor test-build flags, but scripting emits no MCP files.

The existing `just install` helper continues to manage Dragon and Slicing only.
Scripting is listed in the marketplaces for explicit host installation; the helper
will refuse marketplace replacement when additional installed plugins are present.

Scripting templates cover TypeScript, Python, Rust, C++, Ruby, Go, Java, Kotlin,
Swift (macOS) and C#. The entrypoint links each language recipe and explains
schema refresh, code generation, runtime authentication and execution.

Scripting’s `SKILL.mdx` is a build-time composition entrypoint. Its MDX code discovers the template directory tree and inlines each current
template file directly, without a separate rendering helper. Add or edit template files and run `just make`;
there is no hand-maintained language index or copied template content in the entrypoint.

The `helio-api-schema` skill traverses `schema.graphqls` into native Markdown
sections for operations, fields, arguments and schema types. Refresh its validated
Hive snapshot with `REFRESH_API_SCHEMA=true just make`; ordinary builds verify the
recorded SHA-256 and reject snapshots older than seven days. Rendering and refresh
logic live in `plugins/scripting/skills/api-schema/SKILL.mdx`. No API mutation is used.

