import { releaseVersion } from "./build";
import { beforeAll, describe, expect, test } from "bun:test";
import { loadPluginSpecs, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();

for (const { spec, source } of plugins) {
  describe(spec.name, () => {
    let normal: Awaited<ReturnType<typeof renderPlugin>>;
    beforeAll(async () => {
      normal = await renderPlugin(spec, source);
    });

    test("committed Codex bundle keeps native discovery and declared OpenAI authentication", () => {
      const codex = normal.get("codex")!;
      expect(codex.has("plugin.json")).toBe(false);
      expect(codex.has("mcp.json")).toBe(false);
      const manifest = JSON.parse(String(codex.get(".codex-plugin/plugin.json")));
      expect(manifest.name).toBe(spec.name);
      expect(manifest.version).toBe(releaseVersion);
      expect(manifest.skills).toBe("./skills/");
      if (spec.mcp) {
        const connection = spec.mcp.openai;
        const oauth = "clientId" in connection ? connection : undefined;
        expect(manifest.mcpServers).toBe("./.mcp.json");
        expect(JSON.parse(String(codex.get(".mcp.json"))).mcpServers).toEqual({
          [spec.name]: {
            type: "http", url: connection.url,
            ...(oauth ? { oauth: { clientId: oauth.clientId, callbackUrl: "http://127.0.0.1/callback" } } : {}),
            ...(oauth?.scopes ? { scopes: oauth.scopes } : {}),
          },
        });
      } else {
        expect(manifest.mcpServers).toBeUndefined();
        expect(codex.has(".mcp.json")).toBe(false);
      }
      for (const [path, content] of normal.get("openai")!) {
        if (path.startsWith("skills/") || path.startsWith("assets/")) expect(codex.get(path)).toEqual(content);
      }
    });

    // Each variant compiles the real skill sources, including Scripting's large
    // schema. Check variants separately instead of sharing one test timeout.
    test.each(["openai", "anthropic", "kimi-global", "kimi-china"])("%s test generation preserves every committed bundle", async (testVendor) => {
      const testBuild = await renderPlugin(spec, source, { testVendor, testUrl: "http://localhost:8888" });
      // No test host/vendor can leak into any committed package.
      for (const provider of normal.keys()) expect(testBuild.get(provider)).toEqual(normal.get(provider));
      expect(testBuild.has("test")).toBe(true);
    });

    test("native OpenAI test bundle differs only in its endpoint", async () => {
      const nativeTest = (await renderPlugin(spec, source, { testVendor: "openai", testUrl: "https://mcp3.helioadditive.com" })).get("test")!;
      if (spec.mcp) {
        const testMcp = JSON.parse(String(nativeTest.get(".mcp.json")));
        testMcp.mcpServers[spec.name].url = spec.mcp.openai.url;
        nativeTest.set(".mcp.json", JSON.stringify(testMcp, null, 2) + "\n");
      }
      expect(nativeTest).toEqual(normal.get("codex")!);
    });
  });
}

test("Codex uses the declared OpenAI URL even when it is not the test route", async () => {
  const { spec, source } = plugins.find(p => p.spec.mcp)!;
  const changed = { ...spec, mcp: { ...spec.mcp!, openai: { ...spec.mcp!.openai, url: "https://example.com/custom-resource" } } };
  const bundles = await renderPlugin(changed, source, { testVendor: "openai", testUrl: "http://localhost:8888" });
  expect(JSON.parse(String(bundles.get("codex")!.get(".mcp.json"))).mcpServers[spec.name].url).toBe("https://example.com/custom-resource");
  expect(JSON.parse(String(bundles.get("test")!.get(".mcp.json"))).mcpServers[spec.name].url).toBe(`http://localhost:8888/openai${spec.testPath}`);
});
