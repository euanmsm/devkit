export const config = {
  name: 'config',
  description: 'Non-interactive config helpers',
  sections: [
    {
      title: 'Config — Non-Interactive Helpers',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw config',
          desc: 'Start guided interactive setup',
        },
        {
          kind: 'cmd',
          name: 'openclaw config file',
          desc: 'Print the active config file path',
        },
        {
          kind: 'cmd',
          name: 'openclaw config get <path>',
          desc: 'Get a config value (dot/bracket notation)',
        },
        {
          kind: 'cmd',
          name: 'openclaw config set <path> <value>',
          desc: 'Set a config value',
          children: [
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Validate without writing',
            },
            {
              kind: 'flag',
              name: '--allow-exec',
              desc: 'Enable exec SecretRef checks',
            },
            {
              kind: 'flag',
              name: '--strict-json',
              desc: 'Require JSON5 parsing',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'note',
              text: '  SecretRef mode: --ref-provider <p> --ref-source <s> --ref-id <id>',
            },
            {
              kind: 'note',
              text: '  Provider mode:  --provider-source <env|file|exec> ...',
            },
            {
              kind: 'note',
              text: "  Batch mode:     --batch-json '<json>' | --batch-file <path>",
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw config unset <path>',
          desc: 'Remove a config value',
        },
        {
          kind: 'cmd',
          name: 'openclaw config validate',
          desc: 'Validate config against the schema',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON validation output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw config schema',
          desc: 'Print the JSON schema for openclaw.json',
        },
        {
          kind: 'cmd',
          name: 'openclaw configure',
          desc: 'Full interactive config wizard',
          children: [
            {
              kind: 'flag',
              name: '--section <section>',
              desc: 'Limit to specific section (repeatable)',
            },
            { kind: 'note', text: 'Config examples:' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw config set gateway.port 19001',
          desc: 'Change gateway port',
        },
        {
          kind: 'cmd',
          name: 'openclaw config set agents.defaults.model.primary anthropic/claude-sonnet-4-5',
          desc: '',
        },
        {
          kind: 'cmd',
          name: 'openclaw config set agents.defaults.heartbeat.every "2h"',
          desc: '',
        },
        {
          kind: 'cmd',
          name: 'openclaw config get channels.slack.enabled',
          desc: 'Check if Slack is enabled',
        },
      ],
    },
  ],
};
