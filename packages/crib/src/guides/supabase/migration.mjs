export const migration = {
  name: 'migration',
  description: 'Create, list and repair migrations',
  sections: [
    {
      title: 'migration — Manage migration scripts',
      items: [
        {
          kind: 'cmd',
          name: 'supabase migration new <name>',
          desc: 'Create empty migration',
        },
        {
          kind: 'cmd',
          name: 'supabase migration list',
          desc: 'List migrations',
          children: [
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Show applied migrations',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase migration up',
          desc: 'Apply pending migrations',
          children: [
            {
              kind: 'flag',
              name: '--include-all',
              desc: 'Include all missing',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase migration down',
          desc: 'Revert migrations',
          children: [
            {
              kind: 'flag',
              name: '--last <n>',
              desc: 'Revert last n (default 1)',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase migration repair <version>...',
          desc: 'Repair history table',
          children: [
            {
              kind: 'flag',
              name: '--status <applied|reverted>',
              desc: 'Status to set',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase migration squash',
          desc: 'Squash to single file',
          children: [
            {
              kind: 'flag',
              name: '--version <ver>',
              desc: 'Squash up to version',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase migration fetch',
          desc: 'Fetch from history table',
          children: [
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Source database',
            },
          ],
        },
      ],
    },
  ],
};
