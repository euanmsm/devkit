export const db = {
  name: 'db',
  description: 'Postgres — push, pull, reset, dump',
  sections: [
    {
      title: 'db — Manage Postgres databases',
      items: [
        {
          kind: 'cmd',
          name: 'supabase db diff',
          desc: 'Diff schema changes',
          children: [
            {
              kind: 'flag',
              name: '-f, --file <path>',
              desc: 'Save as migration file',
            },
            {
              kind: 'flag',
              name: '-s, --schema <names>',
              desc: 'Schemas to include',
            },
            {
              kind: 'flag',
              name: '--linked',
              desc: 'Diff local vs linked project',
            },
            {
              kind: 'flag',
              name: '--local',
              desc: 'Diff local migrations vs local db (default)',
            },
            {
              kind: 'flag',
              name: '--db-url <url>',
              desc: 'Diff against specific database',
            },
            { kind: 'flag', name: '--use-migra', desc: 'Use migra (default)' },
            {
              kind: 'flag',
              name: '--use-pg-schema',
              desc: 'Use pg-schema-diff',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase db dump',
          desc: 'Dump data/schema from remote',
          children: [
            { kind: 'flag', name: '-f, --file <path>', desc: 'Save to file' },
            {
              kind: 'flag',
              name: '-s, --schema <names>',
              desc: 'Schemas to include',
            },
            { kind: 'flag', name: '--data-only', desc: 'Dump data only' },
            { kind: 'flag', name: '--role-only', desc: 'Dump roles only' },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Source database',
            },
            {
              kind: 'flag',
              name: '--keep-comments',
              desc: 'Keep pg_dump comments',
            },
            {
              kind: 'flag',
              name: '--use-copy',
              desc: 'Use COPY instead of INSERT',
            },
            {
              kind: 'flag',
              name: '-x, --exclude <tables>',
              desc: 'Exclude tables (data-only)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase db lint',
          desc: 'Check for typing errors',
          children: [
            {
              kind: 'flag',
              name: '-s, --schema <names>',
              desc: 'Schemas to include',
            },
            {
              kind: 'flag',
              name: '--level <warning|error>',
              desc: 'Error level to show',
            },
            {
              kind: 'flag',
              name: '--fail-on <none|warning|error>',
              desc: 'Fail threshold',
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
          name: 'supabase db pull [<name>]',
          desc: 'Pull schema from remote',
          children: [
            {
              kind: 'flag',
              name: '-s, --schema <names>',
              desc: 'Schemas to include',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Source database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase db push',
          desc: 'Push migrations to remote',
          children: [
            { kind: 'flag', name: '--dry-run', desc: "Show but don't apply" },
            {
              kind: 'flag',
              name: '--include-all',
              desc: 'Include all missing migrations',
            },
            {
              kind: 'flag',
              name: '--include-roles',
              desc: 'Include roles.sql',
            },
            { kind: 'flag', name: '--include-seed', desc: 'Include seed data' },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase db reset',
          desc: 'Reset to current migrations',
          children: [
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Target database',
            },
            { kind: 'flag', name: '--no-seed', desc: 'Skip running seed' },
            {
              kind: 'flag',
              name: '--version <ver>',
              desc: 'Reset up to version',
            },
            {
              kind: 'flag',
              name: '--last <n>',
              desc: 'Reset last n migrations',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase db start',
          desc: 'Start local Postgres',
          children: [
            {
              kind: 'flag',
              name: '--from-backup <path>',
              desc: 'Restore from backup',
            },
          ],
        },
      ],
    },
  ],
};
