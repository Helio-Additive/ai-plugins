import { afterEach, beforeEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
let fixture: string;

beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "plugin-build-test-"));
  for (const source of ["scripts/build.ts", "scripts/validate.ts", "plugin.jsonnet", "mcp.jsonnet", "skills", "assets", ".agents/plugins/marketplace.json"]) {
    const destination = join(fixture, source);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, source), destination, { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
});

afterEach(async () => {
  await rm(fixture, { recursive: true, force: true });
});

function run(script: string, success = true) {
  const result = spawnSync(process.execPath, [script], { cwd: fixture, encoding: "utf8" });
  if (success && result.status !== 0) throw new Error(result.stderr || String(result.error));
  if (!success) expect(result.status).not.toBe(0);
  return result.stdout + result.stderr;
}

async function snapshot(directory: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    expect(entry.isSymbolicLink()).toBe(false);
    const path = join(directory, entry.name);
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshot(path, name));
    else result[name] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
  return result;
}

test("generates provider packages directly from Jsonnet and nested MDX sources", async () => {
  const template = join(fixture, "plugin.jsonnet");
  await writeFile(template, (await readFile(template, "utf8")).replace("version: '0.1.0'", "version: '0.1.' + std.toString(7)"));
  const nested = join(fixture, "skills/test skill/nested");
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, "data.ts"), 'export const title = "First title";\n');
  const source = join(nested, "SKILL.mdx");
  const header = "---\nname: test-skill\ndescription: A generated test skill.\n---\n";
  await writeFile(source, `${header}\nimport { title } from "./data.ts"\n\n# {title}\n`);
  // Replace the previous directory symlink without writing through it.
  await mkdir(join(fixture, "plugins/anthropic"), { recursive: true });
  await symlink("../../skills", join(fixture, "plugins/anthropic/skills"), "dir");
  await mkdir(join(fixture, "plugins/codex"), { recursive: true });
  await writeFile(join(fixture, "plugins/codex/old.json"), "{}\n");

  run("scripts/build.ts");
  const outputs = await snapshot(join(fixture, "plugins"));
  expect(Object.keys(outputs).some((path) => /\.(mdx|jsonnet|ts)$/.test(path))).toBe(false);
  for (const provider of ["openai", "anthropic"]) {
    const markdown = await readFile(join(fixture, "plugins", provider, "skills/test skill/nested/SKILL.md"), "utf8");
    expect(markdown.startsWith(header)).toBe(true);
    expect(markdown).toContain("# First title");
  }
  expect((await readdir(join(fixture, "plugins"))).sort()).toEqual(["anthropic", "openai"]);
  expect(outputs["openai/plugin.json"]).toBeUndefined();
  expect(outputs["openai/mcp.json"]).toBeUndefined();
  expect(await Bun.file(join(fixture, "plugins/openai/.codex-plugin/plugin.json")).json()).toMatchObject({ version: "0.1.7", mcpServers: "./.mcp.json" });
  expect(await Bun.file(join(fixture, "plugins/openai/.mcp.json")).json()).toMatchObject({ mcpServers: { "helio-slicing": { type: "http" } } });
  expect(await readFile(join(fixture, "plugins/openai/assets/icon.png"))).toEqual(await readFile(join(fixture, "assets/logo.png")));
  expect((await snapshot(join(fixture, "skills")))["test skill/nested/SKILL.md"]).toBeUndefined();
  run("scripts/validate.ts");

  await writeFile(join(nested, "data.ts"), 'export const title = "Updated import";\n');
  run("scripts/build.ts");
  expect(await readFile(join(fixture, "plugins/openai/skills/test skill/nested/SKILL.md"), "utf8")).toContain("# Updated import");
  await rm(source);
  await writeFile(join(fixture, "plugins/openai/stale.json"), "{}\n");
  run("scripts/build.ts");
  const rebuilt = await snapshot(join(fixture, "plugins"));
  expect(rebuilt["openai/stale.json"]).toBeUndefined();
  expect(rebuilt["openai/skills/test skill/nested/SKILL.md"]).toBeUndefined();
  run("scripts/build.ts");
  expect(await snapshot(join(fixture, "plugins"))).toEqual(rebuilt);
});

test("compilation errors preserve existing generated packages", async () => {
  run("scripts/build.ts");
  const original = await snapshot(join(fixture, "plugins"));
  const template = join(fixture, "plugin.jsonnet");
  const contents = await readFile(template, "utf8");
  await writeFile(template, "{ invalid Jsonnet");
  run("scripts/build.ts", false);
  expect(await snapshot(join(fixture, "plugins"))).toEqual(original);
  await writeFile(template, contents);
  await writeFile(join(fixture, "skills/setup/SKILL.mdx"), "# {invalid MDX");
  run("scripts/build.ts", false);
  expect(await snapshot(join(fixture, "plugins"))).toEqual(original);
});

test("validation rejects source files, nested symlinks, and marketplace name mismatches", async () => {
  run("scripts/build.ts");
  run("scripts/validate.ts");
  const extra = join(fixture, "plugins/openai/source.jsonnet");
  await writeFile(extra, "{}\n");
  expect(run("scripts/validate.ts", false)).toContain("Source file must not be packaged");
  await rm(extra);
  const link = join(fixture, "plugins/openai/skills/setup/extra.md");
  await symlink(join(fixture, "skills/setup/SKILL.mdx"), link);
  expect(run("scripts/validate.ts", false)).toContain("must not be a symlink");
  await rm(link);
  const marketplacePath = join(fixture, ".agents/plugins/marketplace.json");
  const marketplace = await Bun.file(marketplacePath).json();
  marketplace.plugins[0].name = "different-name";
  await writeFile(marketplacePath, JSON.stringify(marketplace));
  expect(run("scripts/validate.ts", false)).toContain("does not match");
});
