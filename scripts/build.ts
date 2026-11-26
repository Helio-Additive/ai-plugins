import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildPlugin, loadPluginSpecs, readBuildOptions, root } from "../lib/build";

const options = readBuildOptions(process.env);
const plugins = await loadPluginSpecs();
for (const { source, spec } of plugins) {
  await buildPlugin(spec, source, options);
}

// Claude uses its own catalog format and discovers it at this fixed root path.
// The root catalog is Git-installable: it lists the committed anthropic bundles,
// so `claude plugin marketplace add Helio-Additive/ai-plugins` resolves on a
// fresh clone. Local test bundles get their own ignored catalog below.
const claudeCatalog = (bundleOf: (source: string, name: string) => string) => ({
  name: "helioadditive-plugins",
  owner: { name: "Helio-Additive" },
  description: "Helio Additive thermal analysis and slicing plugins.",
  plugins: plugins.map(({ source, spec }) => ({
    name: spec.name,
    source: bundleOf(source, spec.name),
    description: spec.description,
    category: "Productivity",
  })),
});
const marketplaceDirectory = join(root, ".claude-plugin");
await mkdir(marketplaceDirectory, { recursive: true });
await writeFile(join(marketplaceDirectory, "marketplace.json"), JSON.stringify(claudeCatalog(
  (source) => `./${relative(root, join(source, "_generated", "anthropic")).split(sep).join("/")}`,
), null, 2) + "\n");

// The local Claude catalog, like the Codex one below: self-contained and
// ignored, so a test URL never reaches the committed catalog.
const localClaudeRoot = join(root, ".cache", "claude-local-marketplace");
await rm(localClaudeRoot, { recursive: true, force: true });
if (options.testUrl !== undefined && options.testVendor === "anthropic") {
  for (const { source, spec } of plugins) {
    await cp(join(source, "_generated", "test"), join(localClaudeRoot, "plugins", spec.name), { recursive: true });
  }
  const catalogDirectory = join(localClaudeRoot, ".claude-plugin");
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(join(catalogDirectory, "marketplace.json"), JSON.stringify(claudeCatalog(
    (_source, name) => `./plugins/${name}`,
  ), null, 2) + "\n");
}

// Codex requires plugin paths to stay inside the marketplace root. Keep a
// self-contained, ignored local catalog so Git packages never select test URLs.
const localCodexRoot = join(root, ".cache", "codex-local-marketplace");
await rm(localCodexRoot, { recursive: true, force: true });
const codexBundle = options.testVendor === "openai" ? "test"
  : !options.testVendor && process.env.LOCAL_CODEX_CATALOG === "true" ? "codex" : undefined;
if (codexBundle) {
  const catalog = await Bun.file(join(root, ".agents", "plugins", "marketplace.json")).json();
  for (const { source, spec } of plugins) {
    await cp(join(source, "_generated", codexBundle), join(localCodexRoot, "plugins", spec.name), { recursive: true });
  }
  for (const entry of catalog.plugins) {
    entry.source.path = `./plugins/${entry.name}`;
  }
  const catalogDirectory = join(localCodexRoot, ".agents", "plugins");
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(join(catalogDirectory, "marketplace.json"), JSON.stringify(catalog, null, 2) + "\n");
}
