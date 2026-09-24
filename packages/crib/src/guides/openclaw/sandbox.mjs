export const sandbox = {
  name: 'sandbox',
  description: 'Docker agent isolation',
  sections: [
    {
      title: 'Sandbox — Docker Agent Isolation',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw sandbox list',
          desc: 'List sandbox runtimes and status',
          children: [
            { kind: 'flag', name: '--browser', desc: 'Browser sandbox only' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw sandbox recreate',
          desc: 'Recreate sandbox runtimes',
          children: [
            { kind: 'flag', name: '--all', desc: 'All runtimes' },
            {
              kind: 'flag',
              name: '--session <key>',
              desc: 'Specific session',
            },
            { kind: 'flag', name: '--agent <id>', desc: 'Specific agent' },
            { kind: 'flag', name: '--browser', desc: 'Browser only' },
            { kind: 'flag', name: '--force', desc: 'Force recreation' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw sandbox explain',
          desc: 'Explain effective sandbox/tool policy',
          children: [
            {
              kind: 'flag',
              name: '--session <key>',
              desc: 'Specific session',
            },
            { kind: 'flag', name: '--agent <id>', desc: 'Specific agent' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
      ],
    },
  ],
};
