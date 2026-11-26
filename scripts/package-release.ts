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
  for (const format of [
    { bundle: "codex", suffix: "codex-desktop", manifest: ".codex-plugin/plugin.json", mcp: ".mcp.json" },
    { bundle: "openai", suffix: "openai-submission", manifest: "plugin.json", mcp: "mcp.json" },
  ]) {
    if (format.bundle === "openai" && !spec.openaiSubmission) continue;
    const bundle = join(source, "_generated", format.bundle);
    const manifest = JSON.parse(await readFile(join(bundle, format.manifest), "utf8"));
    if (manifest.version !== releaseVersion) throw new Error(`Stale bundle: ${spec.name}`);
    if (spec.mcp) {
      const mcp = JSON.parse(await readFile(join(bundle, format.mcp), "utf8"));
      if (mcp.mcpServers[spec.name].url !== spec.mcp.openai.url) throw new Error(`Non-production bundle: ${spec.name}`);
    }
    const zip = join(output, `${spec.name}-${format.suffix}-${releaseVersion}.zip`);
    await Bun.$`rm -f ${zip}`;
    await Bun.$`zip -qr ${zip} .`.cwd(bundle);
    console.log(zip);
  }
}
