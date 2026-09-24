export const tokens = {
  name: 'tokens',
  description: 'Service tokens',
  sections: [
    {
      title: 'Tokens',
      items: [
        {
          kind: 'cmd',
          name: 'infisical service-token create',
          desc: 'Create service token',
          children: [
            { kind: 'flag', name: '-n, --name <name>', desc: 'Token name' },
            {
              kind: 'flag',
              name: '-a, --access-level <read|write>',
              desc: 'Access level(s)',
            },
            {
              kind: 'flag',
              name: '-e, --expiry-seconds <n>',
              desc: 'Expiry (0 = never, default: 86400)',
            },
            {
              kind: 'flag',
              name: '-s, --scope <env:path>',
              desc: 'Environment:path pairs',
            },
            { kind: 'flag', name: '--projectId <id>', desc: 'Project ID' },
            {
              kind: 'flag',
              name: '--token-only',
              desc: 'Print only token value',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical token renew <access-token>',
          desc: 'Renew universal auth token',
        },
      ],
    },
  ],
};
