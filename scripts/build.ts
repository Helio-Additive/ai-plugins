import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildPlugin, loadPluginSpecs, readBuildOptions, root } from "../lib/build";

const options = readBuildOptions(process.env);
const plugins = await loadPluginSpecs();
for (const { source, spec } of plugins) {
  await buildPlugin(spec, source, options);
}

// Claude uses its own catalog format and discovers it at this fixed root path.
// Derive entries from the same specs; never point Claude at OpenAI-only test bundles.
const marketplace = {
  name: "helioadditive-plugins",
  owner: { name: "Helio-Additive" },
  description: "Helio Additive thermal analysis and slicing plugins.",
  plugins: plugins.map(({ source, spec }) => ({
    name: spec.name,
    source: `./${relative(root, join(source, "_generated", "anthropic")).split(sep).join("/")}`,
    description: spec.description,
    category: "Productivity",
  })),
};
const marketplaceDirectory = join(root, ".claude-plugin");
await mkdir(marketplaceDirectory, { recursive: true });
await writeFile(join(marketplaceDirectory, "marketplace.json"), JSON.stringify(marketplace, null, 2) + "\n");
