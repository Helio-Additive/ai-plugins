# plugin-slicing
🔌 A multi LLM provider plugin for slicing

Edit the shared sources at the repository root:

- `plugin.jsonnet` defines the plugin metadata and branding paths.
- `mcp.jsonnet` defines the MCP server and OAuth settings.
- `skills/<skill>/SKILL.mdx` contains skill instructions.
- `assets/` contains branding images. `logo.png` also supplies `icon.png` unless
  you add a separate `icon.png`. `logo-dark.png` supplies the dark-theme logo
  and composer icon.

Install Bun, Just, and the [Jsonnet CLI](https://jsonnet.org/learning/getting_started.html),
then run:

```sh
bun install
just make
just validate
```

`just make` runs the root `Makefile`. The build evaluates the Jsonnet templates
and uses Bun's `mdx-to-md` package to render the MDX sources recursively,
preserving YAML frontmatter. Imported MDX components and data are evaluated on
every build. Markdown is written directly into the generated plugin packages;
`skills/` contains only source files.

Generated packages contain regular files, including copied branding assets:

- `vendors/openai/` contains the OpenAI manifest at
  `.codex-plugin/plugin.json`, `.mcp.json`, and skill Markdown.
- `vendors/anthropic/` contains a Claude plugin manifest, `.mcp.json`, and shared skills.
- `vendors/localhost/nightly/`, `vendors/localhost/staging/`, and
  `vendors/localhost/production/` contain locally installed OpenAI-compatible
  packages targeting the corresponding hosted environments.
- `vendors/orbstack/` contains the OpenAI package for local Kubernetes testing, pointing to
  `https://mcp.helio-local.svc.cluster.local:8444/openai/slicing`.

The Jsonnet templates generate the OpenAI package directly. The MCP configuration
uses `type: "http"`, the registered OAuth client ID, and
`http://127.0.0.1/callback`. Resource paths in `.codex-plugin/plugin.json` are
relative to the `vendors/openai/` package root.

The local marketplace at `.agents/plugins/marketplace.json` deliberately points to
`./vendors/localhost/nightly` for team testing. Here `localhost` means a plugin
bundle loaded from this repository, not a backend running on the developer's
machine. Each environment directory is a complete package with its own manifest,
skills, assets, and MCP configuration. The host handles OAuth during installation
(`ON_INSTALL`); there is no separate setup skill or additional login step.

| Hosted package | MCP endpoint | Discovered auth issuer |
| --- | --- | --- |
| `vendors/localhost/nightly/` | `https://mcp3.helioadditive.com/openai/slicing` | `https://auth3.helioadditive.com` |
| `vendors/localhost/staging/` | `https://mcp2.helioadditive.com/openai/slicing` | `https://auth2.helioadditive.com` |
| `vendors/localhost/production/` | `https://mcp.helioadditive.com/openai/slicing` | `https://auth.helioadditive.com` |

The OpenAI and Anthropic submission packages still use `https://mcp.helioadditive.com`;
OAuth endpoints are discovered from that server and must use `https://auth.helioadditive.com`.
Use `vendors/orbstack/` explicitly for local-backend tests; it replaces the former
package at the `vendors/localhost/` root and is not selected by the marketplace.
Those tests use OrbStack's LoadBalancer Service DNS and the devops `local-tls` proxy with an
mkcert-trusted certificate. The issuer is
`https://auth.helio-local.svc.cluster.local:8443`; the same names resolve from the
host and Pods after the Services are deployed. Run the devops root `just localhost`
helper to install local CA trust and deploy the proxy. No port-forward or
`/etc/hosts` edits are needed. Restart the plugin host after installing the CA.
The HTTP loopback OAuth callback stays unchanged; only the remote auth/MCP
endpoints require HTTPS. No token or client secret is packaged. Production OAuth
discovery and provider installation must be tested before submission.

Treat these provider directories as build output: each build replaces them and
removes stale files. Compilation errors leave the existing packages intact.
Commit the shared sources and generated packages together, and rebuild before
refreshing or reinstalling a plugin. Run `make` directly if Just is unavailable.

`just validate` checks the plugin name against its local marketplace entry,
checks installation-time authentication, packaged skills, branding, and OAuth configuration, and rejects
symlinks or MDX/Jsonnet source files anywhere in the generated packages. It exits
with a nonzero status when a check fails.
