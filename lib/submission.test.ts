import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { join } from "node:path";
import manifestSchema from "../schemas/agent-plugins/1.0.0/plugin.schema.json";
import mcpSchema from "../schemas/agent-plugins/1.0.0/mcp.schema.json";
import { root } from "./build";

const validator = new Ajv2020({ strict: false });
const validateManifest = validator.compile(manifestSchema);
const validateCoreMcp = validator.compile(mcpSchema);

test.each([
  ["dragon", "https://dragon.mcp.helioadditive.com/openai"],
  ["slicing", "https://slicing.mcp.helioadditive.com/openai"],
  ["scripting", "https://scripting.mcp.helioadditive.com/openai/scripting"],
] as const)("%s public package matches the portable schema and documented OpenAI extensions", async (plugin, endpoint) => {
  const bundle = join(root, "plugins", plugin, "_generated/openai");
  const manifest = await Bun.file(join(bundle, "plugin.json")).json();
  expect(validateManifest(manifest)).toBe(true);
  const ext = manifest.extensions["com.openai"];
  expect(ext.interface.category).toBe("Productivity");
  expect(ext.interface.capabilities).toEqual(["Read", "Write"]);
  expect(ext.interface.developerName).toBe("Helio Additive");
  expect(ext.interface.shortDescription.length).toBeLessThanOrEqual(30);
  expect(ext.interface.longDescription.length).toBeLessThanOrEqual(4000);
  expect(new Set(ext.interface.defaultPrompt).size).toBe(ext.interface.defaultPrompt.length);
  for (const prompt of ext.interface.defaultPrompt) expect(prompt).toMatch(/^[^\r\n@]{1,128}$/);
  const config = await Bun.file(join(bundle, "mcp.json")).json();
  // The upstream MCP schema omits server extensions. Validate the documented
  // extension separately, then validate the complete remaining MCP document.
  const server = config.mcpServers[manifest.name];
  expect(server.url).toBe(endpoint);
  expect(server.extensions["com.openai"].auth).toEqual(plugin === "scripting" ? { type: "oauth" } : {
    type: "oauth", client: { mode: "provided", clientId: "openai-plugin", tokenEndpointAuthMethod: "none" },
    baseScopes: [plugin],
  });
  delete server.extensions;
  expect(validateCoreMcp(config)).toBe(true);
});
