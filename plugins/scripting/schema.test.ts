import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, print, buildASTSchema, validateSchema, type ASTNode } from "graphql";
import { mdxToMd } from "../../lib/mdx";

const directory = join(import.meta.dir, "skills/api-schema");
test("native headings and details cover every public SDL node", async () => {
  const ast = parse(await readFile(join(directory, "schema.graphqls"), "utf8"));
  const schema = buildASTSchema(ast);
  expect(validateSchema(schema)).toEqual([]);
  const markdown = (await mdxToMd(join(directory, "SKILL.mdx"))).replace(/\\([_*[\]`\\])/g, "$1");
  expect(markdown).not.toContain("```graphql");
  const roots = new Set([schema.getQueryType()?.name, schema.getMutationType()?.name, schema.getSubscriptionType()?.name].filter(Boolean));
  let fields = 0, args = 0;
  function detail(node: ASTNode, path: string, level: number) {
    const marker = "#".repeat(level - 1) + " " + path + "\n";
    const start = markdown.indexOf(marker);
    const rest = start < 0 ? markdown : markdown.slice(start + marker.length);
    const boundary = rest.search(new RegExp("^#{1," + (level - 1) + "} ", "m"));
    const content = boundary < 0 ? rest : rest.slice(0, boundary);
    if ("description" in node && node.description) expect(content).toContain(node.description.value.replace(/\s+/g, " ").trim().slice(0, 40));
    if ("type" in node) expect(content).toContain("Type: `" + print(node.type) + "`");
    if ("defaultValue" in node && node.defaultValue) expect(content).toContain("Default: `" + print(node.defaultValue) + "`");
    if ("directives" in node) for (const directive of node.directives ?? []) expect(content).toContain("Directive: `" + print(directive) + "`");
    if ("arguments" in node) for (const arg of node.arguments ?? []) {
      args++;
      expect(markdown).toContain("#".repeat(level) + " " + path + " argument " + arg.name.value + "\n");
      detail(arg, path + " argument " + arg.name.value, level + 1);
    }
    if ("fields" in node) for (const field of node.fields ?? []) {
      fields++;
      expect(markdown).toContain("#".repeat(level) + " " + path + "." + field.name.value + "\n");
      detail(field, path + "." + field.name.value, level + 1);
    }
    if (node.kind === "EnumTypeDefinition") for (const value of node.values ?? []) {
      expect(markdown).toContain("#".repeat(level) + " " + path + "." + value.name.value + "\n");
      detail(value, path + "." + value.name.value, level + 1);
    }
    if ("types" in node) for (const type of node.types ?? []) expect(markdown).toContain("#".repeat(level) + " " + path + " member " + type.name.value + "\n");
    if ("interfaces" in node) for (const type of node.interfaces ?? []) expect(markdown).toContain("#".repeat(level) + " " + path + " implements " + type.name.value + "\n");
    if ("locations" in node) for (const loc of node.locations) expect(markdown).toContain(path + " location " + loc.value);
  }
  const definitions = ast.definitions.filter(node => !("name" in node && node.name?.value.startsWith("__")));
  for (const node of definitions) {
    const name = "name" in node ? node.name?.value ?? "schema" : "schema";
    const root = roots.has(name);
    if (!root) expect(markdown).toContain("### " + name + "\n");
    detail(node, name, root ? 3 : 4);
  }
  expect(markdown).toContain(`Coverage: ${definitions.length} definitions; ${fields} fields/input fields; ${args} arguments.`);
  for (const group of ["Queries", "Mutations", "Subscriptions", "Objects", "Inputs", "Interfaces", "Enums", "Unions", "Scalars", "Directives"]) expect(markdown).toContain("## " + group + "\n");
});
