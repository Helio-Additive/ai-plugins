import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadPluginSpecs, releaseVersion, root } from "../lib/build";

const tag = process.argv[2];
if (!tag || tag.replace(/^v/, "") !== releaseVersion) {
  throw new Error(`Release tag must match package.json version ${releaseVersion}`);
}
const output = resolve(root, "dist/releases");
await mkdir(output, { recursive: true });
for (const { source, spec } of await loadPluginSpecs()) {
  const bundle = join(source, "_generated/codex");
  const manifest = JSON.parse(await readFile(join(bundle, ".codex-plugin/plugin.json"), "utf8"));
  if (manifest.version !== releaseVersion) throw new Error(`Stale bundle: ${spec.name}`);
  if (spec.mcp) {
    const mcp = JSON.parse(await readFile(join(bundle, ".mcp.json"), "utf8"));
    if (mcp.mcpServers[spec.name].url !== spec.mcp.openai.url) throw new Error(`Non-production bundle: ${spec.name}`);
  }
  const zip = join(output, `${spec.name}-openai-${releaseVersion}.zip`);
  await Bun.$`rm -f ${zip}`;
  await Bun.$`zip -qr ${zip} .`.cwd(bundle);
  console.log(zip);
}
