import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin, loadPluginSpecs, providersFor, readBuildOptions, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();

describe("test bundle build options", () => {
  test("test bundles opt in with a base URL", () => {
    const options = readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: "https://mcp3.helioadditive.com" });
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
      expect(() => readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: url })).toThrow();
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

for (const { spec, source } of plugins) {
  describe(spec.name, () => {
    test.each(["https://mcp3.helioadditive.com", "https://mcp3.helioadditive.com/", "http://localhost:8080", "http://localhost:8080/"])(
      "appends the predefined neutral route to %s without changing other bundle contents", async (baseUrl) => {
        const normal = await renderPlugin(spec, source);
        const bundles = await renderPlugin(spec, source, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: baseUrl }));
        const expectedPath = {
          "helioadditive-slicing": "/slicing",
          "helioadditive-dragon": "/dragon",
        }[spec.name];
        expect(expectedPath).toBeDefined();
        const testBundle = new Map(bundles.get("test")!);
        const mcp = JSON.parse(testBundle.get("mcp.json") as string);
        expect(mcp.mcpServers[spec.name].url).toBe(new URL(baseUrl).origin + expectedPath);
        // Only the endpoint differs: manifests, skills, assets, and OAuth stay identical.
        testBundle.set("mcp.json", bundles.get("openai")!.get("mcp.json")!);
        expect(testBundle).toEqual(bundles.get("openai")!);
        const openaiMcp = JSON.parse(bundles.get("openai")!.get("mcp.json") as string);
        mcp.mcpServers[spec.name].url = spec.mcp.openai.url;
        expect(mcp).toEqual(openaiMcp);
        expect(bundles.get("openai")).toEqual(normal.get("openai"));
        expect(bundles.get("anthropic")).toEqual(normal.get("anthropic"));
      },
    );

    test("writes the neutral endpoint to disk and removes test output on a normal build", async () => {
      const directory = await mkdtemp(join(tmpdir(), "ai-plugins-test-"));
      try {
        await mkdir(join(directory, "skills"));
        await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: "https://mcp3.helioadditive.com" }));
        const testMcp = join(directory, "_generated/test/mcp.json");
        const mcp = JSON.parse(await readFile(testMcp, "utf8"));
        expect(mcp.mcpServers[spec.name].url).toBe("https://mcp3.helioadditive.com/" + spec.name.replace("helioadditive-", ""));
        // A normal build must also remove stale files rather than retaining old endpoints.
        await writeFile(join(directory, "_generated/test/stale.txt"), "old output");
        await buildPlugin(spec, directory);
        expect(await access(join(directory, "_generated/test")).then(() => true, () => false)).toBe(false);
        mcp.mcpServers[spec.name].url = spec.mcp.openai.url;
        expect(JSON.parse(await readFile(join(directory, "_generated/openai/mcp.json"), "utf8"))).toEqual(mcp);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
}
