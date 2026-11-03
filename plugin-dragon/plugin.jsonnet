// OpenAI plugin metadata; generated at vendors/openai/.codex-plugin/plugin.json.
{
  name: 'helioadditive-dragon',
  version: '0.1.0',
  description: 'Prepare, run, monitor, and retrieve Helio Dragon thermal workflows.',
  skills: './skills/',
  mcpServers: './.mcp.json',
  interface: {
    displayName: 'Helio Dragon',
    shortDescription: 'Assess and enhance G-code safely.',
    longDescription: 'Connect to Helio Additive to prepare, run, monitor, and retrieve standard Dragon thermal assessments and G-code enhancements.',
    developerName: 'Helio-Additive',
    composerIcon: './assets/icon.png',
    composerIconDark: './assets/logo-dark.png',
    logo: './assets/logo.png',
    logoDark: './assets/logo-dark.png',
    category: 'Productivity',
    capabilities: ['Read', 'Write'],
    defaultPrompt: [
      'Prepare this G-code for a Dragon assessment',
      'Check the progress of my Dragon run',
      'Download my Dragon result',
    ],
  },
  extensions: {
    'com.openai': {
      onboardingSkill: './skills/setup/SKILL.md',
    },
  },
}
