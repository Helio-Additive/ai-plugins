import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mdxToMd } from "../../lib/mdx";

test("the entrypoint discovers added files, reloads edits, and rebases included links", async () => {
  const cache = resolve(import.meta.dir, "../../.cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "scripting-composition-"));
  const entrypoint = join(directory, "SKILL.mdx");
  try {
    await mkdir(join(directory, "templates/zeta"), { recursive: true });
    await writeFile(join(directory, "templates/zeta/README.mdx"),
      "# Zeta\n\n[Schema](../../references/schema-workflow.md)\n\nOriginal template.\n");
    await writeFile(entrypoint, await readFile(resolve(import.meta.dir, "skills/graphql-scripting/SKILL.mdx"), "utf8"));
    const first = await mdxToMd(entrypoint);
    expect(first).toContain("Obtain explicit consent");
    expect(first).toContain("└── zeta/");
    expect(first).toContain("Original template.");
    expect(first).toContain("[Schema](references/schema-workflow.md)");

    await writeFile(join(directory, "templates/zeta/README.mdx"), "# Zeta\n\nUpdated template.\n");
    await mkdir(join(directory, "templates/alpha/nested"), { recursive: true });
    await writeFile(join(directory, "templates/alpha/nested/main.go"), 'package main\n\nfunc main() { println("fresh file") }\n');
    const second = await mdxToMd(entrypoint);
    expect(second).toContain("Updated template.");
    expect(second).not.toContain("Original template.");
    expect(second).toContain("templates/alpha/nested/main.go");
    expect(second).toContain('func main() { println("fresh file") }');
    expect(second.indexOf("├── alpha/")).toBeLessThan(second.indexOf("└── zeta/"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
