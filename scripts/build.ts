import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildPlugin, loadPluginSpecs, readBuildOptions, root } from "../lib/build";

const options = readBuildOptions(process.env);
const plugins = await loadPluginSpecs();
for (const { source, spec } of plugins) {
  await buildPlugin(spec, source, options);
}

// Claude uses its own catalog format and discovers it at this fixed root path.
// Derive entries from the same specs; local test contents must be generated with MCP_TEST_VENDOR=anthropic.
const marketplace = {
  name: "helioadditive-plugins",
  owner: { name: "Helio-Additive" },
  description: "Helio Additive thermal analysis and slicing plugins.",
  plugins: plugins.map(({ source, spec }) => ({
    name: spec.name,
    source: `./${relative(root, join(source, "_generated", "test")).split(sep).join("/")}`,
    description: spec.description,
    category: "Productivity",
  })),
};
const marketplaceDirectory = join(root, ".claude-plugin");
await mkdir(marketplaceDirectory, { recursive: true });
await writeFile(join(marketplaceDirectory, "marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");

// Codex requires plugin paths to stay inside the marketplace root. Keep a
// self-contained, ignored local catalog so Git packages never select test URLs.
const localCodexRoot = join(root, ".cache", "codex-local-marketplace");
await rm(localCodexRoot, { recursive: true, force: true });
if (options.testUrl !== undefined && options.testVendor === "openai") {
  const localPlugins = [];
  for (const { source, spec } of plugins) {
    const path = `./plugins/${spec.name}`;
    await cp(join(source, "_generated", "test"), join(localCodexRoot, path), { recursive: true });
    localPlugins.push({
      name: spec.name, source: { source: "local", path },
      policy: { installation: "AVAILABLE", ...(spec.mcp ? { authentication: "ON_INSTALL" } : {}) },
      category: "Productivity",
    });
  }
  const catalogDirectory = join(localCodexRoot, ".agents", "plugins");
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(join(catalogDirectory, "marketplace.json"), JSON.stringify({
    name: "helioadditive-plugins", interface: { displayName: "Helio-Additive Plugins" }, plugins: localPlugins,
  }, null, 2) + "\n");
}
