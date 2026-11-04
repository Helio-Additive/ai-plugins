import { deepStrictEqual, strictEqual } from "node:assert";

// Independent expected routing matrix: do not derive this from the generator.
export const packages = [
  { path: "localhost/nightly", host: "mcp3.helioadditive.com", provider: "localhost", environment: "nightly" },
  { path: "localhost/staging", host: "mcp2.helioadditive.com", provider: "localhost", environment: "staging" },
  { path: "localhost/production", host: "mcp.helioadditive.com", provider: "localhost", environment: "production" },
  { path: "openai", host: "mcp.helioadditive.com", provider: "openai", environment: "production" },
  { path: "anthropic", host: "mcp.helioadditive.com", provider: "anthropic", environment: "production" },
] as const;

export function validateConnection(connection: unknown, bundle: typeof packages[number]) {
  const anthropic = bundle.provider === "anthropic";
  // Exact shape also prevents embedded credentials or hardcoded auth endpoints.
  deepStrictEqual(connection, {
    mcpServers: {
      "helioadditive-dragon": {
        type: "http",
        url: `https://${bundle.host}/${anthropic ? "" : "openai/"}dragon`,
        ...(anthropic ? {} : { scopes: ["dragon"] }),
        oauth: anthropic
          ? { clientId: "generic-agent", scopes: "dragon" }
          : { clientId: "openai-dragon-plugin", callbackUrl: "http://127.0.0.1/callback" },
      },
    },
  }, `Invalid ${bundle.path} resource or OAuth registration contract`);
}

export function validateMarketplace(marketplace: {
  plugins: Array<{ name: string; source: unknown; policy: unknown }>;
}) {
  strictEqual(marketplace.plugins.length, 1);
  const entry = marketplace.plugins[0]!;
  strictEqual(entry.name, "helioadditive-dragon");
  deepStrictEqual(entry.source, { source: "local", path: "./vendors/localhost/nightly" });
  deepStrictEqual(entry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
}
