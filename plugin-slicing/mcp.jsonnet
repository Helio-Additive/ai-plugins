// OAuth endpoints are discovered from each MCP resource, not hardcoded here.
function(provider='openai', environment='production')
local hosts = {
  nightly: 'mcp3.helioadditive.com',
  staging: 'mcp2.helioadditive.com',
  production: 'mcp.helioadditive.com',
};
assert std.member(['localhost', 'orbstack', 'openai', 'anthropic'], provider): 'Unknown plugin provider';
assert std.objectHas(hosts, environment): 'Unknown hosted environment';
{
  mcpServers: {
    'helioadditive-slicing': {
      type: 'http',
      url: if provider == 'localhost' then 'https://' + hosts[environment] + '/openai/slicing'
           else if provider == 'orbstack' then 'https://mcp.helio-local.svc.cluster.local:8444/openai/slicing'
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
