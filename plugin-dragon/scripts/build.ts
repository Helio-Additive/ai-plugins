import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { mdxToMd } from "mdx-to-md";

const root = resolve(import.meta.dir, "..");
const skillsDirectory = join(root, "skills");

async function files(directory: string) {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

function renderJsonnet(source: string): string {
  const output = execFileSync("jsonnet", [source], { cwd: root, encoding: "utf8" });
  return JSON.stringify(JSON.parse(output), null, 2) + "\n";
}

if (!Bun.which("jsonnet")) {
  throw new Error("Building plugins requires the Jsonnet CLI (jsonnet on PATH).");
}

const skills = new Map<string, string>();
for (const source of await files(skillsDirectory)) {
  if (!source.endsWith(".mdx")) continue;
  const contents = await readFile(source, "utf8");
  const frontmatter = contents.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
  const markdown = await mdxToMd(source);
  const output = join("skills", relative(skillsDirectory, source).slice(0, -1));
  skills.set(output, `${frontmatter ? `${frontmatter.trimEnd()}\n\n` : ""}${markdown.trimEnd()}\n`);
}
const openai = new Map<string, string | Buffer>([
  ...skills,
  [".codex-plugin/plugin.json", renderJsonnet("plugin.jsonnet")],
  [".mcp.json", renderJsonnet("mcp.jsonnet")],
]);
for (const source of await files(join(root, "assets"))) {
  openai.set(relative(root, source), await readFile(source));
}
if (!openai.has("assets/icon.png") && openai.has("assets/logo.png")) {
  openai.set("assets/icon.png", openai.get("assets/logo.png")!);
}
const packages = { openai, anthropic: skills };

// Render everything before replacing packages so compilation errors leave the
// existing plugin installations intact. Replacing outputs also removes stale files.
await mkdir(join(root, ".cache"), { recursive: true });
const staging = await mkdtemp(join(root, ".cache/vendors-"));
try {
  for (const [provider, outputs] of Object.entries(packages)) {
    await mkdir(join(staging, provider), { recursive: true });
    for (const [path, contents] of outputs) {
      const destination = join(staging, provider, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, contents);
    }
  }
  await mkdir(join(root, "vendors"), { recursive: true });
  for (const provider of Object.keys(packages)) {
    const destination = join(root, "vendors", provider);
    await rm(destination, { recursive: true, force: true });
    await rename(join(staging, provider), destination);
    console.log(`Built vendors/${provider}`);
  }
  await rm(join(root, "vendors/codex"), { recursive: true, force: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
