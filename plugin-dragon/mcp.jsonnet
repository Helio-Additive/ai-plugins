// Matches the companion DevOps Dragon policy draft; hosted activation is pending.
{
  mcpServers: {
    'helioadditive-dragon': {
      type: 'http',
      url: 'https://mcp3.helioadditive.com/openai/dragon',
      scopes: ['dragon'],
      oauth: {
        clientId: 'openai-dragon-plugin',
        callbackUrl: 'http://127.0.0.1/callback',
      },
    },
  },
}
