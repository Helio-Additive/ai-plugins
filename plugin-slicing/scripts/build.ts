import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { mdxToMd } from "mdx-to-md";

const root = resolve(import.meta.dir, "..");
const skillsDirectory = join(root, "skills");

async function files(directory: string) {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function renderJsonnet(source: string, args: string[] = []): string {
  const output = execFileSync("jsonnet", [...args, source], { cwd: root, encoding: "utf8" });
  return JSON.stringify(JSON.parse(output), null, 2) + "\n";
}

if (!Bun.which("jsonnet")) {
  throw new Error("Building plugins requires the Jsonnet CLI (jsonnet on PATH).");
}

const skills = new Map<string, string>();
for (const source of await files(skillsDirectory)) {
  if (!source.endsWith(".mdx")) continue;
  const contents = await readFile(source, "utf8");
  // mdx-to-md renders only the body; skill loaders also need the YAML metadata.
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
// The logo doubles as the composer icon unless a separate icon is supplied.
if (!openai.has("assets/icon.png") && openai.has("assets/logo.png")) {
  openai.set("assets/icon.png", openai.get("assets/logo.png")!);
}
const orbstack = new Map(openai);
orbstack.set(".mcp.json", renderJsonnet("mcp.jsonnet", ["--tla-str", "provider=orbstack"]));
const localhost = Object.fromEntries(
  ["nightly", "staging", "production"].map((environment) => {
    const bundle = new Map(openai);
    bundle.set(".mcp.json", renderJsonnet("mcp.jsonnet", [
      "--tla-str", "provider=localhost", "--tla-str", `environment=${environment}`,
    ]));
    return [`localhost/${environment}`, bundle];
  }),
);
const anthropic = new Map<string, string | Buffer>([
  ...skills,
  [".mcp.json", renderJsonnet("mcp.jsonnet", ["--tla-str", "provider=anthropic"])],
  [".claude-plugin/plugin.json", JSON.stringify({
    name: "helioadditive-slicing",
    version: "0.1.0",
    description: "Create, monitor, and retrieve Helio Additive slicing jobs.",
    author: { name: "Helio-Additive" },
  }, null, 2) + "\n"],
]);
for (const [path, contents] of openai) {
  if (path.startsWith("assets/")) anthropic.set(path, contents);
}
const packages = { ...localhost, orbstack, openai, anthropic };

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
  // Replace each top-level tree once, including all nested hosted bundles.
  for (const provider of new Set(Object.keys(packages).map((path) => path.split("/")[0]!))) {
    const destination = join(root, "vendors", provider);
    await rm(destination, { recursive: true, force: true });
    await rename(join(staging, provider), destination);
    console.log(`Built vendors/${provider}`);
  }
  await rm(join(root, "vendors/codex"), { recursive: true, force: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
