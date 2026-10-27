import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { mdxToMd } from "mdx-to-md";

const root = resolve(import.meta.dir, "..");
const skillsDirectory = join(root, "skills");
const assetsDirectory = join(root, "assets");

async function* files(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

function renderJsonnet(source: string): string {
  const output = execFileSync("jsonnet", [source], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.stringify(JSON.parse(output), null, 2) + "\n";
}

if (!Bun.which("jsonnet")) {
  throw new Error("Building plugins requires the Jsonnet CLI (jsonnet on PATH).");
}

const manifests = {
  openai: {
    ".codex-plugin/plugin.json": renderJsonnet("plugin.jsonnet"),
    ".mcp.json": renderJsonnet("mcp.jsonnet"),
  },
  anthropic: {},
};

const skills = new Map<string, string>();
for await (const source of files(skillsDirectory)) {
  if (!source.endsWith(".mdx")) continue;
  const contents = await readFile(source, "utf8");
  // mdx-to-md renders only the body; skill loaders also need the YAML metadata.
  const frontmatter = contents.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
  const markdown = await mdxToMd(source);
  const output = relative(skillsDirectory, source).slice(0, -1);
  skills.set(output, `${frontmatter ? `${frontmatter.trimEnd()}\n\n` : ""}${markdown.trimEnd()}\n`);
}

const assets = new Map<string, Buffer>();
for await (const source of files(assetsDirectory)) {
  assets.set(relative(assetsDirectory, source), await readFile(source));
}
// The logo doubles as the composer icon unless a separate icon is supplied.
if (!assets.has("icon.png") && assets.has("logo.png")) {
  assets.set("icon.png", assets.get("logo.png")!);
}

// Render everything before replacing packages so compilation errors leave the
// existing plugin installations intact. Replacing outputs also removes stale files.
await mkdir(join(root, ".cache"), { recursive: true });
const staging = await mkdtemp(join(root, ".cache/plugins-"));
try {
  for (const [provider, metadata] of Object.entries(manifests)) {
    const destination = join(staging, provider);
    await mkdir(destination, { recursive: true });
    const outputs = new Map<string, string | Buffer>(Object.entries(metadata));
    for (const [path, contents] of skills) outputs.set(join("skills", path), contents);
    if (provider !== "anthropic") {
      for (const [path, contents] of assets) outputs.set(join("assets", path), contents);
    }
    for (const [path, contents] of outputs) {
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await writeFile(join(destination, path), contents);
    }
  }

  await mkdir(join(root, "plugins"), { recursive: true });
  for (const provider of Object.keys(manifests)) {
    const destination = join(root, "plugins", provider);
    await rm(destination, { recursive: true, force: true });
    await rename(join(staging, provider), destination);
    console.log(`Built plugins/${provider}`);
  }
  await rm(join(root, "plugins/codex"), { recursive: true, force: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
