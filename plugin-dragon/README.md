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

- `plugin.jsonnet` defines OpenAI plugin metadata and branding paths.
- `mcp.jsonnet` defines the Dragon HTTP server connection.
- `skills/<skill>/SKILL.mdx` contains the six shared skill sources.
- `assets/` contains shared branding images. `logo.png` also supplies
  `icon.png` unless a separate icon is added.
- `vendors/` contains generated provider packages and is committed with its
  sources.
- `.agents/plugins/marketplace.json` exposes `vendors/openai` to the local
  marketplace.

`vendors/openai/` contains the OpenAI manifest, MCP configuration, assets, and
rendered skill Markdown. `vendors/anthropic/` intentionally contains shared
rendered skills only, matching the reference package; it does not yet define an
Anthropic provider manifest or connection configuration.

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

`just validate` verifies the marketplace path, generated resources, all six
skills for both provider packages, asset paths, and the OAuth safety contract.
It rejects symlinks and source MDX/Jsonnet files in generated output.

## Hosting and authentication status

The proposed endpoint is `https://mcp3.helioadditive.com/openai/dragon` with a
loopback callback URL. That route and its protected-resource endpoint returned
404 on 2026-10-30; hosted Dragon login is not qualified.

Gateway and Auth integration are managed in their respective repositories.
The slicing gateway verifies JWT issuer, resource audience, scope, and allowed tools, then forwards the
original validated token. MCP forwards it unchanged to the API. Dragon's internal
authentication middleware must accept the caller's token and return the canonical
account identity across the workflow. Services retain subscription and resource
access checks. No token conversion or replacement credential belongs here.

Each plugin has its own host authentication flow. Token reuse across services
depends on both scope and audience policies; it is not guaranteed by a shared
login or scope. The connection now matches the companion DevOps draft:
`openai-dragon-plugin`, scope `dragon`, and the Dragon route as token audience.
These are proposed configuration changes, not a claim of deployed registration.
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
