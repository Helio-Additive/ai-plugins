import { expect, test } from "bun:test";
import { nonProductionServers, productionHost } from "./package";

const mcp = (...urls: string[]) => JSON.stringify({
  mcpServers: Object.fromEntries(urls.map((url, index) => [`server-${index}`, { url }])),
});

test("official packages accept only the production gateway over HTTPS", () => {
  expect(nonProductionServers(mcp(`https://${productionHost}/openai/slicing`))).toEqual([]);
  for (const url of [
    "https://mcp3.helioadditive.com/openai/slicing",
    "https://mcp2.helioadditive.com/openai/slicing",
    `http://${productionHost}/openai/slicing`,
    `https://${productionHost}.example.com/openai/slicing`,
    `https://${productionHost}:8443/openai/slicing`,
    "http://127.0.0.1:8080/openai/slicing",
  ]) {
    expect(nonProductionServers(mcp(`https://${productionHost}/openai/dragon`, url))).toEqual([url]);
  }
});
