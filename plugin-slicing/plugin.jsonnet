// OpenAI plugin metadata; generated at vendors/openai/.codex-plugin/plugin.json.
{
  name: 'helioadditive-slicing',
  version: '0.1.0',
  description: 'Create, monitor, and retrieve Helio Additive slicing jobs.',
  skills: './skills/',
  mcpServers: './.mcp.json',
  interface: {
    displayName: 'Helio Slicing',
    shortDescription: 'Create and track 3D-print slicing jobs.',
    longDescription: 'Connect to Helio Additive to create slicing jobs, check their progress, and retrieve completed outputs.',
    developerName: 'Helio-Additive',
    composerIcon: './assets/icon.png',
    composerIconDark: './assets/logo-dark.png',
    logo: './assets/logo.png',
    logoDark: './assets/logo-dark.png',
    category: 'Productivity',
    capabilities: ['Read', 'Write'],
    defaultPrompt: [
      'Slice this .stl file',
      'Show me my recent slices',
      'Check the progress of my slice',
    ],
  },
}
