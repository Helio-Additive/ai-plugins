import { resolve } from "node:path";

export const marketplace = "helioadditive-plugins";
const names = ["helioadditive-dragon", "helioadditive-slicing"];
type Run = (args: string[], env?: Record<string, string>) => string;

export class CommandError extends Error {
  constructor(readonly args: string[], readonly exitCode: number, readonly stderr: string) {
    super(`${args.join(" ")} failed (${exitCode}).${stderr ? `\n${stderr.trim()}` : ""}`);
  }
}

export function install(host: string, run: Run, root: string) {
  if (host !== "codex" && host !== "claude") throw new Error("Host must be codex or claude.");
  run(["just", "make"], {
    GENERATE_TEST: "true", MCP_TEST_URL: "https://mcp3.helioadditive.com",
    MCP_TEST_VENDOR: host === "codex" ? "openai" : "anthropic",
  });
  // Codex loads every configured marketplace unless this inventory is scoped.
  const listed = JSON.parse(run([host, "plugin", "list", "--json",
    ...(host === "codex" ? ["--marketplace", marketplace] : [])]));
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
  if (host === "claude") {
    const entries = JSON.parse(run([host, "plugin", "marketplace", "list", "--json"]));
    if (!Array.isArray(entries)) throw new Error("Unexpected marketplace response.");
    if (entries.some((m) => m.name === marketplace)) {
      run([host, "plugin", "marketplace", "remove", marketplace, "--scope", "user"]);
    }
    // The local installer uses the generated test bundles; the repository root
    // catalog is independently installable from Git and uses committed bundles.
    run([host, "plugin", "marketplace", "add", resolve(root, ".cache/claude-local-marketplace")]);
  } else {
    // Marketplace list is also global in Codex. Add is idempotent for the same
    // source; replace only our registration on the CLI's specific source conflict.
    // Keep the local installer on generated test bundles. The repository-root
    // catalog is independently installable from Git and uses committed bundles.
    const add = [host, "plugin", "marketplace", "add", resolve(root, ".cache/codex-local-marketplace")];
    try { run(add); } catch (error) {
      if (!(error instanceof CommandError) || error.exitCode !== 1
        || JSON.stringify(error.args) !== JSON.stringify(add)
        || error.stderr.trim() !== `Error: marketplace '${marketplace}' is already added from a different source; remove it before adding this source`) throw error;
      run([host, "plugin", "marketplace", "remove", marketplace]);
      run(add);
    }
  }
  for (const name of names) run([host, "plugin", host === "claude" ? "install" : "add", `${name}@${marketplace}`]);
}

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..");
    install(process.argv[2] ?? "", (cmd, env) => {
      const result = Bun.spawnSync(cmd, { cwd: root, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
      const output = result.stdout.toString();
      if (!cmd.includes("--json")) process.stdout.write(output);
      if (result.exitCode !== 0) throw new CommandError(cmd, result.exitCode, result.stderr.toString());
      process.stderr.write(result.stderr);
      return output;
    }, root);
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
