// OpenAI plugin metadata; generated at plugins/openai/.codex-plugin/plugin.json.
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
      'Create a slicing job for my 3D model.',
      'Check the status of my Helio slicing job.',
      'Get a download URL for my completed slice.',
    ],
  },
  extensions: {
    'com.openai': {
      onboardingSkill: './skills/setup/SKILL.md',
    },
  },
}
