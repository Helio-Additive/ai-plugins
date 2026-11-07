import { expect, test } from "bun:test";
import { install } from "./install";
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
        if (cmd.includes("marketplace")) return JSON.stringify(host === "claude" ? entries : { marketplaces: entries });
        const plugins = [{ id: "other@other", name: "other", marketplaceName: "other", scope: "user" },
          ...(present ? [{ id: "helioadditive-dragon@helioadditive-plugins", name: "helioadditive-dragon", marketplaceName: "helioadditive-plugins", scope: "user" }] : [])];
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
  expect(() => install("invalid", () => { throw Error("must not run"); }, "/repo")).toThrow("Host must");
  expect(() => install("claude", () => { throw Error("failure"); }, "/repo")).toThrow("failure");
});
test("inventory parse failures and extra Helio plugins fail before removal", () => {
  for (const value of ["invalid JSON", JSON.stringify([{ id: "extra@helioadditive-plugins", scope: "user" }])]) {
    const calls: string[][] = [];
    expect(() => install("claude", cmd => {
      calls.push(cmd);
      return cmd[0] === "just" ? "" : value;
    }, "/repo")).toThrow();
    expect(calls.some(c => c.includes("remove") || c.includes("uninstall"))).toBe(false);
  }
});
