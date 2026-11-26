import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPluginSpecs, renderPlugin } from "./build";

const plugins = await loadPluginSpecs();
const sourceUrl = "https://github.com/Helio-Additive/slicer-cli/blob/main/docs/open-source.md";

describe("public plugin metadata", () => {
  let metadataSource: string;
  beforeAll(async () => {
    metadataSource = await mkdtemp(join(tmpdir(), "plugin-metadata-"));
    await mkdir(join(metadataSource, "skills", "example"), { recursive: true });
    await writeFile(join(metadataSource, "skills", "example", "SKILL.mdx"),
      "---\nname: example\ndescription: Minimal metadata test fixture.\n---\n\nPreserve this skill.\n");
  });
  afterAll(async () => {
    if (metadataSource) await rm(metadataSource, { recursive: true, force: true });
  });

  test("homepage is optional and rejects invalid or credential-bearing URLs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "plugin-homepage-"));
    try {
      const source = join(directory, "example");
      await mkdir(source);
      for (const homepage of [undefined, "https://example.com/product"]) {
        await writeFile(join(source, "spec.yaml"), JSON.stringify({ ...plugins[0]!.spec, homepage }));
        expect((await loadPluginSpecs(directory))[0]!.spec.homepage).toBe(homepage);
      }
      for (const homepage of ["", "http://example.com", "/relative", "https://", "https://bad host",
        "https://user:secret@example.com", "https://user@example.com", "https://example.com/#fragment",
        "https://example.com/" + "x".repeat(1024)]) {
        await writeFile(join(source, "spec.yaml"), JSON.stringify({ ...plugins[0]!.spec, homepage }));
        await expect(loadPluginSpecs(directory)).rejects.toThrow();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  for (const { spec } of plugins) {
    test(`${spec.name}: projects optional homepage without changing MCP or OAuth`, async () => {
      const homepage = "https://example.com/product";
      for (const testVendor of ["openai", "anthropic"]) {
        const options = { testUrl: "http://localhost:8080", testVendor };
        // Metadata projection does not require recompiling the full scripting
        // schema. A real small skill still checks unchanged non-manifest bytes.
        const base = { ...spec, openaiSubmission: spec.openaiSubmission && { ...spec.openaiSubmission, websiteURL: undefined } };
        const baseline = await renderPlugin({ ...base, homepage: undefined }, metadataSource, options);
        const bundles = await renderPlugin({ ...base, homepage }, metadataSource, options);
        for (const [provider, outputs] of bundles) {
          for (const [path, content] of outputs) {
            if (!path.endsWith("plugin.json")) {
              expect(content).toEqual(baseline.get(provider)!.get(path)!);
              continue;
            }
            const manifest = JSON.parse(String(content));
            const before = JSON.parse(String(baseline.get(provider)!.get(path)));
            expect(before.homepage).toBeUndefined();
            expect(before.extensions?.["com.openai"]?.interface?.websiteURL).toBeUndefined();
            expect(before.interface?.websiteURL).toBeUndefined();
            if (path === "kimi.plugin.json") {
              // No undocumented Kimi homepage/websiteURL fields.
              expect(manifest).toEqual(before);
              continue;
            }
            if (path === ".codex-plugin/plugin.json") {
              expect(manifest.interface.websiteURL).toBe(homepage);
              delete manifest.interface.websiteURL;
            } else {
              expect(manifest.homepage).toBe(homepage);
              delete manifest.homepage;
              if (path === "plugin.json") {
                expect(manifest.extensions["com.openai"].interface.websiteURL).toBe(homepage);
                delete manifest.extensions["com.openai"].interface.websiteURL;
              }
            }
            expect(manifest).toEqual(before);
          }
        }
      }
    });
  }

  for (const name of ["helioadditive-slicing", "helioadditive-dragon"]) {
    test(`${name}: source links reach every provider without assigning a plugin licence`, async () => {
      const { spec, source } = plugins.find(p => p.spec.name === name)!;
      expect(spec.homepage).toBe("https://www.helioadditive.com");
      expect(spec.shortDescription.length).toBeLessThanOrEqual(30);
      for (const testVendor of ["openai", "anthropic"]) {
        const bundles = await renderPlugin(spec, source, { testUrl: "http://localhost:8080", testVendor });
        for (const outputs of bundles.values()) {
          for (const [path, content] of outputs) {
            if (!path.endsWith("plugin.json")) continue;
            const manifest = JSON.parse(String(content));
            expect(manifest.description).toContain(sourceUrl);
            expect(manifest.license).toBeUndefined();
            const presentation = manifest.extensions?.["com.openai"]?.interface ?? manifest.interface;
            if (presentation) expect(presentation.longDescription).toContain(sourceUrl);
          }
          const skills = name === "helioadditive-slicing"
            ? ["helio-slicing-tools", "create-slice", "gcode-timing"] : ["helio-dragon-tools"];
          for (const skill of skills) {
            expect(String(outputs.get(`skills/${skill}/SKILL.md`))).toContain(sourceUrl);
          }
        }
      }
    });
  }
});
