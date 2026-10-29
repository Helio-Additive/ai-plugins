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
- `vendors/anthropic/` contains shared skill Markdown, ready for provider metadata
  to be added later.

The Jsonnet templates generate the OpenAI package directly. The MCP configuration
uses `type: "http"`, the registered OAuth client ID, and
`http://127.0.0.1/callback`. Resource paths in `.codex-plugin/plugin.json` are
relative to the `vendors/openai/` package root.

The local marketplace at `.agents/plugins/marketplace.json` points to
`vendors/openai/`.

Treat these provider directories as build output: each build replaces them and
removes stale files. Compilation errors leave the existing packages intact.
Commit the shared sources and generated packages together, and rebuild before
refreshing or reinstalling a plugin. Run `make` directly if Just is unavailable.

`just validate` checks the plugin name against its local marketplace entry,
checks packaged onboarding, branding, and OAuth configuration, and rejects
symlinks or MDX/Jsonnet source files anywhere in the generated packages. It exits
with a nonzero status when a check fails.
