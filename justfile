# Generate plugin packages from TypeScript, MDX, and shared assets.
# Optional local bundles: GENERATE_TEST=true MCP_TEST_URL=<base URL> just make
make:
    make

# Replace only the Helio local marketplace/plugins for the selected host.
install host:
    bun run scripts/install.ts {{quote(host)}}
