import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadPluginSpecs } from "../lib/build";

/** The production MCP gateway. Official packages may name no other server. */
export const productionHost = "mcp.helioadditive.com";

/** Server URLs in a portable `mcp.json` that an official package must not ship. */
export function nonProductionServers(mcpJson: string): string[] {
  const servers: Record<string, { url: string }> = JSON.parse(mcpJson).mcpServers ?? {};
  return Object.values(servers).map((server) => server.url).filter((url) => {
    const { protocol, host } = new URL(url);
    return protocol !== "https:" || host !== productionHost;
  });
}

// Zip the ChatGPT upload packages into out/.
//   no argument: official packages from _generated/openai; refused unless every
//                server is the production gateway.
//   <base URL>:  test packages for that server from _generated/test-chatgpt,
//                named after its host.
if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..");
    const testUrl = process.argv[2] ?? "";
    const run = (cmd: string[], cwd: string, env: Record<string, string> = {}) => {
      const result = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
      if (result.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed (${result.exitCode}).`);
    };
    run(["just", "make"], root, testUrl
      ? { GENERATE_TEST: "true", MCP_TEST_URL: testUrl, MCP_TEST_VENDOR: "openai" }
      : { GENERATE_TEST: "false" });
    const plugins = await loadPluginSpecs();
    if (!testUrl) {
      const refused: string[] = [];
      for (const { source, spec } of plugins) {
        if (!spec.mcp) continue;
        const servers = nonProductionServers(await readFile(join(source, "_generated", "openai", "mcp.json"), "utf8"));
        if (servers.length) refused.push(`${spec.name}: ${servers.join(", ")}`);
      }
      if (refused.length) {
        throw new Error(`Official packages must use https://${productionHost}. Not packaged:\n  ${refused.join("\n  ")}\n`
          + "For a test package, pass the server's base URL: just package <base URL>");
      }
    }
    const out = join(root, "out");
    await mkdir(out, { recursive: true });
    const suffix = testUrl ? `-${new URL(testUrl).host.replace(":", "-")}` : "";
    for (const { source, spec } of plugins) {
      const target = join(out, `${spec.name}-${spec.version}-chatgpt${suffix}.zip`);
      // zip updates an existing archive in place; start clean so no stale file survives.
      await rm(target, { force: true });
      run(["zip", "-qrX", target, "."], join(source, "_generated", testUrl ? "test-chatgpt" : "openai"));
      console.log(`Packaged ${target}`);
    }
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
