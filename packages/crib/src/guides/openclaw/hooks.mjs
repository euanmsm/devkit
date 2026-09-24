export const hooks = {
  name: 'hooks',
  description: 'Internal agent hooks',
  sections: [
    {
      title: 'Hooks — Internal Agent Hooks',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw hooks list',
          desc: 'List internal agent hooks',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--eligible', desc: 'Ready hooks only' },
            {
              kind: 'flag',
              name: '-v, --verbose',
              desc: 'Include all details',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw hooks info <name>',
          desc: 'Get hook details',
        },
        {
          kind: 'cmd',
          name: 'openclaw hooks check',
          desc: 'Check hook readiness',
        },
        {
          kind: 'cmd',
          name: 'openclaw hooks enable <name>',
          desc: 'Enable a hook',
        },
        {
          kind: 'cmd',
          name: 'openclaw hooks disable <name>',
          desc: 'Disable a hook',
        },
      ],
    },
  ],
};
