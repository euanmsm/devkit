export const env = {
  name: 'env',
  description: 'Environment variables',
  sections: [
    {
      title: 'Environment Variables',
      items: [
        {
          kind: 'cmd',
          name: 'OPENCLAW_HOME',
          desc: 'Base directory (default: ~/.openclaw)',
        },
        {
          kind: 'cmd',
          name: 'OPENCLAW_CONFIG_PATH',
          desc: 'Override config file location',
        },
        {
          kind: 'cmd',
          name: 'OPENCLAW_LOG_LEVEL',
          desc: 'Log level: debug | info | warn | error',
        },
        {
          kind: 'cmd',
          name: 'OPENCLAW_LOG_FORMAT',
          desc: 'Structured logging: json',
        },
        {
          kind: 'cmd',
          name: 'OPENCLAW_GATEWAY_TOKEN',
          desc: 'Gateway auth token',
        },
        {
          kind: 'cmd',
          name: 'OPENCLAW_GATEWAY_PASSWORD',
          desc: 'Gateway auth password',
        },
        {
          kind: 'cmd',
          name: 'NO_COLOR=1',
          desc: 'Disable ANSI styling (standard)',
        },
        {
          kind: 'cmd',
          name: 'ANTHROPIC_API_KEY',
          desc: 'Anthropic API key',
        },
        {
          kind: 'cmd',
          name: 'OPENAI_API_KEY',
          desc: 'OpenAI API key',
        },
        {
          kind: 'cmd',
          name: 'OPENROUTER_API_KEY',
          desc: 'OpenRouter API key',
        },
        {
          kind: 'cmd',
          name: 'TELEGRAM_BOT_TOKEN',
          desc: 'Telegram bot token',
        },
        {
          kind: 'cmd',
          name: 'DISCORD_BOT_TOKEN',
          desc: 'Discord bot token',
          children: [
            {
              kind: 'note',
              text: 'Env resolution order: process env > .env (cwd) > ~/.openclaw/.env > env.vars in config',
            },
          ],
        },
      ],
    },
  ],
};
