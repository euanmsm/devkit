export const webhooks = {
  name: 'webhooks',
  description: 'External integrations (Gmail, etc)',
  sections: [
    {
      title: 'Webhooks — External Integrations',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw webhooks gmail setup',
          desc: 'Configure Gmail Pub/Sub integration',
          children: [
            {
              kind: 'flag',
              name: '--account <email>',
              desc: 'Gmail account (required)',
            },
            { kind: 'flag', name: '--project <id>', desc: 'GCP project' },
            { kind: 'flag', name: '--topic <name>', desc: 'Pub/Sub topic' },
            {
              kind: 'flag',
              name: '--subscription <name>',
              desc: 'Pub/Sub subscription',
            },
            { kind: 'flag', name: '--label <label>', desc: 'Gmail label' },
            { kind: 'flag', name: '--hook-url <url>', desc: 'Webhook URL' },
            {
              kind: 'flag',
              name: '--hook-token <token>',
              desc: 'Webhook token',
            },
            {
              kind: 'flag',
              name: '--push-token <token>',
              desc: 'Push token',
            },
            { kind: 'flag', name: '--bind <address>', desc: 'Bind address' },
            { kind: 'flag', name: '--port <port>', desc: 'Server port' },
            { kind: 'flag', name: '--path <path>', desc: 'Webhook path' },
            {
              kind: 'flag',
              name: '--include-body',
              desc: 'Include email body',
            },
            { kind: 'flag', name: '--max-bytes <n>', desc: 'Maximum bytes' },
            {
              kind: 'flag',
              name: '--renew-minutes <n>',
              desc: 'Renewal interval',
            },
            { kind: 'flag', name: '--tailscale', desc: 'Use Tailscale' },
            {
              kind: 'flag',
              name: '--push-endpoint <url>',
              desc: 'Push endpoint',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw webhooks gmail run',
          desc: 'Run Gmail watcher (same options as setup)',
        },
      ],
    },
  ],
};
