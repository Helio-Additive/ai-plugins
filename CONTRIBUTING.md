# Contributing

## Layout

- `plugins/<plugin>/spec.yaml`: the plugin's identity, presentation text and MCP
  endpoints, checked against `schemas/plugin-spec.schema.json`.
- `plugins/<plugin>/skills/**/*.mdx`: the plugin's skills.
- `plugins/<plugin>/_generated/`: build output, one bundle per host (`anthropic`,
  `codex`, `openai`, `kimi-global`, `kimi-china`). Never edit it by hand; commit it
  with the source change that produced it. `_generated/test/` is local only and
  ignored by Git.
- `assets/`: shared branding images, copied into every bundle.
- `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`: the
  Claude Code and Codex marketplaces, listing the committed bundles.
- `lib/build.ts`: finds the specs, checks them and writes the bundles.
- `lib/_generated/`: TypeScript types generated from the schemas.
- `schemas/`: the plugin-spec schema and the pinned Agent Plugins schemas (see
  `schemas/README.md`).
- `scripts/`: build entry points and opt-in host checks.
- `AGENTS.md`: instructions for coding agents working in this repository.

## Build

Install Nix and Devbox and run `devbox shell`; `devbox.json` pins Bun, Just,
Node and Make. Then:

```sh
bun install --frozen-lockfile
just make
bun run typecheck
bun run test
```

`just make` regenerates the types and every bundle. A plugin's `_generated/` is
only replaced once all of its output rendered, so a failed build leaves the last
good output in place.

## Specs

Each directory under `plugins/` holds a `spec.yaml`; the build finds them by
name, with no registry to update. A spec declares:

- `name` and `description`. The version comes from the root `package.json`.
- Optional `homepage`, an HTTPS website.
- `displayName`, `shortDescription`, `longDescription` and `defaultPrompts` for
  the OpenAI presentation.
- `mcp.openai` and `mcp.anthropic`: the HTTPS `url`, public OAuth `clientId` and
  optional `scopes`.
- `mcp.kimi-global` and `mcp.kimi-china`: the HTTPS `url` only. Kimi registers its
  own OAuth client when the user signs in, so its manifest has no client fields.
- `testPath`: the plugin's route segment for test bundles, such as `/slicing`.

Unknown fields are rejected. Never put tokens or client secrets in a spec.

To add a plugin, create `plugins/<name>/spec.yaml` and `skills/`, then add it to
the two root marketplaces.

## Test a change locally

A test build adds a `_generated/test/` bundle for one host, pointed at a service
you choose. All three variables are required:

```sh
GENERATE_TEST=true MCP_TEST_URL=https://<test-host> MCP_TEST_VENDOR=anthropic just make
```

`MCP_TEST_URL` is a base URL (HTTP or HTTPS, optional port, no path). The build
appends `/<vendor>/<testPath>`. `MCP_TEST_VENDOR` is `openai`, `anthropic`,
`kimi-global` or `kimi-china`. A normal `just make` removes the test bundle.

To build and install a test bundle in one step:

```sh
just install claude   # or: just install codex
```

It builds the test bundle for that host against `MCP_TEST_URL` (the production
service when unset), then replaces only the Helio plugins and the
`helioadditive-plugins` marketplace; it stops if that marketplace holds other
plugins. Restart the host afterwards. To keep your normal setup
untouched, set `CLAUDE_CONFIG_DIR` (Claude) or `CODEX_HOME` (Codex) to an empty
temporary folder first.

For Kimi Code CLI, install the test bundle from the TUI with
`/plugins install /absolute/path/to/plugins/<plugin>/_generated/test`.

Opt-in checks, each using temporary homes and never signing in:

- `python3 scripts/check-codex-git-install.py`: installs and upgrades the
  committed Codex packages from a local Git snapshot.
- `python3 scripts/check-codex-install.py`: the `just install codex` helper.
- `python3 scripts/check-host-parser.py` and `python3 scripts/check-host-callback.py`:
  an installed OpenAI host's MCP discovery and sign-in callback, after an `openai`
  test build.

Package and type checks do not prove that sign-in or the live tools work; try the
read-only check in the README with a real account for that.

## Release

All bundles share the root `package.json` version. Bump it, run `just make` and
commit the regenerated output. Then publish a GitHub release tagged
`v<version>`; the release workflow checks the version, builds the bundles and
uploads one OpenAI ZIP per plugin. Refresh the API schema snapshot first if it is
stale: `REFRESH_API_SCHEMA=true just make`.

To check the packages locally, run `bun scripts/package-release.ts v<version>`
after `just make`.
