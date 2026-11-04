# plugin-dragon

Multi-provider plugin package for the guided Helio Dragon workflow. Dragon
prepares G-code for a standard thermal assessment or enhancement, starts only
confirmed plans, reports server-derived status, and downloads ready artifacts
without replacing source G-code.

Caller context labels (`SLICE`, `PARSED_GCODE`, and `USER`) describe where the
client obtained a value; they do not prove it. The MCP verifies exact catalog
IDs and registered G-code mappings. Agents obtain run facts from existing
slicer/reader output or explicit user input, never by inventing values or by
adding a local G-code parser.

Assess can omit slice statistics and environment details and use backend
defaults. An explicit environment override requires the original slot-0
first-layer bed temperature and known original chamber mode. Enhance requires
an object-layer count from an existing slicer/reader or the user; it defaults
to layers 2 through that count. Speed/flow bounds are required only for an
explicit or forced advanced limit mode; timing statistics are optional and
support estimates only.

Use `dragon_catalog` for Dragon printer and material discovery. Supply required
`resource` as `printers` or `materials`; `page` defaults to 1 and `page_size`
to 100 (with a maximum of 100). Follow `resource.pageInfo.hasNextPage` and use
the returned ID, name, Bambu Studio alternative names, and current metadata.
Do not invent a fuzzy matcher. Legacy catalog tools remain available for
compatibility, but their expanded fields are not a discovery contract.

## Repository layout

- `plugin.jsonnet` defines shared identity and provider manifests.
- `mcp.jsonnet` defines provider/environment-specific Dragon HTTP connections.
- `skills/<skill>/SKILL.mdx` contains the six shared skill sources.
- `assets/` contains shared branding images. `logo.png` also supplies
  `icon.png` unless a separate icon is added.
- `vendors/` contains generated provider packages and is committed with its
  sources.
- `.agents/plugins/marketplace.json` exposes `vendors/localhost/nightly` to the local
  marketplace.

All five bundles are self-contained, with a provider manifest, MCP configuration,
assets, and all six rendered skills:

| Install directory | Provider | MCP resource |
| --- | --- | --- |
| `vendors/localhost/nightly` | OpenAI-compatible local install | `https://mcp3.helioadditive.com/openai/dragon` |
| `vendors/localhost/staging` | OpenAI-compatible local install | `https://mcp2.helioadditive.com/openai/dragon` |
| `vendors/localhost/production` | OpenAI-compatible local install | `https://mcp.helioadditive.com/openai/dragon` |
| `vendors/openai` | OpenAI production | `https://mcp.helioadditive.com/openai/dragon` |
| `vendors/anthropic` | Anthropic production | `https://mcp.helioadditive.com/dragon` |

`localhost` describes local installation, not a local MCP server. Select the
desired bundle in the host's local-plugin installation flow; the marketplace
selects nightly. OpenAI manifests live in `.codex-plugin/plugin.json`, and the
Anthropic manifest lives in `.claude-plugin/plugin.json` with conventional
`skills/` and `.mcp.json` discovery. Production provider packages never use nightly.
The host handles OAuth at installation. `setup` remains optional troubleshooting;
there is no mandatory extra onboarding login or OpenAI `onboardingSkill` hook.

## Build and validate

Install Bun, Just, and the [Jsonnet CLI](https://jsonnet.org/learning/getting_started.html),
then run:

```sh
bun install
just make
just validate
```

`just make` renders Jsonnet and MDX into `vendors/`. It first renders into a
temporary `.cache/` staging directory, so a rendering error leaves the prior
generated packages intact. A successful build replaces each generated provider
directory and removes stale files. Commit changes to shared sources and their
generated `vendors/` outputs together.

`just validate` runs environment/OAuth regression tests and verifies the marketplace
path, generated resources, all six skills in every bundle, assets, and exact OAuth
contracts. It rejects symlinks and source MDX/Jsonnet files in generated output,
checks source/output freshness, and exercises the streaming download helper with
mocked network input. `bunx --no-install tsc --noEmit` checks TypeScript when installed.

## Hosting and authentication status

Generation of nightly, staging, and production packages is not a claim that any
environment is activated or hosted login is qualified. Discover authorization
endpoints from each selected MCP resource's OAuth metadata; do not hardcode
authorization/token URLs or substitute credentials.

Gateway and Auth integration are managed in their respective repositories.
The Dragon gateway must verify JWT issuer, resource audience, scope, and allowed tools, then forward the
original validated token. MCP forwards it unchanged to the API. Dragon's internal
authentication middleware must accept the caller's token and return the canonical
account identity across the workflow. Services retain subscription and resource
access checks. No token conversion or replacement credential belongs here.

Each plugin has its own host authentication flow. Token reuse across services
depends on both scope and audience policies; it is not guaranteed by a shared
login or scope. OpenAI-compatible bundles match the registration contract in
[DevOps proposal #4416](https://github.com/Helio-Additive/devops/pull/4416):
`openai-dragon-plugin`, scope `dragon`, callback `http://127.0.0.1/callback`.
The general Anthropic route uses existing `generic-agent` with scope `dragon`;
Claude Code pins it as `oauth.scopes: "dragon"` (OpenAI uses top-level
`scopes: ["dragon"]`). The matching resource/scope authorization must be deployed in Auth. Each selected
MCP route is its own resource. Parent
[context #1490](https://github.com/Helio-Additive/context/issues/1490) coordinates
the matching nightly registration, gateway routes/discovery, caller-token API
acceptance, and durable MCP run-store/single-owner prerequisites.
Staging and production activation remain separate deployment work.
Keep Jsonnet as the source for generated provider configuration, following
`plugin-slicing`; do not edit generated connections directly.

The validator checks package structure and client/scope configuration; it does
not verify registration or host login. Do not add personal access tokens to
skills or package configuration. Activation depends on the shared authentication
middleware and matching gateway configuration owned by the infrastructure and
service maintainers. Separate Dragon-only service adapters are not a package
dependency. Shared upload authentication must support both slicing and Dragon.

After gateway wiring is available, verify existing slicing uploads and actual
Dragon host login, prepare, start, status polling, stop, and artifact download.
Local package validation alone does not establish hosted OAuth or API acceptance.
