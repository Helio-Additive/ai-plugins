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
  expect(server.url).toBe("https://mcp3.helioadditive.com/openai/slicing");
  expect(server.scopes).toContain("slicing");
  expect(server.oauth.clientId).toBe("openai-slicer-plugin");
  expect(server.oauth.callbackUrl).toBe("http://127.0.0.1/callback");
});
