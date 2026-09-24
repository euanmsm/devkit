export const inspect = {
  name: 'inspect',
  description: 'Database inspection and performance',
  sections: [
    {
      title: 'inspect — Database inspection tools',
      items: [
        {
          kind: 'note',
          text: 'Parent flags: --db-url <url> / --linked (default) / --local',
        },
        {
          kind: 'cmd',
          name: 'supabase inspect report',
          desc: 'Generate CSV for all inspections',
          children: [
            {
              kind: 'flag',
              name: '--output-dir <path>',
              desc: 'Save directory',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase inspect db <subcommand>',
          desc: 'DB inspection queries',
          children: [
            {
              kind: 'subcmd',
              name: 'bloat',
              desc: 'Estimate dead tuple space',
            },
            { kind: 'subcmd', name: 'blocking', desc: 'Queries holding locks' },
            { kind: 'subcmd', name: 'calls', desc: 'Queries by call count' },
            {
              kind: 'subcmd',
              name: 'db-stats',
              desc: 'Cache hit rates, sizes, WAL',
            },
            { kind: 'subcmd', name: 'index-stats', desc: 'Index usage stats' },
            { kind: 'subcmd', name: 'locks', desc: 'Exclusive lock queries' },
            {
              kind: 'subcmd',
              name: 'long-running-queries',
              desc: 'Queries running > 5 min',
            },
            {
              kind: 'subcmd',
              name: 'outliers',
              desc: 'Queries by total execution time',
            },
            {
              kind: 'subcmd',
              name: 'replication-slots',
              desc: 'Replication slot info',
            },
            { kind: 'subcmd', name: 'role-stats', desc: 'Role information' },
            {
              kind: 'subcmd',
              name: 'table-stats',
              desc: 'Table size + row estimates',
            },
            {
              kind: 'subcmd',
              name: 'traffic-profile',
              desc: 'Read/write I/O ratio',
            },
            {
              kind: 'subcmd',
              name: 'vacuum-stats',
              desc: 'Vacuum stats per table',
            },
          ],
        },
      ],
    },
  ],
};
