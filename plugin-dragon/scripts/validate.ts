import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { mdxToMd } from "mdx-to-md";
import marketplace from "../.agents/plugins/marketplace.json";
import plugin from "../vendors/openai/.codex-plugin/plugin.json";

const root = resolve(import.meta.dir, "..");
const pluginDirectory = resolve(root, "vendors/openai");
const skillNames = ["setup", "helio-dragon-tools", "prepare-dragon-run", "start-dragon-run", "check-dragon-run", "get-dragon-output"];
function fail(message: string): never { console.error(`Validation failed: ${message}`); process.exit(1); }
function validateExclusiveDownloadHelper() {
  const source = readFileSync(resolve(root, "skills/get-dragon-output/SKILL.mdx"), "utf8");
  const match = source.match(/python3 -c '\n([\s\S]*?)\n' "\$destination" "\$filename"\n```/);
  if (!match) fail("Missing exclusive-output helper.");
  const helperSource = match[1];
  if (!helperSource) fail("Exclusive-output helper is empty.");

  const directory = mkdtempSync(join(tmpdir(), "dragon-output-"));
  try {
    const input = join(directory, "input.gcode");
    const requested = join(directory, "artifact.gcode");
    writeFileSync(input, "first artifact");
    writeFileSync(requested, "existing artifact");
    // Mock the network response while executing the exact packaged helper.
    const mockedSource = `import urllib.request, io\nurllib.request.urlopen = lambda url: io.BytesIO(open(${JSON.stringify(input)}, "rb").read())\n${helperSource}`;
    const helper = ["-c", mockedSource, directory, "artifact.gcode"];
    const downloadInput = "https://artifacts.example.invalid/output?signature=test";
    execFileSync("python3", helper, { encoding: "utf8", input: downloadInput });
    const first = join(directory, "artifact 1.gcode");
    if (readFileSync(requested, "utf8") !== "existing artifact" || readFileSync(first, "utf8") !== "first artifact") {
      fail("Exclusive-output helper overwrote an occupied path or did not stream the artifact.");
    }

    writeFileSync(input, "second artifact");
    execFileSync("python3", helper, { encoding: "utf8", input: downloadInput });
    if (readFileSync(first, "utf8") !== "first artifact" || readFileSync(join(directory, "artifact 2.gcode"), "utf8") !== "second artifact") {
      fail("Exclusive-output helper did not reserve a fresh duplicate filename.");
    }
    writeFileSync(input, "");
    let rejectedEmpty = false;
    try { execFileSync("python3", helper, { stdio: "pipe", input: downloadInput }); }
    catch { rejectedEmpty = true; }
    if (!rejectedEmpty || existsSync(join(directory, "artifact 3.gcode"))) {
      fail("Empty downloads must fail and remove only their partial file.");
    }
    for (const scheme of ["file:///tmp/private", "http://127.0.0.1/private"]) {
      let rejectedScheme = false;
      try { execFileSync("python3", helper, { stdio: "pipe", input: scheme }); }
      catch { rejectedScheme = true; }
      if (!rejectedScheme || existsSync(join(directory, "artifact 3.gcode"))) fail("Non-HTTPS artifacts must be rejected before reserving a file.");
    }
    rmSync(input);
    let rejectedMissing = false;
    try { execFileSync("python3", helper, { stdio: "pipe", input: downloadInput }); }
    catch { rejectedMissing = true; }
    if (!rejectedMissing || existsSync(join(directory, "artifact 3.gcode")) || readFileSync(requested, "utf8") !== "existing artifact") {
      fail("Failed downloads must clean up their reservation and preserve existing files.");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function validatePackage(directory: string) {
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) fail(`Invalid package: ${directory}`);
  for (const item of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    const path = resolve(item.parentPath, item.name);
    if (item.isSymbolicLink() || (!item.isDirectory() && /\.(mdx|jsonnet)$/.test(item.name))) fail(`Invalid packaged resource: ${path}`);
  }
}
const entry = marketplace.plugins.find((candidate) => candidate.source.source === "local" && resolve(root, candidate.source.path) === pluginDirectory);
if (!entry || plugin.name !== "helioadditive-dragon" || entry.name !== plugin.name) fail("Marketplace and manifest must name helioadditive-dragon.");
for (const provider of ["openai", "anthropic"]) {
  const directory = resolve(root, "vendors", provider); validatePackage(directory);
  for (const name of skillNames) {
    const skill = resolve(directory, "skills", name, "SKILL.md");
    if (!existsSync(skill) || !readFileSync(skill, "utf8").startsWith(`---\nname: ${name}\n`)) fail(`Missing valid ${provider} skill: ${name}.`);
  }
}
for (const path of [plugin.skills, plugin.extensions["com.openai"].onboardingSkill, plugin.interface.composerIcon, plugin.interface.logo, plugin.mcpServers]) {
  const absolute = resolve(pluginDirectory, path);
  if (!absolute.startsWith(pluginDirectory + "/") || !existsSync(absolute) || lstatSync(absolute).isSymbolicLink()) fail(`Missing package resource: ${path}`);
}
const mcp = JSON.parse(readFileSync(resolve(pluginDirectory, ".mcp.json"), "utf8"));
const server = mcp.mcpServers["helioadditive-dragon"];
if (plugin.mcpServers !== "./.mcp.json" || server?.type !== "http" || (typeof server.url !== "string" || !server.url.startsWith("https://")) || server.oauth?.callbackUrl !== "http://127.0.0.1/callback") fail("Invalid Dragon MCP configuration.");
const hasClient = server.oauth.clientId !== undefined;
const hasScopes = server.scopes !== undefined;
if (hasClient !== hasScopes) fail("Configure the verified OAuth client ID and scopes together.");
if (hasClient && (typeof server.oauth.clientId !== "string" || !server.oauth.clientId.trim() || !Array.isArray(server.scopes) || !server.scopes.length || server.scopes.some((scope: unknown) => typeof scope !== "string" || !scope.trim()))) fail("OAuth client ID and scopes must be nonempty strings.");
if (!hasClient) console.log("OAuth client/scopes are unconfigured; hosted login is not validated.");
for (const provider of ["openai", "anthropic"]) for (const name of skillNames) {
  const skill = resolve(root, "vendors", provider, "skills", name, "SKILL.md");
  if (/\bPAT\b|personal access token/i.test(readFileSync(skill, "utf8"))) fail("Packaged skills must not contain PAT handling.");
}

// Keep committed provider output synchronized with the shared source files.
for (const name of skillNames) {
  const source = resolve(root, "skills", name, "SKILL.mdx");
  const content = readFileSync(source, "utf8");
  const frontmatter = content.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
  const markdown = await mdxToMd(source);
  const expected = `${frontmatter ? `${frontmatter.trimEnd()}\n\n` : ""}${markdown.trimEnd()}\n`;
  for (const provider of ["openai", "anthropic"]) {
    const generated = resolve(root, "vendors", provider, "skills", name, "SKILL.md");
    if (readFileSync(generated, "utf8") !== expected) {
      fail(`Stale generated ${provider} skill: ${name}; rebuild packages.`);
    }
  }
}
const manifests: Array<[string, string]> = [
  ["plugin.jsonnet", ".codex-plugin/plugin.json"],
  ["mcp.jsonnet", ".mcp.json"],
];
for (const [source, generated] of manifests) {
  const expected = JSON.parse(execFileSync("jsonnet", [resolve(root, source)], { encoding: "utf8" }));
  const actual = JSON.parse(readFileSync(resolve(pluginDirectory, generated), "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    fail(`Stale generated manifest: ${generated}; rebuild packages.`);
  }
}

validateExclusiveDownloadHelper();

console.log("Validation passed: six skills, fresh generated packages, assets, and structurally valid OAuth configuration are packaged.");
