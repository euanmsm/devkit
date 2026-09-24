export const setup = {
  name: 'setup',
  description: 'Setup, onboarding & shell completion',
  sections: [
    {
      title: 'Setup & Onboarding',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw setup',
          desc: 'Initialize config and workspace directory',
          children: [
            {
              kind: 'flag',
              name: '--workspace <dir>',
              desc: 'Agent workspace path (default: ~/.openclaw/workspace)',
            },
            { kind: 'flag', name: '--wizard', desc: 'Run onboarding wizard' },
            {
              kind: 'flag',
              name: '--non-interactive',
              desc: 'Run without prompts (for Docker/CI)',
            },
            {
              kind: 'flag',
              name: '--mode <local|remote>',
              desc: 'Onboard mode',
            },
            {
              kind: 'flag',
              name: '--remote-url <url>',
              desc: 'Remote gateway URL',
            },
            {
              kind: 'flag',
              name: '--remote-token <token>',
              desc: 'Remote gateway token',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw onboard',
          desc: 'Interactive onboarding wizard for gateway, workspace, skills',
          children: [
            {
              kind: 'flag',
              name: '--install-daemon',
              desc: 'Also install as system service',
            },
            {
              kind: 'flag',
              name: '--no-install-daemon',
              desc: 'Skip daemon installation',
            },
            {
              kind: 'flag',
              name: '--skip-daemon',
              desc: 'Alias for --no-install-daemon',
            },
            {
              kind: 'flag',
              name: '--daemon-runtime <node|bun>',
              desc: 'Daemon runtime (node recommended)',
            },
            {
              kind: 'flag',
              name: '--reset',
              desc: 'Reset config/creds/sessions before onboarding',
            },
            {
              kind: 'flag',
              name: '--reset-scope <scope>',
              desc: 'config | config+creds+sessions | full',
            },
            {
              kind: 'flag',
              name: '--non-interactive',
              desc: 'Skip all prompts',
            },
            {
              kind: 'flag',
              name: '--mode <local|remote>',
              desc: 'Local or remote mode',
            },
            {
              kind: 'flag',
              name: '--flow <flow>',
              desc: 'quickstart | advanced | manual',
            },
            {
              kind: 'flag',
              name: '--auth-choice <provider>',
              desc: 'Auth method (chutes, openai-api-key, github-copilot, custom-api-key, skip, ...)',
            },
            {
              kind: 'flag',
              name: '--secret-input-mode <mode>',
              desc: 'plaintext | ref (env reference)',
            },
            {
              kind: 'flag',
              name: '--anthropic-api-key <key>',
              desc: 'Provide Anthropic API key',
            },
            {
              kind: 'flag',
              name: '--openai-api-key <key>',
              desc: 'Provide OpenAI API key',
            },
            {
              kind: 'flag',
              name: '--mistral-api-key <key>',
              desc: 'Provide Mistral API key',
            },
            {
              kind: 'flag',
              name: '--openrouter-api-key <key>',
              desc: 'Provide OpenRouter API key',
            },
            {
              kind: 'flag',
              name: '--gemini-api-key <key>',
              desc: 'Provide Gemini API key',
            },
            {
              kind: 'flag',
              name: '--custom-base-url <url>',
              desc: 'Custom provider base URL',
            },
            {
              kind: 'flag',
              name: '--custom-model-id <id>',
              desc: 'Custom model identifier',
            },
            {
              kind: 'flag',
              name: '--custom-api-key <key>',
              desc: 'Custom API key',
            },
            {
              kind: 'flag',
              name: '--gateway-port <port>',
              desc: 'Gateway port',
            },
            {
              kind: 'flag',
              name: '--gateway-bind <mode>',
              desc: 'loopback | lan | tailnet | auto | custom',
            },
            {
              kind: 'flag',
              name: '--gateway-auth <mode>',
              desc: 'token | password',
            },
            {
              kind: 'flag',
              name: '--gateway-token <token>',
              desc: 'Gateway auth token value',
            },
            {
              kind: 'flag',
              name: '--gateway-token-ref-env <name>',
              desc: 'Store token as env SecretRef',
            },
            {
              kind: 'flag',
              name: '--gateway-password <password>',
              desc: 'Gateway password',
            },
            {
              kind: 'flag',
              name: '--tailscale <mode>',
              desc: 'off | serve | funnel',
            },
            {
              kind: 'flag',
              name: '--tailscale-reset-on-exit',
              desc: 'Reset Tailscale on exit',
            },
            {
              kind: 'flag',
              name: '--skip-channels',
              desc: 'Skip channel setup',
            },
            { kind: 'flag', name: '--skip-skills', desc: 'Skip skill setup' },
            {
              kind: 'flag',
              name: '--skip-search',
              desc: 'Skip search setup',
            },
            {
              kind: 'flag',
              name: '--skip-health',
              desc: 'Skip health checks',
            },
            { kind: 'flag', name: '--skip-ui', desc: 'Skip UI setup' },
            {
              kind: 'flag',
              name: '--node-manager <mgr>',
              desc: 'npm | pnpm | bun (for skill installs)',
            },
            {
              kind: 'flag',
              name: '--workspace <dir>',
              desc: 'Workspace directory',
            },
            {
              kind: 'flag',
              name: '--yes',
              desc: 'Accept defaults without prompting',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw configure',
          desc: 'Interactive config wizard for models, channels, skills, gateway',
          children: [
            {
              kind: 'flag',
              name: '--section <section>',
              desc: 'Limit wizard to specific section (repeatable)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw completion',
          desc: 'Generate shell completion scripts',
          children: [
            {
              kind: 'flag',
              name: '-s, --shell <shell>',
              desc: 'zsh | bash | powershell | fish',
            },
            {
              kind: 'flag',
              name: '-i, --install',
              desc: 'Install completion into shell profile',
            },
            {
              kind: 'flag',
              name: '--write-state',
              desc: 'Cache completion script',
            },
            {
              kind: 'flag',
              name: '-y, --yes',
              desc: 'Confirm without prompting',
            },
          ],
        },
      ],
    },
  ],
};
