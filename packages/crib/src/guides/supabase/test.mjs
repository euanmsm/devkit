export const test = {
  name: 'test',
  description: 'Run database tests',
  sections: [
    {
      title: 'test — Run tests',
      items: [
        {
          kind: 'cmd',
          name: 'supabase test db [<path>...]',
          desc: 'Run pgTAP tests',
          children: [
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
            { kind: 'flag', name: '--db-url <url>', desc: 'Custom database' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase test new <name>',
          desc: 'Create test file',
          children: [
            {
              kind: 'flag',
              name: '-t, --template <pgtap>',
              desc: 'Template framework',
            },
          ],
        },
      ],
    },
  ],
};
