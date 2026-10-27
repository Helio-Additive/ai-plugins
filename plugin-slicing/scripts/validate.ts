import { lstatSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import marketplace from "../.agents/plugins/marketplace.json";
import plugin from "../plugins/openai/.codex-plugin/plugin.json";

const root = resolve(import.meta.dir, "..");
const pluginDirectory = resolve(root, "plugins/openai");
const entry = marketplace.plugins.find(
  (entry) => entry.source.source === "local"
    && resolve(root, entry.source.path) === pluginDirectory,
);

function fail(message: string): never {
  console.error(`Validation failed: ${message}`);
  process.exit(1);
}

if (!entry) {
  fail(".agents/plugins/marketplace.json has no local entry for ./plugins/openai.");
}

if (typeof plugin.name !== "string" || plugin.name.trim() === "") {
  fail("plugins/openai/.codex-plugin/plugin.json must have a non-empty name.");
}

if (plugin.name !== entry.name) {
  fail(
    `plugins/openai/.codex-plugin/plugin.json name ${JSON.stringify(plugin.name)} does not match `
    + `.agents/plugins/marketplace.json entry name ${JSON.stringify(entry.name)} `
    + "for ./plugins/openai.",
  );
}

console.log(`Validation passed: plugin and marketplace entry both use ${JSON.stringify(plugin.name)}.`);

function validatePackage(directory: string) {
  if (!existsSync(directory)) fail(`Missing generated package: ${directory}; run just make.`);
  if (lstatSync(directory).isSymbolicLink()) fail(`Generated package must not be a symlink: ${directory}`);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Packaged resource must not be a symlink: ${path}`);
    if (entry.isDirectory()) validatePackage(path);
    else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".jsonnet")) {
      fail(`Source file must not be packaged: ${path}`);
    }
  }
}

for (const provider of ["openai", "anthropic"]) {
  validatePackage(resolve(root, "plugins", provider));
}

for (const path of [plugin.skills, plugin.extensions["com.openai"].onboardingSkill, plugin.interface.composerIcon, plugin.interface.logo, plugin.mcpServers]) {
  const absolute = resolve(pluginDirectory, path);
  if (!absolute.startsWith(pluginDirectory + "/") || !existsSync(absolute)) fail(`Missing packaged resource: ${path}`);
  if (lstatSync(absolute).isSymbolicLink()) fail(`Packaged resource must not be a symlink: ${path}`);
}
if (plugin.mcpServers !== "./.mcp.json") {
  fail("OpenAI manifest must reference ./.mcp.json; run just make.");
}
const mcp = JSON.parse(readFileSync(resolve(pluginDirectory, ".mcp.json"), "utf8"));
const server = mcp.mcpServers["helioadditive-slicing"];
if (server?.type !== "http" || !server.url || !server.oauth?.clientId
  || server.oauth.callbackUrl !== "http://127.0.0.1/callback" || !server.scopes?.includes("slicing")) {
  fail("Helio MCP must declare an HTTP server, the registered OAuth client, loopback callback, and slicing scope.");
}
console.log("Validation passed: onboarding, skills, assets, and OAuth configuration are packaged.");
