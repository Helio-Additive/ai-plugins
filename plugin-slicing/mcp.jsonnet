// OAuth endpoints are discovered from each MCP resource, not hardcoded here.
function(provider='openai')
{
  mcpServers: {
    'helioadditive-slicing': {
      type: 'http',
      url: if provider == 'localhost' then 'https://mcp.helio-local.svc.cluster.local:8444/openai/slicing'
           else if provider == 'anthropic' then 'https://mcp.helioadditive.com/slicing'
           else 'https://mcp.helioadditive.com/openai/slicing',
    } + (if provider == 'anthropic' then {
      oauth: { clientId: 'generic-agent' },
    } else {
      scopes: ['slicing'],
      oauth: {
        clientId: 'openai-slicer-plugin',
        callbackUrl: 'http://127.0.0.1/callback',
      },
    }),
  },
}
