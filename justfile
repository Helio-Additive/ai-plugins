# Generate plugin packages from TypeScript, MDX, and shared assets.
# Optional local bundles: GENERATE_TEST=true MCP_TEST_URL=<base URL> just make
make:
    make

# Replace only the Helio local marketplace/plugins for the selected host.
install host:
    bun run scripts/install.ts {{quote(host)}}

# Zip the ChatGPT upload packages into out/. No argument: official packages, refused
# unless they use the production server. With a base URL: test packages for that server.
package url="":
    bun run scripts/package.ts {{quote(url)}}
