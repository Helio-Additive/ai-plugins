# Helio Additive AI plugins

Plugins that let AI assistants use Helio Additive's services: slice 3D models for
printing, and run Dragon thermal simulation and optimisation on G-code.

| Plugin | What it does |
| --- | --- |
| `helioadditive-slicing` | Slice a model or a 3MF project with Bambu Studio, OrcaSlicer or Snapmaker Orca, check a job, download its files, and compare print times. |
| `helioadditive-dragon` | Plan, start and check Helio Dragon Assess and Enhance runs, and download their results. |
| `scripting` | Skills only: write scripts against the Helio GraphQL API, with templates for ten languages and the full API reference. |

The slicing and Dragon plugins use your Helio account to connect to the services.
The scripting plugin contains skills and needs no MCP sign-in.

## Support matrix

| Host | Plugin or connector format | Helio MCP auth | Status |
| --- | --- | --- | --- |
| OpenAI apps / Codex | OpenAI ZIP / native Codex marketplace | Registered public OAuth client | Existing |
| Claude Code | Native Claude marketplace | Registered public OAuth client | Existing |
| [Kimi Code CLI](#kimi-code-cli) | `kimi.plugin.json`, global and mainland China bundles | Browser OAuth from a URL-only manifest | Bundled. Fresh-client sign-in needs verification in both regions. |
| [Gemini CLI](#gemini-cli) | `gemini-extension.json` | Public OAuth client with loopback redirect | Bundled. Helio callback registration pending. |
| [Gemini Enterprise](#gemini-cli) | Custom MCP data store | Confidential OAuth client with PKCE | Manual setup. Helio client registration pending. |
| [Grok Bot](#grok-bot-desktop) | Custom Remote HTTPS connector, skills added separately | Connector OAuth | Manual setup. Helio client contract pending. |
| [Grok](#grok) | Grok web custom MCP connector / xAI API remote MCP | Web connector OAuth / caller-supplied Helio token for API | Manual setup. Web OAuth contract pending. |
| [Qwen Code](#qwen-code) | `qwen-extension.json` | Public OAuth client with loopback redirect | Bundled. Helio callback registration pending. |
| [DeepSeek](#deepseek) | DeepSeek Harness MCP settings plus skills / host-managed tool calls for the API | Harness OAuth on compatible builds / host-managed Helio OAuth | Manual setup. Harness callback registration pending. |
| [Generic](#generic) | Agent Skills folders and standalone MCP config | Public OAuth client with a registered callback | Bundled. Sign-in depends on the client's OAuth support and registration. |

## Install

### Claude Code

```sh
claude plugin marketplace add Helio-Additive/ai-plugins
claude plugin install helioadditive-slicing@helioadditive-plugins
claude plugin install helioadditive-dragon@helioadditive-plugins
# Optional, skills only:
claude plugin install scripting@helioadditive-plugins
```

The Claude desktop app's **Add marketplace** dialog takes the same repository.
Start a new session (or run `/reload-plugins`), then open `/mcp` to sign in to
each Helio server.

### Codex

```sh
codex plugin marketplace add https://github.com/Helio-Additive/ai-plugins.git --ref main
codex plugin add helioadditive-slicing@helioadditive-plugins
codex plugin add helioadditive-dragon@helioadditive-plugins
# Optional, skills only:
codex plugin add scripting@helioadditive-plugins
```

To update, run `codex plugin marketplace upgrade helioadditive-plugins` and add
the plugins again. Restart Codex to load the new versions.

### Kimi Code CLI

Each plugin has a Kimi bundle: `_generated/kimi-global` worldwide and
`_generated/kimi-china` for mainland China. Clone this repository, then in Kimi
Code CLI:

```text
/plugins install /absolute/path/to/ai-plugins/plugins/slicing/_generated/kimi-global
/reload
/mcp
```

`/mcp` lists the plugin's server. Start Helio sign-in with
`/mcp-config login <server-name>`. The native bundle requires a Kimi Code CLI
version that supports `kimi.plugin.json`. See the
[Kimi plugin reference](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html).

Use `plugins/dragon/...` for Dragon. Kimi copies the plugin when it installs it,
so install it again after you pull an update. Skills are called as
`/skill:<plugin>:<skill>`.

### Gemini CLI

From a clone of this repo, install each extension you want and restart Gemini CLI.
In an interactive session, use `/skills list` to check discovery and
`/mcp auth helioadditive-slicing` to start Helio sign-in after the callback is
enabled. For Dragon, use `helioadditive-dragon`.

```sh
gemini extensions install "$PWD/plugins/slicing/_generated/gemini"
gemini extensions install "$PWD/plugins/dragon/_generated/gemini"
gemini extensions install "$PWD/plugins/scripting/_generated/gemini"
```

The extension format targets Gemini CLI. A Gemini Enterprise admin can set up a
**Custom MCP Server** data store per service once a confidential Helio client is
registered. Use the service URL, Helio authorization and token URLs, the scope
for the service, and enable PKCE. See the
[Gemini Enterprise setup guide](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server),
[Gemini CLI extension reference](https://geminicli.com/docs/extensions/reference/) and
[Gemini CLI MCP guide](https://geminicli.com/docs/tools/mcp-server/).

### Qwen Code

From a clone of this repo, install each extension you want and restart Qwen Code.
Use `/skills` to find the workflows and `/mcp auth helioadditive-slicing` to
start Helio sign-in after the callback is enabled. For Dragon, use
`helioadditive-dragon`. The default callback is for a local interactive session.

```sh
qwen extensions install "$PWD/plugins/slicing/_generated/qwen"
qwen extensions install "$PWD/plugins/dragon/_generated/qwen"
qwen extensions install "$PWD/plugins/scripting/_generated/qwen"
```

These extensions target Qwen Code. For Qwen models in another host, use that
host's [Generic setup](#generic). See the
[Qwen Code extension guide](https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/)
and [MCP guide](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/).

### Grok Bot desktop

In **Connect apps**, choose **Add a custom connector**, select **Remote HTTPS**,
and enter the name and [service URL](#generic). Repeat for each Helio service.
After Helio OAuth is enabled for this host, use the registered client details and
authenticate from the connector's page. Add the [standalone skills](#generic)
through Grok Bot's skill editor and keep their confirmation and download
instructions. Team policies can restrict custom connectors. Helio has no Grok
Bot marketplace listing. See the [connector setup](https://docs.x.ai/grok-bot/computer-and-apps)
and [skills guide](https://docs.x.ai/grok-bot/skills-routines-and-automations).

### Grok

On [Grok's connector page](https://grok.com/connectors), choose **New Connector**
→ **Custom** and enter each [service URL](#generic). A team admin may need to
provision the connector first. Complete Helio sign-in once the connector's OAuth
registration is enabled. Provide skill instructions separately in a host that
can use them. See the [Grok connector guide](https://docs.x.ai/grok/connectors)
and [team connector setup](https://docs.x.ai/grok/connector-management).

The xAI API can call remote MCP with a Helio access token obtained by your
application for the selected resource. Use `allowed_tools` to limit the exposed
tools. For a read-only slicing check, allow only `slicer_machines`. Enforce the
workflow's explicit confirmation in your application before exposing operations
that create work. See the [xAI remote MCP guide](https://docs.x.ai/developers/tools/remote-mcp).

Grok Build is a separate CLI with its own skills and MCP management. Copy the
standalone skill folders to `.grok/skills/` in your workspace and use its
[MCP setup](https://docs.x.ai/build/features/mcp-servers) with the Generic
connection details. Helio OAuth for Grok Build still needs host verification.
See the [Grok Build skill reference](https://docs.x.ai/build/features/skills-plugins-marketplaces).

### DeepSeek

DeepSeek Chat has no documented custom Helio MCP installation path. If you use
the [DeepSeek API](https://api-docs.deepseek.com/guides/tool_calls/), your
application handles function calls. Use [Generic](#generic) in an MCP-capable
host and have that host perform Helio sign-in and execute the calls.

The official DeepSeek Harness supports plugins and MCP. Copy skill folders to
`.dsh/skills/` at your workspace root. In the Web or Desktop profile's MCP
settings, add a Streamable HTTP server using the service URL below. On builds
that support the native MCP OAuth flow, use `generic-agent`, the scope matching
the service, and a unique credential key for each server. Use the authorize
action after Helio enables the Harness callback. The example below shows one
entry in the manager's `servers` map. Add it through Settings or merge it with
the existing map to preserve your other servers.

```yaml
helioadditive-slicing:
  transport: streamable-http
  url: https://mcp.helioadditive.com/slicing
  oauth:
    credentialKey: mcp-client/helioadditive-slicing
    clientId: generic-agent
    scope: slicing
```

Use the Dragon name, URL and scope for a second entry. Older Harness builds
with HTTP headers only need a host-managed OAuth connection. See the
[Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md#oauth),
[MCP manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-manager/README.md#oauth-authorization)
and [skill discovery](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md#local-discovery-priority).

### OpenAI apps

Each [release](https://github.com/Helio-Additive/ai-plugins/releases) has one ZIP
per plugin for OpenAI hosts that install plugins from a package.

### Generic

1. Clone the repo. From `plugins/<plugin>/_generated/generic/skills/`, copy each
   complete skill folder into your host's skill directory. Keep each `SKILL.md`
   and its companion files together. Scripting only needs this step.
2. Add each selected service to your host as a **Streamable HTTP** MCP server.
   Use the generated `_generated/generic/mcp.json` as a reference. If your host
   uses a different format, map the URL and transport into its settings.

   | Server name | URL and OAuth resource | Scope |
   | --- | --- | --- |
   | `helioadditive-slicing` | `https://mcp.helioadditive.com/slicing` | `slicing` |
   | `helioadditive-dragon` | `https://mcp.helioadditive.com/dragon` | `dragon` |

3. Use the host's OAuth sign-in. Helio's public client `generic-agent` uses
   authorization code with PKCE S256 and no client secret. The host must let
   you supply a public client ID and use a registered callback. For local
   clients that let you choose a callback, the existing registration includes
   `http://127.0.0.1:6276/oauth/callback`. The server advertises the Helio OAuth
   issuer and resource metadata. A host that requires dynamic client
   registration needs additional Helio support.

See [provider OAuth follow-ups](docs/provider-auth.md) for host-specific rollout
details.

## First check

After you sign in, ask: "Use Helio slicing to list the available printer
profiles. Do not create a job or upload a file." A list of printers means the
plugin is connected and signed in.

## Source and licences

The slicer engines the slicing service runs are open source. Their source,
licences and acknowledgements are listed in
[slicer-cli](https://github.com/Helio-Additive/slicer-cli/blob/main/docs/open-source.md).

## Contributing

How the plugins are built from their specs, how to test a change locally and how
releases are made: see [CONTRIBUTING.md](CONTRIBUTING.md).
