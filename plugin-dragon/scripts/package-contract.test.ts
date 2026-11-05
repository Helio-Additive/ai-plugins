import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { packages, validateConnection, validateMarketplace } from "./package-contract";
import marketplace from "../.agents/plugins/marketplace.json";

function render(provider: string, environment = "production", source = "mcp.jsonnet") {
  return JSON.parse(execFileSync("jsonnet", [
    "--tla-str", `provider=${provider}`,
    ...(source === "mcp.jsonnet" ? ["--tla-str", `environment=${environment}`] : []),
    source,
  ], { cwd: `${import.meta.dir}/..`, encoding: "utf8", stdio: "pipe" }));
}

describe("environment and OAuth regression contracts", () => {
  for (const bundle of packages) {
    test(`${bundle.path} matches its exact resource and registration`, () => {
      const connection = render(bundle.provider, bundle.environment);
      expect(() => validateConnection(connection, bundle)).not.toThrow();
      for (const mutate of [
        (s: any) => { s.url = "https://mcp3.helioadditive.com/openai/slicing"; },
        (s: any) => { s.scopes = ["slicing"]; },
        (s: any) => { s.oauth.clientId = "unregistered-client"; },
        (s: any) => { s.oauth.callbackUrl = "http://localhost/callback"; },
        (s: any) => { s.oauth.authorizationUrl = "https://auth.example.invalid/authorize"; },
        (s: any) => { s.headers = { Authorization: "Bearer substitute" }; },
      ]) {
        const changed = structuredClone(connection);
        mutate(changed.mcpServers["helioadditive-dragon"]);
        expect(() => validateConnection(changed, bundle)).toThrow();
      }
    });
  }
  test("marketplace selects nightly with installation-time authentication", () => {
    expect(() => validateMarketplace(marketplace)).not.toThrow();
    for (const path of ["./vendors/openai", "./vendors/localhost/production"]) {
      const changed = structuredClone(marketplace);
      changed.plugins[0]!.source.path = path;
      expect(() => validateMarketplace(changed)).toThrow();
    }
  });
  test("Claude Code requests its pinned scope through oauth.scopes", () => {
    const bundle = packages.find((candidate) => candidate.provider === "anthropic")!;
    const connection = render("anthropic");
    const server = connection.mcpServers["helioadditive-dragon"];
    // Claude Code consumes a space-separated oauth.scopes string, not OpenAI's array.
    expect(server.oauth.scopes).toBe("dragon");
    expect(server.scopes).toBeUndefined();
    for (const misplaced of [
      { ...server, scopes: ["dragon"], oauth: { clientId: "generic-agent" } },
      { ...server, oauth: { clientId: "generic-agent", scopes: ["dragon"] } },
    ]) {
      expect(() => validateConnection({ mcpServers: { "helioadditive-dragon": misplaced } }, bundle)).toThrow();
    }
  });
  test("provider manifests retain identity without onboarding hooks", () => {
    const openai = render("openai", "production", "plugin.jsonnet");
    const anthropic = render("anthropic", "production", "plugin.jsonnet");
    expect(openai.extensions?.["com.openai"]?.onboardingSkill).toBeUndefined();
    expect(openai.skills).toBe("./skills/");
    expect(openai.mcpServers).toBe("./.mcp.json");
    expect(anthropic.name).toBe(openai.name);
    expect(anthropic.version).toBe(openai.version);
    expect(anthropic.author).toEqual({ name: "Helio-Additive" });
  });
  test("unknown providers and environments fail closed", () => {
    expect(() => render("unknown")).toThrow();
    expect(() => render("localhost", "unknown")).toThrow();
    expect(() => render("unknown", "production", "plugin.jsonnet")).toThrow();
  });
});
