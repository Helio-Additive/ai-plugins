import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin, loadPluginSpecs, providersFor, readBuildOptions, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();

describe("test bundle build options", () => {
  test("test bundles opt in with a base URL", () => {
    const options = readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "openai", MCP_TEST_URL: "https://mcp3.helioadditive.com" });
    expect(providersFor(options)).toEqual(["openai", "anthropic", "test"]);
  });

  test("normal builds ignore even invalid test base URLs", () => {
    expect(readBuildOptions({ MCP_TEST_URL: "invalid" })).toEqual({});
    expect(providersFor()).toEqual(["openai", "anthropic"]);
  });

  test("requires a base URL when test generation is enabled", () => {
    expect(() => readBuildOptions({ GENERATE_TEST: "true" })).toThrow();
  });

  test.each(["", "  ", "invalid", "ftp://test.invalid", "https://user:secret@test.invalid", "https://test.invalid/#fragment", "https://test.invalid?mode=test", "https://test.invalid/openai/slicing", "https://test.invalid/anthropic/dragon", "https://test.invalid/slicing"])(
    "rejects invalid base URLs and full endpoints: %s", (url) => {
      expect(() => readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "openai", MCP_TEST_URL: url })).toThrow();
    },
  );
});

test("specs must define a valid neutral test route", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-plugins-spec-test-"));
  try {
    const source = join(directory, "example");
    await mkdir(source);
    for (const testPath of [undefined, "", "slicing", "/openai/slicing", "/anthropic/dragon", "//other.invalid", "/../slicing", "/slicing?mode=test"]) {
      await writeFile(join(source, "spec.yaml"), JSON.stringify({ ...plugins[0]!.spec, testPath }));
      await expect(loadPluginSpecs(directory)).rejects.toThrow("Invalid");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const vendor of ["openai", "anthropic"]) {
for (const { spec, source } of plugins) {
  const connectionSpec = spec.mcp;
  if (!connectionSpec) continue;
  describe(spec.name, () => {
    test.each(["https://mcp3.helioadditive.com", "https://mcp3.helioadditive.com/", "http://localhost:8080", "http://localhost:8080/"])(
      "appends the predefined neutral route to %s without changing other bundle contents", async (baseUrl) => {
        const normal = await renderPlugin(spec, source);
        const bundles = await renderPlugin(spec, source, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: vendor, MCP_TEST_URL: baseUrl }));
        const expectedPath = {
          "helioadditive-slicing": "/slicing",
          "helioadditive-dragon": "/dragon",
        }[spec.name];
        expect(expectedPath).toBeDefined();
        const testBundle = new Map(bundles.get("test")!);
        const legacy = vendor === "openai";
        expect(testBundle.has("plugin.json")).toBe(!legacy);
        if (legacy) {
          const manifest = JSON.parse(testBundle.get(".codex-plugin/plugin.json") as string);
          expect(manifest.name).toBe(spec.name);
          expect(manifest.mcpServers).toBe("./.mcp.json");
          expect(manifest.skills).toBe("./skills/");
        }
        const mcp = JSON.parse(testBundle.get(".mcp.json") as string);
        if (legacy) {
          expect(mcp.mcpServers[spec.name].oauth.clientId).toBe(connectionSpec.openai.clientId);
          expect(mcp.mcpServers[spec.name].oauth.callbackUrl).toBe("http://127.0.0.1/callback");
          expect(mcp.mcpServers[spec.name].scopes).toEqual(connectionSpec.openai.scopes);
          testBundle.delete(".codex-plugin/plugin.json");
          testBundle.delete(".mcp.json");
          testBundle.set("plugin.json", bundles.get("openai")!.get("plugin.json")!);
        }
        expect(mcp.mcpServers[spec.name].url).toBe(new URL(baseUrl).origin + "/" + vendor + expectedPath);
        if (!legacy) {
          expect(testBundle.has(".codex-plugin/plugin.json")).toBe(false);
          expect(JSON.parse(testBundle.get(".claude-plugin/plugin.json") as string).name).toBe(spec.name);
          expect(mcp.mcpServers[spec.name].type).toBe("http");
          expect(mcp.mcpServers[spec.name].oauth).toEqual({
            clientId: connectionSpec.anthropic.clientId,
            ...(connectionSpec.anthropic.scopes ? { scopes: connectionSpec.anthropic.scopes.join(" ") } : {}),
          });
          mcp.mcpServers[spec.name].url = connectionSpec.anthropic.url;
          testBundle.set(".mcp.json", JSON.stringify(mcp, null, 2) + "\n");
          expect(testBundle).toEqual(bundles.get("anthropic")!);
        }
        // Skills/assets and production bundles remain byte-identical; test layout differs.
        if (legacy) testBundle.set("mcp.json", bundles.get("openai")!.get("mcp.json")!);
        if (legacy) expect(testBundle).toEqual(bundles.get("openai")!);
        const openaiMcp = JSON.parse(bundles.get("openai")!.get("mcp.json") as string);
        mcp.mcpServers[spec.name].url = connectionSpec.openai.url;

        expect(bundles.get("openai")).toEqual(normal.get("openai"));
        expect(bundles.get("anthropic")).toEqual(normal.get("anthropic"));
      },
    );

    test("writes the neutral endpoint to disk and removes test output on a normal build", async () => {
      const directory = await mkdtemp(join(tmpdir(), "ai-plugins-test-"));
      try {
        await mkdir(join(directory, "skills"));
        await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "openai", MCP_TEST_URL: "https://mcp3.helioadditive.com" }));
        const testMcp = join(directory, "_generated/test/.mcp.json");
        const mcp = JSON.parse(await readFile(testMcp, "utf8"));
        expect(mcp.mcpServers[spec.name].url).toBe("https://mcp3.helioadditive.com/openai/" + spec.name.replace("helioadditive-", ""));
        // A normal build must also remove stale files rather than retaining old endpoints.
        await writeFile(join(directory, "_generated/test/plugin.json"), "stale portable manifest");
        await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "openai", MCP_TEST_URL: "https://mcp3.helioadditive.com" }));
        expect(await access(join(directory, "_generated/test/plugin.json")).then(() => true, () => false)).toBe(false);
        await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "anthropic", MCP_TEST_URL: "https://mcp3.helioadditive.com" }));
        expect(await access(join(directory, "_generated/test/.codex-plugin")).then(() => true, () => false)).toBe(false);
        expect(await access(join(directory, "_generated/test/.mcp.json")).then(() => true, () => false)).toBe(true);
        expect(await access(join(directory, "_generated/test/plugin.json")).then(() => true, () => false)).toBe(true);
        await buildPlugin(spec, directory);
        expect(await access(join(directory, "_generated/test")).then(() => true, () => false)).toBe(false);
        mcp.mcpServers[spec.name].url = connectionSpec.openai.url;
        expect(await access(join(directory, "_generated/openai/.codex-plugin")).then(() => true, () => false)).toBe(false);
        expect(JSON.parse(await readFile(join(directory, "_generated/openai/mcp.json"), "utf8"))).toBeDefined();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
}

}

test.each([undefined, "", "OpenAI", "other", "../openai"])("rejects invalid vendor %s", (vendor) => {
  expect(() => readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: "https://example.com", MCP_TEST_VENDOR: vendor })).toThrow("MCP_TEST_VENDOR");
});

test("both local marketplaces reference test bundles", async () => {
  for (const path of [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]) {
    const catalog = JSON.parse(await readFile(join(import.meta.dir, "..", path), "utf8"));
    expect(catalog.plugins).toHaveLength(plugins.length);
    for (const entry of catalog.plugins) {
      const source = typeof entry.source === "string" ? entry.source : entry.source.path;
      expect(source).toMatch(/^\.\/plugins\/[^/]+\/_generated\/test$/);
    }
  }
});

for (const vendor of ["openai", "anthropic"]) {
  test(`skills-only bundles omit every MCP/auth entrypoint (${vendor})`, async () => {
    const { spec, source } = plugins.find(p => p.spec.name === "scripting")!;
    const bundles = await renderPlugin(spec, source, { testUrl: "https://example.com", testVendor: vendor });
    for (const outputs of bundles.values()) {
      expect(outputs.has("mcp.json")).toBe(false);
      expect(outputs.has(".mcp.json")).toBe(false);
      expect(outputs.has("skills/graphql-scripting/SKILL.md")).toBe(true);
      expect(outputs.has("skills/graphql-scripting/templates/cpp/README.md")).toBe(true);
      for (const [path, content] of outputs) {
        if (path.endsWith("plugin.json")) expect(String(content)).not.toMatch(/mcpServers|oauth|clientId/);
      }
    }
  });
}
