export const update = {
  name: 'update',
  description: 'Update CLI',
  sections: [
    {
      title: 'Update',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw update',
          desc: 'Update OpenClaw (auto-detects git or npm)',
          children: [
            {
              kind: 'flag',
              name: '--channel <ch>',
              desc: 'stable | beta | dev',
            },
            {
              kind: 'flag',
              name: '--tag <version>',
              desc: 'One-off update to specific version',
            },
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Preview without making changes',
            },
            {
              kind: 'flag',
              name: '--no-restart',
              desc: 'Skip restarting gateway after update',
            },
            {
              kind: 'flag',
              name: '--yes',
              desc: 'Skip confirmation prompts',
            },
            {
              kind: 'flag',
              name: '--timeout <seconds>',
              desc: 'Operation timeout',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw update status',
          desc: 'Check for CLI updates',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--timeout <seconds>',
              desc: 'Operation timeout',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw update wizard',
          desc: 'Interactive update wizard',
        },
      ],
    },
  ],
};
