import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import Ajv from "ajv";
import { mdxToMd } from "./mdx";
import pluginSpecSchema from "../schemas/plugin-spec.schema.json";
import type { AgentPluginsManifest } from "./_generated/plugin";
import type { AgentPluginsMCPConfiguration, StreamableHTTPMCPServer } from "./_generated/mcp";
import type { PluginSpec } from "./_generated/plugin-spec";

export const releaseVersion: string = (await import("../package.json")).default.version;
export const root = resolve(import.meta.dir, "..");
export type BuildOptions = { testUrl?: string; testVendor?: string };
export type Outputs = Map<string, string | Buffer>;

const ajv = new Ajv({ allErrors: true });
const isPluginSpec = ajv.compile<PluginSpec>(pluginSpecSchema);

function checkedUrl(value: string, label: string, allowHttp = false): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`${label} must be an absolute ${allowHttp ? "HTTP or HTTPS" : "HTTPS"} URL.`); }
  if (!(url.protocol === "https:" || (allowHttp && url.protocol === "http:"))
    || !url.hostname || url.username || url.password || url.hash) {
    throw new Error(`${label} must use ${allowHttp ? "HTTP or HTTPS" : "HTTPS"} without credentials or a fragment.`);
  }
  return value;
}

export function readBuildOptions(env: Record<string, string | undefined>): BuildOptions {
  if (env.GENERATE_TEST !== "true") return {};
  const testUrl = env.MCP_TEST_URL?.trim();
  if (!testUrl) throw new Error("GENERATE_TEST=true requires MCP_TEST_URL (a base URL).");
  return { testUrl: checkedTestBaseUrl(testUrl), testVendor: checkedTestVendor(env.MCP_TEST_VENDOR) };
}

const kimiVendors = ["kimi-global", "kimi-china"] as const;
type KimiVendor = (typeof kimiVendors)[number];
type Vendor = "openai" | "anthropic" | KimiVendor;

const isKimiVendor = (value: unknown): value is KimiVendor => kimiVendors.includes(value as KimiVendor);

function checkedTestVendor(value: string | undefined): Vendor {
  if (value !== "openai" && value !== "anthropic" && !isKimiVendor(value)) {
    throw new Error("MCP_TEST_VENDOR must be openai, anthropic, kimi-global, or kimi-china.");
  }
  return value;
}

/** Gateway route prefix for a vendor. Both Kimi regions share `/kimi/<plugin>` on their own domains. */
const routePrefix = (vendor: Vendor) => isKimiVendor(vendor) ? "kimi" : vendor;

function checkedTestBaseUrl(value: string): string {
  const url = new URL(checkedUrl(value, "MCP_TEST_URL", true));
  if (url.pathname !== "/" || url.search) {
    throw new Error("MCP_TEST_URL must be a base URL without a path or query; each plugin supplies its testPath.");
  }
  return url.origin;
}

/** Discover and validate every spec before any generated bundle is replaced. */
export async function loadPluginSpecs(directory = join(root, "plugins")) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) throw new Error(`No plugin directories found in ${directory}.`);
  const plugins = await Promise.all(entries.map(async (entry) => {
    const source = join(directory, entry.name);
    const file = join(source, "spec.yaml");
    const contents = await readFile(file, "utf8");
    let spec: unknown;
    try { spec = Bun.YAML.parse(contents); }
    catch (cause) { throw new Error(`Invalid YAML in ${relative(root, file)}.`, { cause }); }
    if (!isPluginSpec(spec)) {
      throw new Error(`Invalid ${relative(root, file)}: ${ajv.errorsText(isPluginSpec.errors, { separator: "; " })}`);
    }
    if (spec.homepage !== undefined) checkedUrl(spec.homepage, `${relative(root, file)} homepage`);
    if (spec.openaiSubmission) {
      for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"] as const) {
        const value = spec.openaiSubmission[key];
        if (value !== undefined) checkedUrl(value, `${relative(root, file)} ${key}`);
      }
    }
    for (const [provider, connection] of Object.entries(spec.mcp ?? {})) {
      checkedUrl(connection.url, `${relative(root, file)} mcp.${provider}.url`);
    }
    return { source, spec };
  }));
  const names = new Set<string>();
  for (const { spec } of plugins) {
    if (names.has(spec.name)) throw new Error(`Duplicate plugin name: ${spec.name}.`);
    names.add(spec.name);
  }
  return plugins;
}

export function providersFor(options: BuildOptions = {}) {
  return options.testUrl === undefined
    ? ["openai", "anthropic", "kimi-global", "kimi-china", "codex"] as const
    : ["openai", "anthropic", "kimi-global", "kimi-china", "codex", "test"] as const;
}

async function files(directory: string): Promise<string[]> {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name)).sort();
}

// Stable formatting keeps generated diffs independent of construction order.
function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  }, 2) + "\n";
}

/** Assemble complete provider bundles in memory before writing any output. */
export async function renderPlugin(spec: PluginSpec, source: string, options: BuildOptions = {}): Promise<Map<string, Outputs>> {
  const shared: Outputs = new Map();
  const skillsDirectory = join(source, "skills");
  for (const path of await files(skillsDirectory)) {
    if (!path.endsWith(".mdx")) continue;
    const contents = await readFile(path, "utf8");
    const frontmatter = contents.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0] ?? "";
    const markdown = await mdxToMd(path);
    shared.set(join("skills", relative(skillsDirectory, path).slice(0, -1)),
      `${frontmatter ? `${frontmatter.trimEnd()}\n\n` : ""}${markdown.trimEnd()}\n`);
  }
  const assetsDirectory = join(root, "assets");
  for (const path of await files(assetsDirectory)) {
    shared.set(join("assets", relative(assetsDirectory, path)), await readFile(path));
  }
  if (!shared.has("assets/icon.png") && shared.has("assets/logo.png")) {
    shared.set("assets/icon.png", shared.get("assets/logo.png")!);
  }
  const manifest = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: spec.name,
    version: releaseVersion,
    description: spec.description,
    ...(spec.homepage === undefined ? {} : { homepage: spec.homepage }),
    author: { name: "Helio-Additive" },
    extensions: {
      "com.openai": {
        interface: {
          displayName: spec.displayName,
          shortDescription: spec.shortDescription,
          longDescription: spec.longDescription,
          ...(spec.homepage === undefined ? {} : { websiteURL: spec.homepage }),
          defaultPrompt: spec.defaultPrompts,
          developerName: "Helio-Additive",
          composerIcon: "./assets/icon.png",
          composerIconDark: "./assets/logo-dark.png",
          logo: "./assets/logo.png",
          logoDark: "./assets/logo-dark.png",
          category: "Productivity",
          capabilities: ["Read", "Write"],
        },
      },
    },
  } satisfies AgentPluginsManifest;
  // Kimi Code CLI reads only kimi.plugin.json (https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html).
  // Its mcpServers reuse Kimi's MCP schema, which has no OAuth client or scope fields:
  // the CLI discovers OAuth metadata and registers a public client dynamically, so only
  // the endpoint is projected. Presentation uses Kimi's own `interface` fields.
  const kimiManifest = (url?: string) => json({
    name: spec.name, version: releaseVersion, description: spec.description, author: manifest.author,
    skills: "./skills/",
    interface: {
      displayName: spec.displayName, shortDescription: spec.shortDescription,
      longDescription: spec.longDescription, developerName: manifest.author.name,
    },
    ...(url === undefined ? {} : { mcpServers: { [spec.name]: { url } } }),
  });
  const openaiInterface = {
    ...manifest.extensions["com.openai"].interface,
    ...(spec.openaiSubmission?.longDescription ? { longDescription: spec.openaiSubmission.longDescription } : {}),
  };
  const packages = new Map<string, Outputs>();
  for (const provider of providersFor(options)) {
    const outputs = new Map(shared);
    const codex = provider === "codex" || (provider === "test" && options.testVendor === "openai");
    const vendor = provider === "test" ? checkedTestVendor(options.testVendor)
      : provider === "codex" ? "openai" : provider;
    const connection = spec.mcp?.[vendor];
    let portableManifest: AgentPluginsManifest = manifest;
    if (provider === "openai" && spec.openaiSubmission) {
      const { introduction, developerName, supportURL, privacyPolicyURL, termsOfServiceURL, releaseNotes, cases } = spec.openaiSubmission;
      const website = spec.openaiSubmission.websiteURL ?? spec.homepage;
      portableManifest = {
        ...manifest,
        author: { name: developerName },
        ...(website ? { homepage: website } : {}),
        extensions: { "com.openai": {
          interface: {
            ...openaiInterface, developerName, supportURL, privacyPolicyURL, termsOfServiceURL,
            ...(website ? { websiteURL: website } : {}),
            longDescription: [introduction, openaiInterface.longDescription].filter(Boolean).join(" "),
          },
          ...(cases ? { review: { test_cases: cases } } : {}),
          publication: { release_notes: releaseNotes },
        } },
      } satisfies AgentPluginsManifest;
    }
    if (!connection) {
      if (isKimiVendor(vendor)) {
        outputs.set("kimi.plugin.json", kimiManifest());
        packages.set(provider, outputs);
        continue;
      }
      outputs.set("plugin.json", json(portableManifest));
      if (vendor === "anthropic") {
        outputs.set(".claude-plugin/plugin.json", json({ name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author, ...(spec.homepage === undefined ? {} : { homepage: spec.homepage }) }));
      } else if (codex) {
        outputs.delete("plugin.json");
        outputs.set(".codex-plugin/plugin.json", json({ name: manifest.name, version: manifest.version, description: manifest.description, interface: openaiInterface, skills: "./skills/" }));
      }
      packages.set(provider, outputs);
      continue;
    }
    const url = provider === "test" && options.testUrl !== undefined
      ? checkedTestBaseUrl(options.testUrl) + "/" + routePrefix(vendor) + spec.testPath
      : connection.url;
    if (isKimiVendor(vendor)) {
      outputs.set("kimi.plugin.json", kimiManifest(url));
      packages.set(provider, outputs);
      continue;
    }
    // A URL-only OpenAI connection leaves registration and scopes to the host.
    const oauth = "clientId" in connection ? connection : undefined;
    const server = {
      type: "streamable-http",
      url,
      extensions: {
        "com.openai": {
          auth: {
            type: "oauth",
            ...(oauth ? { client: {
              mode: "provided", clientId: oauth.clientId,
              ...(oauth.tokenEndpointAuthMethod ? { tokenEndpointAuthMethod: oauth.tokenEndpointAuthMethod } : {}),
            } } : {}),
            ...(oauth?.scopes ? { baseScopes: oauth.scopes } : {}),
          },
        },
      },
    } satisfies StreamableHTTPMCPServer & Pick<AgentPluginsManifest, "extensions">;
    const mcp = {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { [spec.name]: server },
    } satisfies AgentPluginsMCPConfiguration;
    outputs.set("plugin.json", json(portableManifest));
    if (vendor === "anthropic") {
      // Claude's native installer still uses these compatibility entrypoints.
      // Project portable identity and connection data; do not maintain parallel types.
      outputs.set(".claude-plugin/plugin.json", json({
        name: manifest.name, version: manifest.version,
        description: manifest.description, author: manifest.author,
        ...(spec.homepage === undefined ? {} : { homepage: spec.homepage }),
      }));
      outputs.set(".mcp.json", json({
        mcpServers: {
          [spec.name]: {
            type: "http",
            url: server.url,
            ...(oauth ? { oauth: {
              clientId: oauth.clientId,
              ...(oauth.scopes ? { scopes: oauth.scopes.join(" ") } : {}),
            } } : {}),
          },
        },
      }));
    } else if (codex) {
      // The desktop legacy loader ignores MCP servers when root plugin.json exists.
      outputs.delete("plugin.json");
      outputs.set(".codex-plugin/plugin.json", json({
        name: manifest.name, version: manifest.version, description: manifest.description,
        interface: openaiInterface,
        skills: "./skills/", mcpServers: "./.mcp.json",
      }));
      outputs.set(".mcp.json", json({ mcpServers: { [spec.name]: {
        type: "http", url: server.url,
        ...(oauth ? { oauth: { clientId: oauth.clientId, callbackUrl: "http://127.0.0.1/callback" } } : {}),
        ...(oauth?.scopes ? { scopes: oauth.scopes } : {}),
      } } }));
    } else {
      outputs.set("mcp.json", json(mcp));
    }
    packages.set(provider, outputs);
  }
  return packages;
}

export async function buildPlugin(spec: PluginSpec, source: string, options: BuildOptions = {}): Promise<void> {
  // Render everything first, preserving previous installations on compilation errors.
  const packages = await renderPlugin(spec, source, options);
  const destination = join(source, "_generated");
  // Stage beside the destination so the final rename is always on the same filesystem.
  const staging = await mkdtemp(join(dirname(destination), ".generated-"));
  try {
    for (const [bundle, outputs] of packages) {
      for (const [path, contents] of outputs) {
        const destination = join(staging, bundle, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, contents);
      }
    }
    // Everything below _generated is owned by this generator, including stale bundles.
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log(`Built ${relative(root, destination)} (${packages.size} bundles)`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
