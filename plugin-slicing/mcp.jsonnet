// OpenAI MCP configuration; generated at plugins/openai/.mcp.json.
{
  mcpServers: {
    'helio-slicing': {
      type: 'http',
      url: 'https://mcp3.helioadditive.com/openai/slicing',
      scopes: ['slicing'],
      oauth: {
        clientId: 'openai-slicer-plugin',
        callbackUrl: 'http://127.0.0.1/callback',
      },
    },
  },
}
