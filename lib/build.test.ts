import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin, loadPluginSpecs, providersFor, readBuildOptions, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();

describe("test bundle build options", () => {
  test("test bundles opt in without requiring a shared endpoint", () => {
    const options = readBuildOptions({ GENERATE_TEST: "true" });
    expect(providersFor(options)).toEqual(["openai", "anthropic", "test"]);
  });

  test("normal builds ignore even invalid test overrides", () => {
    expect(readBuildOptions({ MCP_TEST_URL: "invalid" })).toEqual({});
    expect(providersFor()).toEqual(["openai", "anthropic"]);
  });

  test.each(["", "  ", "invalid", "ftp://test.invalid/mcp", "https://user:secret@test.invalid/mcp", "https://test.invalid/mcp#fragment"])(
    "rejects invalid explicit overrides: %s", (url) => {
      expect(() => readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: url })).toThrow();
    },
  );
});

for (const { spec, source } of plugins) {
  describe(spec.name, () => {
    test("test bundle inherits the complete OpenAI bundle and provider endpoint", async () => {
      const normal = await renderPlugin(spec, source);
      const bundles = await renderPlugin(spec, source, readBuildOptions({ GENERATE_TEST: "true" }));
      const expectedUrl = {
        "helioadditive-slicing": "https://mcp3.helioadditive.com/openai/slicing",
        "helioadditive-dragon": "https://mcp3.helioadditive.com/openai/dragon",
      }[spec.name];
      expect(expectedUrl).toBeDefined();
      const testBundle = bundles.get("test")!;
      const mcp = JSON.parse(testBundle.get("mcp.json") as string);
      expect(mcp.mcpServers[spec.name].url).toBe(expectedUrl);
      expect(testBundle).toEqual(bundles.get("openai")!);
      expect(bundles.get("openai")).toEqual(normal.get("openai"));
      expect(bundles.get("anthropic")).toEqual(normal.get("anthropic"));
    });

    test.each(["https://test.invalid", "https://test.invalid/custom/mcp?mode=test", "http://localhost:8080/mcp"])(
      "preserves the exact override %s and registered OAuth settings", async (url) => {
        const bundles = await renderPlugin(spec, source, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: url }));
        const testMcp = JSON.parse(bundles.get("test")!.get("mcp.json") as string);
        const openaiMcp = JSON.parse(bundles.get("openai")!.get("mcp.json") as string);
        expect(testMcp.mcpServers[spec.name].url).toBe(url);
        testMcp.mcpServers[spec.name].url = spec.mcp.openai.url;
        expect(testMcp).toEqual(openaiMcp);
        const anthropicMcp = JSON.parse(bundles.get("anthropic")!.get(".mcp.json") as string);
        expect(anthropicMcp.mcpServers[spec.name]).toEqual({
          type: "http", url: spec.mcp.anthropic.url,
          oauth: { clientId: spec.mcp.anthropic.clientId, scopes: spec.mcp.anthropic.scopes!.join(" ") },
        });
      },
    );

    test("writes the default test endpoint to disk and removes test output on a normal build", async () => {
      const directory = await mkdtemp(join(tmpdir(), "ai-plugins-test-"));
      try {
        await mkdir(join(directory, "skills"));
        await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true" }));
        const testMcp = join(directory, "_generated/test/mcp.json");
        const mcp = JSON.parse(await readFile(testMcp, "utf8"));
        expect(mcp.mcpServers[spec.name].url).toBe(spec.mcp.openai.url);
        // A normal build must also remove stale files rather than retaining old endpoints.
        await writeFile(join(directory, "_generated/test/stale.txt"), "old output");
        await buildPlugin(spec, directory);
        expect(await access(join(directory, "_generated/test")).then(() => true, () => false)).toBe(false);
        expect(JSON.parse(await readFile(join(directory, "_generated/openai/mcp.json"), "utf8"))).toEqual(mcp);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
}
