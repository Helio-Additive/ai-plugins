# Helio Additive AI plugins

Plugins that let AI assistants use Helio Additive's services: slice 3D models for
printing, and run Dragon thermal simulation and optimisation on G-code.

| Plugin | What it does |
| --- | --- |
| `helioadditive-slicing` | Slice a model or a 3MF project with Bambu Studio, OrcaSlicer or Snapmaker Orca, check a job, download its files, and compare print times. |
| `helioadditive-dragon` | Plan, start and check Helio Dragon Assess and Enhance runs, and download their results. |
| `scripting` | Skills only: write scripts against the Helio GraphQL API, with templates for ten languages and the full API reference. |

The slicing and Dragon plugins connect to Helio's services and ask you to sign in
with your Helio account the first time you use them. The scripting plugin has no
connection and needs no sign-in.

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

`/mcp` lists the plugin's server; sign in with `/mcp-config login <that name>`.

Use `plugins/dragon/...` for Dragon. Kimi copies the plugin when it installs it,
so install it again after you pull an update. Skills are called as
`/skill:<plugin>:<skill>`.

### OpenAI apps

Download one ZIP per plugin from the [latest release](https://github.com/Helio-Additive/ai-plugins/releases/latest).
Choose `<plugin>-openai-submission-<version>.zip` to upload to OpenAI.
Choose `<plugin>-codex-desktop-<version>.zip` for a desktop host using the native Codex layout.

## First check

After you sign in, ask: "Use Helio slicing to list the available printer
profiles. Do not create a job or upload a file." A list of printers means the
plugin is connected and signed in.

## Source and licences

The plugins and this repository are covered by the
[Helio AI Plugins License](LICENSE), and every plugin bundle carries a copy. In
short: you may use, copy, change and share them to work with Helio's services;
the code templates and snippets are yours to use in any project; and Helio's
hosted services stay subject to the
[Terms of Service](https://www.helioadditive.com/en-us/policies/terms). The
licence text is what applies.

The slicer engines the slicing service runs are open source. Their source,
licences and acknowledgements are listed in
[slicer-cli](https://github.com/Helio-Additive/slicer-cli/blob/main/docs/open-source.md).
Those licences cover the slicer software, not these plugins.

## Contributing

How the plugins are built from their specs, how to test a change locally and how
releases are made: see [CONTRIBUTING.md](CONTRIBUTING.md).
