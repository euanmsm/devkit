export const sessions = {
  name: 'sessions',
  description: 'Conversation state',
  sections: [
    {
      title: 'Sessions — Conversation State',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw sessions',
          desc: 'List stored conversation sessions',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--verbose', desc: 'Include all details' },
            {
              kind: 'flag',
              name: '--store <path>',
              desc: 'Custom session store path',
            },
            {
              kind: 'flag',
              name: '--active <minutes>',
              desc: 'Filter by activity window',
            },
            {
              kind: 'flag',
              name: '--agent <id>',
              desc: 'Filter by specific agent',
            },
            {
              kind: 'flag',
              name: '--all-agents',
              desc: 'Show sessions across all agents',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw sessions cleanup',
          desc: 'Remove expired or orphaned sessions',
          children: [
            {
              kind: 'flag',
              name: '--fix-missing',
              desc: 'Prune entries with missing transcript files',
            },
          ],
        },
      ],
    },
  ],
};
