import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildPlugin, loadPluginSpecs, providersFor, readBuildOptions, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();

describe("test bundle build options", () => {
  test("test bundles opt in with a base URL", () => {
    const options = readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: "openai", MCP_TEST_URL: "https://mcp3.helioadditive.com" });
    expect(providersFor(options)).toEqual(["openai", "anthropic", "kimi-global", "kimi-china", "codex", "test"]);
  });

  test("normal builds ignore even invalid test base URLs", () => {
    expect(readBuildOptions({ MCP_TEST_URL: "invalid" })).toEqual({});
    expect(providersFor()).toEqual(["openai", "anthropic", "kimi-global", "kimi-china", "codex"]);
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

test.each([undefined, "", "OpenAI", "Kimi", "kimi", "kimi-code", "Kimi-Global", "kimi-cn", "other", "../openai"])("rejects invalid vendor %s", (vendor) => {
  expect(() => readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_URL: "https://example.com", MCP_TEST_VENDOR: vendor })).toThrow("MCP_TEST_VENDOR");
});

test("Git catalogs resolve committed packages: Codex and Claude", async () => {
  for (const [path, bundle] of [
    [".agents/plugins/marketplace.json", "codex"],
    [".claude-plugin/marketplace.json", "anthropic"],
  ]) {
    const catalog = JSON.parse(await readFile(join(import.meta.dir, "..", path!), "utf8"));
    expect(catalog.plugins.map((p: { name: string }) => p.name).sort()).toEqual(plugins.map(p => p.spec.name).sort());
    const catalogRoot = join(import.meta.dir, "..");
    for (const entry of catalog.plugins) {
      const source = typeof entry.source === "string" ? entry.source : entry.source.path;
      const plugin = plugins.find(p => p.spec.name === entry.name)!;
      expect(resolve(catalogRoot, source)).toBe(join(plugin.source, "_generated", bundle!));
    }
  }
});

for (const vendor of ["openai", "anthropic", "kimi-global", "kimi-china"]) {
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
    for (const kimiVendor of ["kimi-global", "kimi-china"]) {
      const kimi = JSON.parse(bundles.get(kimiVendor)!.get("kimi.plugin.json") as string);
      expect(kimi).toMatchObject({ name: spec.name, skills: "./skills/" });
      expect(kimi.mcpServers).toBeUndefined();
      expect(bundles.get(kimiVendor)!.has("plugin.json")).toBe(false);
    }
    expect(bundles.has("kimi")).toBe(false);
  });
}

const kimiRegions = [
  ["kimi-global", "mcp3.helioadditive.com"],
  ["kimi-china", "mcp2.helioam.cn"],
] as const;

describe.each(kimiRegions)("%s vendor", (vendor, host) => {
  const withMcp = plugins.filter(({ spec }) => spec.mcp);
  const base = "https://mcp3.helioadditive.com";
  const other = vendor === "kimi-global" ? "kimi-china" : "kimi-global";

  test.each(withMcp.map(({ spec, source }) => [spec.name, spec, source] as const))(
    "%s: emits only the native Kimi manifest, with the regional endpoint and no OAuth client data", async (_name, spec, source) => {
      const bundles = await renderPlugin(spec, source);
      const outputs = bundles.get(vendor)!;
      const kimiUrl = spec.mcp![vendor].url;
      expect(new URL(kimiUrl).host).toBe(host);
      expect(new URL(kimiUrl).pathname).toBe("/kimi" + spec.testPath);
      const manifest = JSON.parse(outputs.get("kimi.plugin.json") as string);
      expect(manifest).toEqual({
        name: spec.name, version: spec.version, description: spec.description,
        author: { name: "Helio-Additive" }, skills: "./skills/",
        interface: {
          displayName: spec.displayName, shortDescription: spec.shortDescription,
          longDescription: spec.longDescription, developerName: "Helio-Additive",
        },
        mcpServers: { [spec.name]: { url: kimiUrl } },
      });
      // Kimi plugin MCP entries document only transport fields, so nothing OAuth-shaped is emitted.
      expect(outputs.get("kimi.plugin.json") as string).not.toMatch(/oauth|clientId|scopes|extensions|\$schema/i);
      for (const absent of ["plugin.json", "mcp.json", ".mcp.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
        expect(outputs.has(absent)).toBe(false);
      }
      // Regions differ only by endpoint host; the legacy single `kimi` bundle is gone.
      expect(bundles.has("kimi")).toBe(false);
      const otherManifest = JSON.parse(bundles.get(other)!.get("kimi.plugin.json") as string);
      otherManifest.mcpServers[spec.name].url = kimiUrl;
      expect(otherManifest).toEqual(manifest);
      expect(new URL(spec.mcp![other].url).host).not.toBe(host);
      // Skills and assets are the same shared outputs every vendor receives.
      for (const [path, contents] of bundles.get("anthropic")!) {
        if (path.startsWith("skills/") || path.startsWith("assets/")) expect(outputs.get(path)).toEqual(contents);
      }
      expect([...outputs.keys()].some(path => path.startsWith("skills/") && path.endsWith("/SKILL.md"))).toBe(true);
    },
  );

  test.each(withMcp.map(({ spec, source }) => [spec.name, spec, source] as const))(
    "%s: test bundle uses the Kimi layout and /kimi route without changing production bundles", async (_name, spec, source) => {
      const normal = await renderPlugin(spec, source);
      for (const baseUrl of [base, base + "/", "http://localhost:8080"]) {
        const bundles = await renderPlugin(spec, source, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: vendor, MCP_TEST_URL: baseUrl }));
        const test = new Map(bundles.get("test")!);
        const manifest = JSON.parse(test.get("kimi.plugin.json") as string);
        expect(manifest.mcpServers[spec.name].url).toBe(new URL(baseUrl).origin + "/kimi" + spec.testPath);
        manifest.mcpServers[spec.name].url = spec.mcp![vendor].url;
        test.set("kimi.plugin.json", JSON.stringify(manifest, null, 2) + "\n");
        expect(test).toEqual(bundles.get(vendor)!);
        for (const production of ["openai", "anthropic", "kimi-global", "kimi-china"]) expect(bundles.get(production)).toEqual(normal.get(production));
      }
    },
  );

  test(`writes _generated/${vendor} and removes the test bundle on a normal build`, async () => {
    const { spec } = withMcp[0]!;
    const directory = await mkdtemp(join(tmpdir(), "ai-plugins-kimi-test-"));
    try {
      await mkdir(join(directory, "skills"));
      await buildPlugin(spec, directory, readBuildOptions({ GENERATE_TEST: "true", MCP_TEST_VENDOR: vendor, MCP_TEST_URL: base }));
      const testManifest = JSON.parse(await readFile(join(directory, "_generated/test/kimi.plugin.json"), "utf8"));
      expect(testManifest.mcpServers[spec.name].url).toBe(`${base}/kimi/${spec.name.replace("helioadditive-", "")}`);
      await buildPlugin(spec, directory);
      expect(await access(join(directory, "_generated/test")).then(() => true, () => false)).toBe(false);
      expect(await access(join(directory, "_generated/kimi")).then(() => true, () => false)).toBe(false);
      const manifest = JSON.parse(await readFile(join(directory, `_generated/${vendor}/kimi.plugin.json`), "utf8"));
      expect(manifest.mcpServers[spec.name].url).toBe(spec.mcp![vendor].url);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test(`specs require a URL-only ${vendor} connection`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-plugins-kimi-spec-"));
    try {
      const source = join(directory, "example");
      await mkdir(source);
      const { spec } = withMcp[0]!;
      const url = spec.mcp![vendor].url;
      const valid = spec.mcp!;
      const { [vendor]: _removed, ...withoutVendor } = valid;
      const { "kimi-global": _g, "kimi-china": _c, ...nonKimi } = valid;
      const cases: Record<string, unknown> = {
        [`missing ${vendor}`]: withoutVendor,
        "legacy single kimi key": { ...nonKimi, kimi: { url } },
        "clientId (Kimi manifests cannot carry one)": { ...valid, [vendor]: { url, clientId: "kimi-plugin" } },
        "scopes": { ...valid, [vendor]: { url, scopes: ["slicing"] } },
        "non-HTTPS URL": { ...valid, [vendor]: { url: url.replace("https://", "http://") } },
        "credentials in URL": { ...valid, [vendor]: { url: url.replace("https://", "https://user:secret@") } },
      };
      for (const mcp of Object.values(cases)) {
        await writeFile(join(source, "spec.yaml"), JSON.stringify({ ...spec, mcp }));
        await expect(loadPluginSpecs(directory)).rejects.toThrow();
      }
      await writeFile(join(source, "spec.yaml"), JSON.stringify({ ...spec, mcp: valid }));
      await expect(loadPluginSpecs(directory)).resolves.toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("ChatGPT app-reference bundle", () => {
  const { source, spec } = plugins.find(({ spec }) => spec.mcp)!;
  const withApp = (appId: string) => ({ ...spec, mcp: { ...spec.mcp!, openai: { ...spec.mcp!.openai, appId } } });

  test("is emitted only when the spec names a registered app", async () => {
    expect((await renderPlugin(spec, source)).has("openai-app")).toBe(false);
    const bundles = await renderPlugin(withApp("asdk_app_0123abc"), source);
    const app = bundles.get("openai-app")!;
    const openai = bundles.get("openai")!;
    // Same skills, assets and metadata as the portable package; the app replaces mcp.json.
    expect([...app.keys()].sort()).toEqual([...openai.keys()].filter((path) => path !== "mcp.json").concat(".app.json").sort());
    expect(JSON.parse(String(app.get(".app.json")))).toEqual({ apps: { [spec.name]: { id: "asdk_app_0123abc", required: true } } });
    const manifest = JSON.parse(String(app.get("plugin.json")));
    const { apps, ...rest } = manifest.extensions["com.openai"];
    expect(apps).toBe("./.app.json");
    expect({ ...manifest, extensions: { "com.openai": rest } }).toEqual(JSON.parse(String(openai.get("plugin.json"))));
    // Every other bundle is unchanged by the field.
    const plain = await renderPlugin(spec, source);
    for (const [provider, outputs] of plain) expect(bundles.get(provider)).toEqual(outputs);
  });

  test("the app id must be the form ChatGPT accepts, and only OpenAI takes one", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-plugins-app-test-"));
    try {
      const example = join(directory, "example");
      await mkdir(example);
      const write = (value: unknown) => writeFile(join(example, "spec.yaml"), JSON.stringify(value));
      // ChatGPT's uploader rejects the plugin_-prefixed ID shown in its settings URL.
      for (const appId of ["plugin_asdk_app_0123abc", "asdk_app_", "connector_0123abc", ""]) {
        await write(withApp(appId));
        await expect(loadPluginSpecs(directory)).rejects.toThrow("Invalid");
      }
      await write({ ...spec, mcp: { ...spec.mcp!, anthropic: { ...spec.mcp!.anthropic, appId: "asdk_app_0123abc" } } });
      await expect(loadPluginSpecs(directory)).rejects.toThrow("Invalid");
      await write(withApp("asdk_app_0123abc"));
      await expect(loadPluginSpecs(directory)).resolves.toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
