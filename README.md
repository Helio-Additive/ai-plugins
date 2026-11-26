# Helio Additive AI plugins

Plugins that let AI assistants use Helio Additive's services: slice 3D models for
printing, and run Dragon thermal simulation and optimisation on G-code.

| Plugin | What it does |
| --- | --- |
| `helioadditive-slicing` | Slice a model or a 3MF project with Bambu Studio, OrcaSlicer or Snapmaker Orca, check a job, download its files, and compare print times. |
| `helioadditive-dragon` | Plan, start and check Helio Dragon Assess and Enhance runs, and download their results. |
| `scripting` | Write scripts against the Helio GraphQL API, with templates for ten languages and the full API reference. |

The slicing and Dragon plugins connect to Helio's services and ask you to sign in
with your Helio account the first time you use them. Scripting's two skills and ten
language templates work locally. Its OpenAI and Codex packages also declare a
dedicated MCP endpoint. Claude and Kimi use the standalone skills.

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
# Optional scripting plugin:
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

`/mcp` lists the plugin's server; sign in with `/mcp-config login <that name>`.

Use `plugins/dragon/...` for Dragon. Kimi copies the plugin when it installs it,
so install it again after you pull an update. Skills are called as
`/skill:<plugin>:<skill>`.

### OpenAI apps

Download one ZIP per plugin from the [latest release](https://github.com/Helio-Additive/ai-plugins/releases/latest).
The dedicated-host build creates three `<plugin>-openai-submission-<version>.zip` files, one per directory entry. See the [submission checklist](docs/openai-review/README.md) for live verification status.
Choose `<plugin>-codex-desktop-<version>.zip` for a desktop host using the native Codex layout.

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
