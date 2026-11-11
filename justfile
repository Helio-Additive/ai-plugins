# Generate plugin packages from TypeScript, MDX, and shared assets.
# Optional local bundles: GENERATE_TEST=true MCP_TEST_URL=<base URL> just make
make:
    make

# Replace only the Helio local marketplace/plugins for the selected host.
install host:
    bun run scripts/install.ts {{quote(host)}}

# Zip each ChatGPT app-reference bundle (specs with mcp.openai.appId) into out/,
# ready to upload on the ChatGPT web Plugins page.
package: make
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf out && mkdir out
    for bundle in plugins/*/_generated/openai-app; do
      [ -d "$bundle" ] || continue
      name=$(basename "${bundle%/_generated/openai-app}")
      (cd "$bundle" && zip -qrX "$OLDPWD/out/helioadditive-$name-chatgpt.zip" .)
    done
    ls out
