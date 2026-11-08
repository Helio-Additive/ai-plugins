import { expect, test } from "bun:test";
import { CommandError, install, marketplace } from "./install";
for (const host of ["codex", "claude"]) for (const present of [false, true]) {
  test(`${host}: scoped replacement, present=${present}`, () => {
    const calls: string[][] = [];
    install(host, (cmd, env) => {
      calls.push(cmd);
      if (cmd[0] === "just") {
        expect(env?.MCP_TEST_VENDOR).toBe(host === "codex" ? "openai" : "anthropic");
        expect(env?.GENERATE_TEST).toBe("true");
        expect(env?.MCP_TEST_URL).toBe("https://mcp3.helioadditive.com");
      }
      if (cmd.includes("list")) {
        const entries = present ? [{ name: "helioadditive-plugins" }] : [];
        if (cmd[2] === "marketplace") {
          expect(host).toBe("claude");
          return JSON.stringify(entries);
        }
        if (host === "codex") expect(cmd).toEqual(["codex", "plugin", "list", "--json", "--marketplace", marketplace]);
        const plugins = [{ id: "other@other", pluginId: "other@other", name: "other", marketplaceName: "other", scope: "user" },
          ...(present ? [{ id: "helioadditive-dragon@helioadditive-plugins", pluginId: "helioadditive-dragon@helioadditive-plugins", name: "helioadditive-dragon", marketplaceName: "helioadditive-plugins", scope: "user" }] : [])];
        return JSON.stringify(host === "claude" ? plugins : { installed: plugins });
      }
      return "";
    }, "/repo");
    expect(calls.at(-1)).toEqual([host, "plugin", host === "claude" ? "install" : "add", "helioadditive-slicing@helioadditive-plugins"]);
    expect(calls.filter(c => c.includes("uninstall") || (c.includes("remove") && !c.includes("marketplace")))).toHaveLength(present ? 1 : 0);
    expect(calls.flat()).not.toContain("other@other");
  });
}
test("unsupported host and command failures stop installation", () => {
  for (const host of ["invalid", "code", ""]) expect(() => install(host, () => { throw Error("must not run"); }, "/repo")).toThrow("Host must");
  expect(() => install("claude", () => { throw Error("failure"); }, "/repo")).toThrow("failure");
});
test("inventory parse failures and extra Helio plugins fail before removal", () => {
  for (const host of ["codex", "claude"]) for (const value of ["invalid JSON", "{}", "null",
    JSON.stringify(host === "claude" ? [{ id: `extra@${marketplace}`, scope: "user" }]
      : { installed: [{ pluginId: `extra@${marketplace}`, name: "extra", marketplaceName: marketplace }] })]) {
    const calls: string[][] = [];
    expect(() => install(host, cmd => {
      calls.push(cmd);
      return cmd[0] === "just" ? "" : value;
    }, "/repo")).toThrow();
    expect(calls).toHaveLength(2);
  }
});

const conflict = `Error: marketplace '${marketplace}' is already added from a different source; remove it before adding this source\n`;
const add = ["codex", "plugin", "marketplace", "add", "/repo"];

test("Codex replaces only its marketplace on a source conflict, then installs both plugins", () => {
  const calls: string[][] = [];
  let adds = 0;
  install("codex", cmd => {
    calls.push(cmd);
    if (cmd[2] === "list") return '{"installed":[]}';
    if (cmd.join(" ") === add.join(" ") && ++adds === 1) throw new CommandError(cmd, 1, conflict);
    return "";
  }, "/repo");
  expect(calls.slice(2)).toEqual([
    add, ["codex", "plugin", "marketplace", "remove", marketplace], add,
    ["codex", "plugin", "add", `helioadditive-dragon@${marketplace}`],
    ["codex", "plugin", "add", `helioadditive-slicing@${marketplace}`],
  ]);
});

test("Codex does not treat other failures as permission to replace a marketplace", () => {
  for (const error of [new Error("generic failure"),
    new CommandError(add, 1, "invalid marketplace file"),
    new CommandError(add, 1, conflict.replace(marketplace, "helio-devops")),
    new CommandError(add, 2, conflict),
    new CommandError(["codex", "plugin", "add", "other"], 1, conflict),
    new CommandError(add, 1, `warning: another error\n${conflict}`)]) {
    const calls: string[][] = [];
    expect(() => install("codex", cmd => {
      calls.push(cmd);
      if (cmd[2] === "list") return '{"installed":[]}';
      if (cmd[2] === "marketplace") throw error;
      return "";
    }, "/repo")).toThrow(error);
    expect(calls).toHaveLength(3);
    expect(calls.at(-1)).toEqual(add);
  }
});

test("Codex stops on build, inventory, removal, re-add, and plugin-add failures", () => {
  for (const failAt of [0, 1, 2, 4, 5, 6, 7]) {
    const calls: string[][] = [];
    const failure = new Error("command failed");
    expect(() => install("codex", cmd => {
      const index = calls.length;
      calls.push(cmd);
      if (index === failAt) throw failure;
      if (cmd[2] === "list") return JSON.stringify({ installed: [{ pluginId: `helioadditive-dragon@${marketplace}`, name: "helioadditive-dragon", marketplaceName: marketplace }] });
      if (index === 3) throw new CommandError(cmd, 1, conflict);
      return "";
    }, "/repo")).toThrow(failure);
    expect(calls).toHaveLength(failAt + 1);
  }
});
