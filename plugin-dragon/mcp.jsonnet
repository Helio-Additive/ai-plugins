// Discover OAuth endpoints from each MCP resource. Generation is not activation.
function(provider='openai', environment='production')
local hosts = {
  nightly: 'mcp3.helioadditive.com',
  staging: 'mcp2.helioadditive.com',
  production: 'mcp.helioadditive.com',
};
assert std.member(['localhost', 'openai', 'anthropic'], provider): 'Unknown plugin provider';
assert std.objectHas(hosts, environment): 'Unknown hosted environment';
{
  mcpServers: {
    'helioadditive-dragon': {
      type: 'http',
      url: if provider == 'localhost' then 'https://' + hosts[environment] + '/openai/dragon'
           else if provider == 'anthropic' then 'https://mcp.helioadditive.com/dragon'
           else 'https://mcp.helioadditive.com/openai/dragon',
      oauth: if provider == 'anthropic' then {
        clientId: 'generic-agent',
        scopes: 'dragon',
      } else {
        clientId: 'openai-dragon-plugin',
        callbackUrl: 'http://127.0.0.1/callback',
      },
    } + (if provider == 'anthropic' then {} else { scopes: ['dragon'] }),
  },
}
