import { resolve } from "node:path";

export const marketplace = "helioadditive-plugins";
const names = ["helioadditive-dragon", "helioadditive-slicing"];
type Run = (args: string[], env?: Record<string, string>) => string;

export function install(host: string, run: Run, root: string) {
  if (host !== "codex" && host !== "claude") throw new Error("Host must be codex or claude.");
  run(["just", "make"], {
    GENERATE_TEST: "true", MCP_TEST_URL: "https://mcp3.helioadditive.com",
    MCP_TEST_VENDOR: host === "codex" ? "openai" : "anthropic",
  });
  const listed = JSON.parse(run([host, "plugin", "list", "--json"]));
  const installed = host === "claude" ? listed : listed.installed;
  if (!Array.isArray(installed)) throw new Error("Unexpected installed-plugin response.");
  if (installed.some((p) => {
    const id = host === "claude" ? p.id : p.pluginId;
    return typeof id === "string" && id.endsWith(`@${marketplace}`)
      && !names.some(name => id === `${name}@${marketplace}`);
  })) throw new Error("Additional plugins use the Helio marketplace; refusing marketplace replacement.");
  for (const name of names) {
    const id = `${name}@${marketplace}`;
    if (installed.some((p) => host === "claude"
      ? p.id === id && p.scope === "user"
      : p.name === name && p.marketplaceName === marketplace)) {
      run(host === "claude"
        ? [host, "plugin", "uninstall", id, "--scope", "user", "--keep-data"]
        : [host, "plugin", "remove", id]);
    }
  }
  const catalog = JSON.parse(run([host, "plugin", "marketplace", "list", "--json"]));
  const entries = host === "claude" ? catalog : catalog.marketplaces;
  if (!Array.isArray(entries)) throw new Error("Unexpected marketplace response.");
  if (entries.some((m) => m.name === marketplace)) {
    run([host, "plugin", "marketplace", "remove", marketplace,
      ...(host === "claude" ? ["--scope", "user"] : [])]);
  }
  run([host, "plugin", "marketplace", "add", root]);
  for (const name of names) run([host, "plugin", host === "claude" ? "install" : "add", `${name}@${marketplace}`]);
}

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..");
    install(process.argv[2] ?? "", (cmd, env) => {
      const result = Bun.spawnSync(cmd, { cwd: root, env: { ...process.env, ...env }, stdout: "pipe", stderr: "inherit" });
      const output = result.stdout.toString();
      if (!cmd.includes("--json")) process.stdout.write(output);
      if (result.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed (${result.exitCode}).`);
      return output;
    }, root);
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
