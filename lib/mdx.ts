import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { bundleMDX } from "mdx-bundler";
import { getMDXComponent } from "mdx-bundler/client";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/** Render trusted source MDX, including build-time filesystem composition. */
export async function mdxToMd(path: string): Promise<string> {
  const url = pathToFileURL(path).href;
  const { code } = await bundleMDX({
    source: await readFile(path, "utf8"),
    cwd: dirname(path),
    esbuildOptions(options) {
      return {
        ...options,
        platform: "node",
        // The evaluated bundle needs a require function for external Node imports.
        banner: { js: `var require = process.getBuiltinModule("node:module").createRequire(${JSON.stringify(url)});` },
        define: { ...options.define, "import.meta.url": JSON.stringify(url) },
        plugins: [{
          name: "node-builtins",
          setup(build) {
            build.onResolve({ filter: /^node:/ }, args => ({ path: args.path, external: true }));
          },
        }, ...(options.plugins ?? [])],
      };
    },
  });
  return new NodeHtmlMarkdown().translate(renderToString(createElement(getMDXComponent(code))));
}
