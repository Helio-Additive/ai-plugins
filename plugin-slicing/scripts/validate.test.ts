import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

test("authentication remains part of installation, not a setup skill", async () => {
  const marketplace = await Bun.file(resolve(root, ".agents/plugins/marketplace.json")).json();
  const entry = marketplace.plugins.find(
    (plugin: { name: string }) => plugin.name === "helioadditive-slicing",
  );
  expect(entry.policy.authentication).toBe("ON_INSTALL");

  const manifest = await Bun.file(resolve(root, "vendors/openai/.codex-plugin/plugin.json")).json();
  expect(manifest.extensions?.["com.openai"]?.onboardingSkill).toBeUndefined();
});

test("setup is absent from shared sources and both generated packages", () => {
  for (const path of [
    "skills/setup/SKILL.mdx",
    "vendors/openai/skills/setup/SKILL.md",
    "vendors/anthropic/skills/setup/SKILL.md",
  ]) {
    expect(existsSync(resolve(root, path))).toBe(false);
  }
});

test("the generated MCP server retains its OAuth configuration", async () => {
  const mcp = await Bun.file(resolve(root, "vendors/openai/.mcp.json")).json();
  const server = mcp.mcpServers["helioadditive-slicing"];
  expect(server.type).toBe("http");
  expect(server.url).toBe("https://mcp.helioadditive.com/openai/slicing");
  expect(server.scopes).toContain("slicing");
  expect(server.oauth.clientId).toBe("openai-slicer-plugin");
  expect(server.oauth.callbackUrl).toBe("http://127.0.0.1/callback");
});

test("the marketplace uses localhost and production packages never use development endpoints", async () => {
  const marketplace = await Bun.file(resolve(root, ".agents/plugins/marketplace.json")).json();
  expect(marketplace.plugins[0].source.path).toBe("./vendors/localhost");
  for (const [provider, url] of [
    ["localhost", "https://mcp.helio-local.svc.cluster.local:8444/openai/slicing"],
    ["openai", "https://mcp.helioadditive.com/openai/slicing"],
    ["anthropic", "https://mcp.helioadditive.com/slicing"],
  ]) {
    const mcp = await Bun.file(resolve(root, `vendors/${provider}/.mcp.json`)).json();
    expect(mcp.mcpServers["helioadditive-slicing"].url).toBe(url);
    expect(existsSync(resolve(root, `vendors/${provider}/skills/setup`))).toBe(false);
  }
  expect(existsSync(resolve(root, "vendors/anthropic/.claude-plugin/plugin.json"))).toBe(true);
});
