import { lstatSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import marketplace from "../.agents/plugins/marketplace.json";
import plugin from "../vendors/localhost/.codex-plugin/plugin.json";

const root = resolve(import.meta.dir, "..");
const pluginDirectory = resolve(root, "vendors/localhost");
const entry = marketplace.plugins.find(
  (entry) => entry.source.source === "local"
    && resolve(root, entry.source.path) === pluginDirectory,
);

function fail(message: string): never {
  console.error(`Validation failed: ${message}`);
  process.exit(1);
}

if (!entry) fail("Marketplace has no local entry for ./vendors/localhost.");
if (typeof plugin.name !== "string" || !plugin.name.trim()) {
  fail("vendors/openai/.codex-plugin/plugin.json must have a non-empty name.");
}

if (plugin.name !== entry.name) {
  fail(`Plugin name ${JSON.stringify(plugin.name)} does not match marketplace entry ${JSON.stringify(entry.name)}.`);
}

if (entry.policy.authentication !== "ON_INSTALL") {
  fail("The marketplace must request authentication when the plugin is installed.");
}

function validatePackage(directory: string) {
  if (!existsSync(directory)) fail(`Missing generated package: ${directory}; run just make.`);
  if (lstatSync(directory).isSymbolicLink()) fail(`Generated package must not be a symlink: ${directory}`);
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    const path = resolve(entry.parentPath, entry.name);
    if (entry.isSymbolicLink()) fail(`Packaged resource must not be a symlink: ${path}`);
    if (!entry.isDirectory() && /\.(mdx|jsonnet)$/.test(entry.name)) {
      fail(`Source file must not be packaged: ${path}`);
    }
  }
}

for (const provider of ["localhost", "openai", "anthropic"]) {
  validatePackage(resolve(root, "vendors", provider));
}

for (const path of [plugin.skills, plugin.interface.composerIcon, plugin.interface.logo, plugin.mcpServers]) {
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
console.log(`Validation passed: ${plugin.name} matches the marketplace; skills, assets, and OAuth configuration are packaged.`);
